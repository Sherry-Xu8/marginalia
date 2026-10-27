import type { Place, Stop, Trip } from '../types'
import { getMapLabels, providerFor, tileCacheName, tileUrl, type TileProvider } from './tiles'

// Saving the map around a stop so it still shows with no signal. The tiles come from the same free map
// servers the app already uses, in a modest amount: city-level zooms over the area, and street level
// right around the places you've saved.

type Tile = { z: number; x: number; y: number }
export type Plan = { tiles: { url: string; provider: TileProvider }[]; megabytes: number }

const lonToX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z)
const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * 2 ** z)
}
const xToLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180
const yToLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI

const MAX_TILES = 1800
const KB_PER_TILE = 22

// Everything on the map for this stop: its saved places, and where you're staying.
export function stopPoints(stop: Stop, trip: Trip, all: { places: Place[]; groups: { id: string; stopId?: string }[] }): { lat: number; lon: number }[] {
  const ids = new Set(all.groups.filter((g) => g.stopId === stop.id).map((g) => g.id))
  const stayIds = new Set((trip.stays ?? []).filter((s) => s.checkIn < stop.departure && s.checkOut > stop.arrival).map((s) => s.placeId))
  return all.places.filter((p) => p.tripId === trip.id && ((p.groupId && ids.has(p.groupId)) || stayIds.has(p.id)))
}

export function planFor(points: { lat: number; lon: number }[]): Plan {
  if (points.length === 0) return { tiles: [], megabytes: 0 }
  const labels = getMapLabels()
  const pad = 0.02
  const minLat = Math.min(...points.map((p) => p.lat)) - pad
  const maxLat = Math.max(...points.map((p) => p.lat)) + pad
  const minLon = Math.min(...points.map((p) => p.lon)) - pad
  const maxLon = Math.max(...points.map((p) => p.lon)) + pad
  const chosen = new Map<string, Tile>()
  const add = (t: Tile) => chosen.set(`${t.z}/${t.x}/${t.y}`, t)
  // Zooms 12 to 15 across the whole area, as many as fit in the budget.
  for (const z of [12, 13, 14, 15]) {
    const x0 = lonToX(minLon, z), x1 = lonToX(maxLon, z), y0 = latToY(maxLat, z), y1 = latToY(minLat, z)
    const n = (x1 - x0 + 1) * (y1 - y0 + 1)
    if (chosen.size + n > MAX_TILES * 0.75 && z > 13) break
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) add({ z, x, y })
  }
  // Street level (zoom 16) right around each place.
  for (const p of points) {
    const cx = lonToX(p.lon, 16), cy = latToY(p.lat, 16)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (chosen.size >= MAX_TILES) break
      add({ z: 16, x: cx + dx, y: cy + dy })
    }
  }
  const tiles = [...chosen.values()].map((t) => {
    const provider = providerFor(t.z, yToLat(t.y + 0.5, t.z), xToLon(t.x + 0.5, t.z), labels)
    return { url: tileUrl(provider, t.z, t.x, t.y), provider }
  })
  return { tiles, megabytes: Math.round((tiles.length * KB_PER_TILE) / 1024) }
}

// ---- What's saved (remembered on this device) ----

const KEY = 'offline-maps'
type Saved = Record<string, { at: number; tiles: number }>
export function savedMaps(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}
function remember(stopId: string, tiles: number | null) {
  try {
    const all = savedMaps()
    if (tiles === null) delete all[stopId]
    else all[stopId] = { at: Date.now(), tiles }
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // not remembered — fine
  }
}

export const canSaveOffline = (): boolean => typeof caches !== 'undefined'

// Downloads the tiles gently (a few at a time) and puts them where the app's offline map cache is.
export async function downloadMap(
  stopId: string,
  plan: Plan,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ saved: number; failed: number }> {
  const stores = new Map<TileProvider, Cache>()
  for (const p of ['osm', 'esri'] as TileProvider[]) stores.set(p, await caches.open(tileCacheName(p)))
  let done = 0
  let saved = 0
  let failed = 0
  let next = 0
  void navigator.storage?.persist?.().catch(() => {})
  const worker = async () => {
    while (!signal.aborted) {
      const i = next++
      if (i >= plan.tiles.length) return
      const { url, provider } = plan.tiles[i]
      const cache = stores.get(provider)!
      try {
        if (!(await cache.match(url))) {
          const r = await fetch(url, { mode: 'cors', signal })
          if (r.ok) await cache.put(url, r)
          else failed++
        }
        saved++
      } catch {
        if (!signal.aborted) failed++
      }
      onProgress(++done, plan.tiles.length)
      await new Promise((res) => setTimeout(res, provider === 'osm' ? 120 : 40))
    }
  }
  await Promise.all([worker(), worker(), worker()])
  if (!signal.aborted && failed < plan.tiles.length / 4) remember(stopId, saved)
  return { saved, failed }
}

export async function removeMap(stopId: string, plan: Plan) {
  for (const p of ['osm', 'esri'] as TileProvider[]) {
    const cache = await caches.open(tileCacheName(p))
    await Promise.all(plan.tiles.filter((t) => t.provider === p).map((t) => cache.delete(t.url)))
  }
  remember(stopId, null)
}
