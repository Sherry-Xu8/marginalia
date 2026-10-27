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

export type LookupResult = { status: 'found'; details: PlaceDetails } | { status: 'none' } | { status: 'unavailable' }

// OpenStreetMap listing nearby with a similar name: hours, website, phone, cuisine.
async function fromOpenStreetMap(place: Place): Promise<{ ok: boolean; details?: PlaceDetails; wiki?: string }> {
  const query = `[out:json][timeout:12];nwr(around:80,${place.lat.toFixed(6)},${place.lon.toFixed(6)})["name"];out tags center 60;`
  let data: { elements?: Element[] } | null = null
  for (const server of OVERPASS) {
    data = await getJson<{ elements?: Element[] }>(
      server,
      { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      9000,
    )
    if (data?.elements) break
  }
  if (!data?.elements) return { ok: false }

  // Best matching listing by name (they have to share at least one real word).
  const best = data.elements
    .filter((e) => e.tags)
    .map((e) => ({ tags: e.tags!, score: nameScore(place, e.tags!) }))
    .filter((x) => x.score >= 0.34)
    .sort((a, b) => b.score - a.score)[0]
  if (!best) return { ok: true }
  const t = best.tags
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
  return { ok: true, details, wiki: t.wikipedia }
}

type WikiSummary = { extract?: string; thumbnail?: { source?: string } }

// A Wikipedia article about this place (for well-known places): a description and a photo.
async function fromWikipedia(place: Place, taggedArticle?: string): Promise<{ summary?: string; imageUrl?: string } | null> {
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
    const mine = new Set([...words(place.name), ...words(englishPart(place.name) ?? '')])
    title = geo?.query?.geosearch?.find((g) => words(g.title).some((w) => mine.has(w)))?.title
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

export async function lookupPlace(place: Place): Promise<LookupResult> {
  // Both sources are asked at the same time; either may have nothing, or be busy.
  const [osm, wiki] = await Promise.all([fromOpenStreetMap(place), fromWikipedia(place)])
  const wikiViaTag = osm.wiki && !wiki ? await fromWikipedia(place, osm.wiki) : null
  const w = wiki ?? wikiViaTag

  if (!osm.ok && !w) return { status: 'unavailable' }
  const details: PlaceDetails = { ...osm.details }
  if (w) {
    details.summary = details.summary ?? w.summary
    details.imageUrl = details.imageUrl ?? w.imageUrl
  }
  details.source = osm.details && w ? 'OpenStreetMap and Wikipedia' : w ? 'Wikipedia' : osm.details ? 'OpenStreetMap' : undefined
  const useful = details.summary || details.website || details.hours || details.phone || details.cuisine || details.imageUrl
  return useful ? { status: 'found', details } : { status: 'none' }
}
