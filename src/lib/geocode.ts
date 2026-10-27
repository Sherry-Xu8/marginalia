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
