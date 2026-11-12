import { get, set } from 'idb-keyval'

// Looks up a place name for a point using OpenStreetMap's free Nominatim service.
// Their usage rules: at most one request per second, no bulk use, and results should
// be cached. So: requests are spaced out, and every answer is remembered on this device.

const MIN_GAP_MS = 1100
const TIMEOUT_MS = 8000
let lastRequestAt = 0

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Address = Record<string, string | undefined>

// Prefer a city-level name; fall back to wider areas.
function pickName(a: Address | undefined): string | null {
  if (!a) return null
  const order = ['city', 'town', 'municipality', 'county', 'village', 'state_district', 'suburb', 'state']
  // Korean city names come back as "Gyeongju-si"; drop the "-si" ("city") ending.
  for (const k of order) if (a[k]) return a[k]!.replace(/-si$/, '')
  return null
}

export async function reverseGeocodeName(lat: number, lon: number): Promise<string | null> {
  const key = `geocode:${lat.toFixed(2)},${lon.toFixed(2)}` // ~1 km precision is plenty for a city name
  try {
    const cached = await get<string>(key)
    if (cached) return cached
  } catch {
    // no cache available — carry on
  }

  const wait = lastRequestAt + MIN_GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const url =
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=en' +
      `&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = (await res.json()) as { address?: Address }
    const name = pickName(data.address)
    if (name) set(key, name).catch(() => {})
    return name
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ---- What is this place? (used to tag places the name alone can't place) ----
// Asks Nominatim for the named place within a few hundred metres and reports what OpenStreetMap calls it
// (for example class "tourism", type "attraction"). Same rules as above, and every answer is remembered.

let queue: Promise<unknown> = Promise.resolve()
const inLine = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn)
  queue = run.then(() => undefined, () => undefined)
  return run
}

export type OsmKind = { class: string; type: string }

// undefined = couldn't ask (try again later); null = asked, nothing there.
export function osmKindNear(name: string, lat: number, lon: number): Promise<OsmKind | null | undefined> {
  const key = `osmkind:${name.toLowerCase()}|${lat.toFixed(4)},${lon.toFixed(4)}`
  return inLine(async () => {
    try {
      const cached = await get<OsmKind | 'none'>(key)
      if (cached) return cached === 'none' ? null : cached
    } catch {
      // no cache available — carry on
    }
    const wait = lastRequestAt + MIN_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    const d = 0.004 // about 450 m each way
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en&bounded=1' +
      `&viewbox=${(lon - d).toFixed(5)},${(lat + d).toFixed(5)},${(lon + d).toFixed(5)},${(lat - d).toFixed(5)}` +
      `&q=${encodeURIComponent(name)}`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      if (!res.ok) return undefined
      const rows = (await res.json()) as { lat: string; lon: string; category?: string; class?: string; type?: string }[]
      const hit = rows.find((r) => (r.category ?? r.class) && r.type && Math.hypot((+r.lat - lat) * 111000, (+r.lon - lon) * 111000 * Math.cos((lat * Math.PI) / 180)) <= 300)
      const kind = hit ? { class: (hit.category ?? hit.class)!, type: hit.type! } : null
      set(key, kind ?? 'none').catch(() => {})
      return kind
    } catch {
      return undefined
    } finally {
      clearTimeout(timer)
    }
  })
}

// ---- Searching for a place by name (used to add a hotel) ----
// Same rules as above: one request per second, and only when you press Search.

export type FoundPlace = { name: string; address: string; lat: number; lon: number }

export async function searchPlaces(query: string, near?: { lat: number; lon: number }): Promise<FoundPlace[] | null> {
  const wait = lastRequestAt + MIN_GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    let url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=en&q=' + encodeURIComponent(query)
    // Prefer results near the stop (but don't exclude others).
    if (near) {
      const d = 0.6
      url += `&viewbox=${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`
    }
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const rows = (await res.json()) as { name?: string; display_name: string; lat: string; lon: string }[]
    return rows.map((r) => ({
      name: r.name || r.display_name.split(',')[0],
      address: r.display_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
    }))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
