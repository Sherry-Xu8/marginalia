import type { Place, PlaceDetails } from '../types'
import { englishPart } from './names'

// Looks a place up in free, open sources — no account or key needed:
//   • OpenStreetMap (via Overpass): opening hours, website, phone, cuisine, a short description
//   • Wikipedia / Wikimedia: a summary and a photo, for places notable enough to have a page
// Most small restaurants have only some of this. Google, Instagram and similar sites can't be read
// by an app like this one, so those are offered as search links instead (see PlaceSheet).

// Public Overpass servers; if one is busy (they often are) the next is tried.
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const TIMEOUT_MS = 15000

async function getJson<T>(url: string, init?: RequestInit, timeout = TIMEOUT_MS): Promise<T | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const words = (s: string): string[] =>
  s.toLowerCase().match(/[a-z0-9]{3,}|[가-힯]{2,}/g) ?? []

type Tags = Record<string, string | undefined>
type Element = { tags?: Tags; lat?: number; lon?: number; center?: { lat: number; lon: number } }

// How many of the place's words appear in a listing's names.
function nameScore(place: Place, tags: Tags): number {
  const mine = new Set([...words(place.name), ...words(englishPart(place.name) ?? '')])
  const theirs = new Set(
    ['name', 'name:en', 'name:ko', 'official_name', 'alt_name', 'brand', 'name:latin']
      .flatMap((k) => words(tags[k] ?? '')),
  )
  if (mine.size === 0 || theirs.size === 0) return 0
  let hits = 0
  mine.forEach((w) => {
    if (theirs.has(w) || [...theirs].some((t) => t.length > 3 && w.length > 3 && (t.includes(w) || w.includes(t)))) hits++
  })
  return hits / Math.min(mine.size, theirs.size)
}

const asUrl = (v: string | undefined): string | undefined => {
  if (!v) return undefined
  const t = v.trim().split(/[;\s]/)[0]
  const withScheme = /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+/.test(t) ? `https://${t}` : ''
  return /^https?:\/\/[^\s]+$/i.test(withScheme) ? withScheme : undefined
}

const tidy = (v: string | undefined) => v?.replace(/;/g, ', ').replace(/_/g, ' ')

export type LookupResult =
  | { status: 'found'; details: PlaceDetails; complete: boolean } // complete = every source answered
  | { status: 'none'; complete: boolean } // nothing found (complete=false: OpenStreetMap didn't answer, try again later)
  | { status: 'unavailable' } // couldn't reach anything at all

const distMetres = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const rad = Math.PI / 180
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  const y = (b.lat - a.lat) * rad
  return Math.sqrt(x * x + y * y) * 6371000
}

