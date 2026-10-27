import { searchPlaces, type FoundPlace } from './geocode'

// Finding a spot from whatever you have: a name, an address, coordinates, or a Google Maps link.
// Korean-style addresses ("39 Gwangan-ro 62beon-gil, Suyeong-gu") are rarely indexed in full by the free
// OpenStreetMap search, so if the whole address finds nothing it is shortened step by step
// (house number, then lane, then street, then district) and the result is marked approximate.

export type Precision = 'exact' | 'street' | 'area'
export type Located = FoundPlace & { precision: Precision }

const num = '-?\\d{1,3}(?:\\.\\d+)?'

// "35.1534, 129.1186" or a Google Maps link containing the coordinates.
export function parseCoordinates(text: string): { lat: number; lon: number } | null {
  const candidates = [
    new RegExp(`@(${num}),(${num})`), // .../@35.15,129.11,17z
    new RegExp(`!3d(${num})!4d(${num})`), // .../data=!3d35.15!4d129.11
    new RegExp(`[?&](?:q|ll|query|destination)=(${num}),\\s*(${num})`),
    new RegExp(`^\\s*(${num})\\s*[,; ]\\s*(${num})\\s*$`), // plain "lat, lon"
  ]
  for (const re of candidates) {
    const m = text.match(re)
    if (m) {
      const lat = parseFloat(m[1])
      const lon = parseFloat(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon }
    }
  }
  return null
}

// Pasted addresses often lose a space between parts ("gilSuyeong-gu"): put it back.
const tidy = (q: string) =>
  q
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim()

function variantsOf(query: string): { q: string; precision: Precision }[] {
  const full = tidy(query)
  const parts = full.split(',').map((p) => p.trim()).filter(Boolean)
  const out: { q: string; precision: Precision }[] = [{ q: full, precision: 'exact' }]
  if (parts.length > 0) {
    // without the house number
    const noNumber = parts[0].replace(/^\d+(?:-\d+)?\s+/, '')
    // without the lane ("62beon-gil" or "…-gil")
    const noLane = noNumber.replace(/\s*\b\w*(?:beon-?gil|-gil)\b/gi, '').trim()
    const rest = parts.slice(1)
    if (noNumber !== parts[0]) out.push({ q: [noNumber, ...rest].join(', '), precision: 'street' })
    if (noLane && noLane !== noNumber) out.push({ q: [noLane, ...rest].join(', '), precision: 'street' })
    // just the district and city
    if (parts.length >= 3) out.push({ q: parts.slice(-3, -1).join(', '), precision: 'area' })
    else if (rest.length > 0) out.push({ q: rest.join(', '), precision: 'area' })
  }
  return out.filter((v, i, all) => v.q && all.findIndex((x) => x.q.toLowerCase() === v.q.toLowerCase()) === i).slice(0, 4)
}

// Returns the matches, or null if the search service could not be reached.
export async function findLocation(query: string, near?: { lat: number; lon: number }): Promise<Located[] | null> {
  const exact = parseCoordinates(query)
  if (exact) {
    return [{ name: 'Pinned location', address: `${exact.lat.toFixed(5)}, ${exact.lon.toFixed(5)}`, ...exact, precision: 'exact' }]
  }
  let reached = false
  for (const v of variantsOf(query)) {
    const results = await searchPlaces(v.q, near)
    if (results === null) continue
    reached = true
    if (results.length > 0) return results.map((r) => ({ ...r, precision: v.precision }))
  }
  return reached ? [] : null
}
