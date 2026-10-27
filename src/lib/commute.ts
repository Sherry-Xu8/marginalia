import { get, set } from 'idb-keyval'
import { Bus, CarTaxiFront, Footprints } from 'lucide-react'
import { useEffect, useState, type ComponentType } from 'react'
import { distanceKm } from './geo'

// ---- The one function the rest of the app uses ----
//   getCommute(from, to, mode)  →  { km, minutes, approx }
// To change where travel times come from (e.g. Google), change only the "providers" below.

export type Mode = 'walk' | 'transit' | 'taxi'
export type Point = { lat: number; lon: number }
export type Commute = { mode: Mode; km: number; minutes: number; approx: boolean }

export const MODES: { id: Mode; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'walk', label: 'Walk', Icon: Footprints },
  { id: 'transit', label: 'Public transport', Icon: Bus },
  { id: 'taxi', label: 'Taxi', Icon: CarTaxiFront },
]

// ---- Estimates from straight-line distance (always available, shown as "approx.") ----
export function estimate(from: Point, to: Point, mode: Mode): Commute {
  const km = distanceKm(from, to)
  const minutes =
    mode === 'walk' ? (km / 5) * 60 : mode === 'transit' ? (km / 20) * 60 + 10 : (km / 25) * 60
  return { mode, km, minutes: Math.max(1, Math.round(minutes)), approx: true }
}

// ---- Real routes from the free OpenStreetMap routing servers (walking and driving) ----
// (The main public OSRM demo only knows driving, so walking uses OSM's own "foot" server.)
const TIMEOUT_MS = 6000
const ROUTERS: Partial<Record<Mode, string>> = {
  walk: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/',
  taxi: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
}

async function routed(from: Point, to: Point, mode: Mode): Promise<Commute | null> {
  const base = ROUTERS[mode]
  if (!base) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const url = `${base}${from.lon.toFixed(5)},${from.lat.toFixed(5)};${to.lon.toFixed(5)},${to.lat.toFixed(5)}?overview=false`
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    const data = (await res.json()) as { code?: string; routes?: { distance: number; duration: number }[] }
    const r = data.routes?.[0]
    if (data.code !== 'Ok' || !r) return null
    return { mode, km: r.distance / 1000, minutes: Math.max(1, Math.round(r.duration / 60)), approx: false }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ---- Public transport ----
// Estimated by default. If you later set up a small "proxy" web service that holds your Google
// Maps key and answers  GET <url>?from=lat,lon&to=lat,lon  with {"km":…, "minutes":…},
// put its address (not the key!) in VITE_TRANSIT_PROXY_URL and it will be used instead.
// The key itself must never be placed in this app's code — anyone could read it.
async function transitViaProxy(from: Point, to: Point): Promise<Commute | null> {
  const proxy = (import.meta.env as Record<string, string | undefined>).VITE_TRANSIT_PROXY_URL
  if (!proxy) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const q = `from=${from.lat.toFixed(5)},${from.lon.toFixed(5)}&to=${to.lat.toFixed(5)},${to.lon.toFixed(5)}`
    const res = await fetch(`${proxy}?${q}`, { signal: ctrl.signal })
    if (!res.ok) return null
    const d = (await res.json()) as { km?: number; minutes?: number }
    if (typeof d.minutes !== 'number' || typeof d.km !== 'number') return null
    return { mode: 'transit', km: d.km, minutes: Math.max(1, Math.round(d.minutes)), approx: false }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ---- Shared plumbing: remember answers, share in-flight requests, go easy on the servers ----
const memory = new Map<string, Commute>()
const inFlight = new Map<string, Promise<Commute>>()
const failedAt = new Map<string, number>()
let active = 0
const waiting: (() => void)[] = []

async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve))
  active++
  try {
    return await job()
  } finally {
    active--
    waiting.shift()?.()
  }
}

const keyOf = (a: Point, b: Point, mode: Mode) =>
  `commute:${mode}:${a.lat.toFixed(4)},${a.lon.toFixed(4)}:${b.lat.toFixed(4)},${b.lon.toFixed(4)}`

export function getCommute(from: Point, to: Point, mode: Mode): Promise<Commute> {
  const key = keyOf(from, to, mode)
  const known = memory.get(key)
  if (known) return Promise.resolve(known)
  const running = inFlight.get(key)
  if (running) return running

  const job = (async () => {
    // Recently failed? Don't hammer the server — use the estimate for a couple of minutes.
    if (Date.now() - (failedAt.get(key) ?? 0) < 120_000) return estimate(from, to, mode)
    try {
      const saved = await get<Commute>(key)
      if (saved) return saved
    } catch {
      // no saved copy available
    }
    const real = await limited(() => (mode === 'transit' ? transitViaProxy(from, to) : routed(from, to, mode)))
    if (!real) {
      failedAt.set(key, Date.now())
      return estimate(from, to, mode)
    }
    set(key, real).catch(() => {})
    return real
  })()
    .then((r) => {
      if (!r.approx) memory.set(key, r)
      return r
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, job)
  return job
}

// React helper: the estimate shows immediately, then is replaced by the real route if one arrives.
export function useCommute(from: Point | undefined, to: Point | undefined, mode: Mode): Commute | null {
  const [result, setResult] = useState<{ key: string; value: Commute } | null>(null)
  const key = from && to ? keyOf(from, to, mode) : ''
  useEffect(() => {
    if (!from || !to) return
    let live = true
    getCommute(from, to, mode).then((value) => live && setResult({ key, value }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!from || !to) return null
  return result?.key === key ? result.value : estimate(from, to, mode)
}

// ---- Links that open the route in a maps app ----
export function googleMapsUrl(from: Point, to: Point, mode: Mode): string {
  const travel = mode === 'walk' ? 'walking' : mode === 'transit' ? 'transit' : 'driving'
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}&travelmode=${travel}`
}

export function appleMapsUrl(from: Point, to: Point, mode: Mode): string {
  const flag = mode === 'walk' ? 'w' : mode === 'transit' ? 'r' : 'd'
  return `https://maps.apple.com/?saddr=${from.lat},${from.lon}&daddr=${to.lat},${to.lon}&dirflg=${flag}`
}

// ---- Formatting ----
export function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`
}

export function fmtKm(km: number): string {
  return km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1)} km`
}

export const LONG_TRAVEL_MINUTES = 150

// Until you choose, short hops are a walk and longer ones public transport.
export const WALK_BELOW_KM = 1.2
export function defaultModeFor(from: Point, to: Point): Mode {
  return distanceKm(from, to) <= WALK_BELOW_KM ? 'walk' : 'transit'
}