function detailsFromTags(t: Tags): { details: PlaceDetails; wiki?: string } {
  const details: PlaceDetails = {
    summary: t['description:en'] ?? t.description,
    website: asUrl(t.website ?? t['contact:website'] ?? t.url),
    hours: t.opening_hours,
    phone: t.phone ?? t['contact:phone'],
    cuisine: tidy(t.cuisine),
    source: 'OpenStreetMap',
  }
  const commons = t.wikimedia_commons?.startsWith('File:') ? t.wikimedia_commons.slice(5) : undefined
  if (commons) details.imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(commons)}?width=800`
  return { details, wiki: t.wikipedia }
}

// OpenStreetMap's public servers are often slow or busy. When they don't answer, they're left
// alone for a few minutes so photos and descriptions from Wikipedia aren't held up.
let overpassDownUntil = 0

// One Overpass request for a few places at once: everything named within 60 m of any of them.
// Returns null if no server answered.
async function overpassNear(places: Place[]): Promise<Element[] | null> {
  if (Date.now() < overpassDownUntil) return null
  const around = places.map((p) => `nwr(around:60,${p.lat.toFixed(6)},${p.lon.toFixed(6)})["name"];`).join('')
  const query = `[out:json][timeout:10];(${around});out tags center 300;`
  for (const server of OVERPASS) {
    const data = await getJson<{ elements?: Element[] }>(
      server,
      { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      9000,
    )
    if (data?.elements) return data.elements
  }
  overpassDownUntil = Date.now() + 4 * 60_000
  return null
}

type WikiSummary = { extract?: string; thumbnail?: { source?: string } }

// A Wikipedia article about this place (for well-known places): a description and a photo.
async function fromWikipedia(place: Place, taggedArticle?: string): Promise<{ summary?: string; imageUrl?: string } | null | undefined> {
  let lang = 'en'
  let title: string | undefined
  const tagged = taggedArticle?.match(/^([a-z-]+):(.+)$/)
  if (tagged) {
    lang = tagged[1]
    title = tagged[2]
  } else {
    const geo = await getJson<{ query?: { geosearch?: { title: string; dist: number }[] } }>(
      `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${place.lat}%7C${place.lon}&gsradius=300&gslimit=12&format=json&origin=*`,
      undefined,
      8000,
    )
    if (!geo) return undefined // the service didn't answer (different from "no article")
    const mine = new Set([...words(place.name), ...words(englishPart(place.name) ?? '')])
    title = geo.query?.geosearch?.find((g) => words(g.title).some((w) => mine.has(w)))?.title
  }
  if (!title) return null
  const w = await getJson<WikiSummary>(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    undefined,
    8000,
  )
  if (!w?.extract && !w?.thumbnail?.source) return null
  // The article's picture comes as a small thumbnail; ask for a larger standard size.
  return { summary: w.extract, imageUrl: w.thumbnail?.source?.replace(/\/\d+px-/, '/500px-') }
}

// Looks up several places, kindly: OpenStreetMap a few at a time, Wikipedia four at a time. Wikipedia
// is quick and reliable, so a slow OpenStreetMap never stops photos and descriptions arriving.
export async function lookupMany(places: Place[]): Promise<Map<string, LookupResult>> {
  const out = new Map<string, LookupResult>()
  if (places.length === 0) return out

  const elementsFor = new Map<string, Element[] | null>()
  const chunks: Place[][] = []
  for (let i = 0; i < places.length; i += 6) chunks.push(places.slice(i, i + 6))
  await Promise.all(
    chunks.map(async (chunk) => {
      const els = await overpassNear(chunk)
      chunk.forEach((p) => elementsFor.set(p.id, els))
    }),
  )

  const work = places.map((place) => async () => {
    const elements = elementsFor.get(place.id) ?? null
    let details: PlaceDetails | undefined
    let wikiTag: string | undefined
    if (elements) {
      const best = elements
        .filter((e) => e.tags)
        .map((e) => {
          const at = e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null)
          return { tags: e.tags!, at, score: nameScore(place, e.tags!) }
        })
        .filter((x) => x.at && distMetres(place, x.at) <= 70 && x.score >= 0.34)
        .sort((a, b) => b.score - a.score)[0]
      if (best) {
        const d = detailsFromTags(best.tags)
        details = d.details
        wikiTag = d.wiki
      }
    }
    let wiki = await fromWikipedia(place, wikiTag)
    if (wiki === null && wikiTag) wiki = undefined
    const wikiAnswered = wiki !== undefined
    const merged: PlaceDetails = { ...details }
    if (wiki) {
      merged.summary = merged.summary ?? wiki.summary
      merged.imageUrl = merged.imageUrl ?? wiki.imageUrl
    }
    merged.source = details && wiki ? 'OpenStreetMap and Wikipedia' : wiki ? 'Wikipedia' : details ? 'OpenStreetMap' : undefined
    const useful = merged.summary || merged.website || merged.hours || merged.phone || merged.cuisine || merged.imageUrl
    if (useful) out.set(place.id, { status: 'found', details: merged, complete: !!elements && wikiAnswered })
    else if (!wikiAnswered && !elements) out.set(place.id, { status: 'unavailable' })
    else out.set(place.id, { status: 'none', complete: !!elements && wikiAnswered })
  })

  const queue = [...work]
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) await job()
    }),
  )
  return out
}

export async function lookupPlace(place: Place): Promise<LookupResult> {
  return (await lookupMany([place])).get(place.id) ?? { status: 'unavailable' }
}

// Flags, emblems and maps make poor cover photos.
export const POOR_IMAGE = /flag_of|coat_of_arms|emblem|locator|location_map|map_of|seal_of|logo/i

// A photo of a city or country, from its Wikipedia article. "Singapore/Malaysia" tries the whole
// name, then each part. If the main picture is just a flag, the "Tourism in …" article is tried.
// Returns undefined if Wikipedia couldn't be reached (try again later), null if there's no photo.
export async function cityImage(name: string): Promise<string | null | undefined> {
  const candidates = [name, ...name.split(/[/,&]| and /i)].map((n) => n.trim()).filter((n, i, all) => n && all.indexOf(n) === i)
  let answered = false
  const thumb = async (title: string): Promise<string | null> => {
    const w = await getJson<{ type?: string; thumbnail?: { source?: string } }>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      undefined,
      8000,
    )
    if (w) answered = true
    const src = w && w.type !== 'disambiguation' ? w.thumbnail?.source : undefined
    return src && !POOR_IMAGE.test(src) ? src.replace(/\/\d+px-/, '/960px-') : null
  }
  for (const c of candidates) {
    const found = (await thumb(c)) ?? (await thumb(`Tourism in ${c}`))
    if (found) return found
  }
  return answered ? null : undefined
}
