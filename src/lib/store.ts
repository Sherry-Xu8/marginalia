import { get, set } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import type { AppData, ImportSummary, Place, Stop, Trip } from '../types'
import type { ParseResult } from './kml'

// One small store holds everything and saves it to the browser (IndexedDB)
// after each change. Components read it with useAppData().

const KEY = 'trip-planner-data'
const empty: AppData = { version: 1, trips: [], places: [], activeTripId: null }

let state: AppData = empty
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | undefined

export async function loadData(): Promise<void> {
  try {
    const saved = await get<AppData>(KEY)
    if (saved && saved.version === 1) state = saved
  } catch {
    // Storage can be unavailable (e.g. private browsing) — start empty.
  }
}

function update(fn: (s: AppData) => AppData) {
  state = fn(state)
  listeners.forEach((l) => l())
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    set(KEY, state).catch(() => {})
  }, 200)
}

export function useAppData(): AppData {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ---- Trips and stops ----

export function addTrip(name: string, startDate: string, endDate: string) {
  const trip: Trip = { id: newId(), name, startDate, endDate, stops: [] }
  update((s) => ({ ...s, trips: [...s.trips, trip], activeTripId: trip.id }))
}

export function updateTrip(id: string, patch: Partial<Pick<Trip, 'name' | 'startDate' | 'endDate'>>) {
  update((s) => ({ ...s, trips: s.trips.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
}

export function deleteTrip(id: string) {
  update((s) => {
    const trips = s.trips.filter((t) => t.id !== id)
    return {
      ...s,
      trips,
      places: s.places.filter((p) => p.tripId !== id),
      activeTripId: s.activeTripId === id ? (trips[0]?.id ?? null) : s.activeTripId,
    }
  })
}

export function setActiveTrip(id: string) {
  update((s) => ({ ...s, activeTripId: id }))
}

function mapStops(tripId: string, fn: (stops: Stop[]) => Stop[]) {
  update((s) => ({
    ...s,
    trips: s.trips.map((t) => (t.id === tripId ? { ...t, stops: fn(t.stops) } : t)),
  }))
}

export function addStop(tripId: string, stop: Omit<Stop, 'id'>) {
  mapStops(tripId, (stops) => [...stops, { ...stop, id: newId() }])
}

export function updateStop(tripId: string, stopId: string, patch: Partial<Omit<Stop, 'id'>>) {
  mapStops(tripId, (stops) => stops.map((st) => (st.id === stopId ? { ...st, ...patch } : st)))
}

export function deleteStop(tripId: string, stopId: string) {
  mapStops(tripId, (stops) => stops.filter((st) => st.id !== stopId))
}

export function moveStop(tripId: string, stopId: string, direction: -1 | 1) {
  mapStops(tripId, (stops) => {
    const i = stops.findIndex((st) => st.id === stopId)
    const j = i + direction
    if (i < 0 || j < 0 || j >= stops.length) return stops
    const copy = [...stops]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    return copy
  })
}

// ---- Places ----

// Same name at (nearly) the same spot = the same place. 5 decimals ≈ 1 metre.
function dedupeKeyOf(name: string, lat: number, lon: number): string {
  return `${name.trim().toLowerCase()}|${lat.toFixed(5)}|${lon.toFixed(5)}`
}

export function importPlaces(tripId: string, parsed: ParseResult, fileName: string): ImportSummary {
  const existing = new Set(state.places.filter((p) => p.tripId === tripId).map((p) => p.dedupeKey))
  const added: Place[] = []
  let duplicates = 0
  const layerCounts = new Map<string, number>()

  for (const p of parsed.places) {
    layerCounts.set(p.layer, (layerCounts.get(p.layer) ?? 0) + 1)
    const key = dedupeKeyOf(p.name, p.lat, p.lon)
    if (existing.has(key)) {
      duplicates++
      continue
    }
    existing.add(key)
    added.push({ id: newId(), tripId, dedupeKey: key, ...p })
  }

  if (added.length > 0) update((s) => ({ ...s, places: [...s.places, ...added] }))

  return {
    fileName,
    found: parsed.places.length,
    added: added.length,
    duplicates,
    noLocation: parsed.noLocation,
    layers: [...layerCounts].map(([name, count]) => ({ name, count })),
  }
}

export function clearPlaces(tripId: string) {
  update((s) => ({ ...s, places: s.places.filter((p) => p.tripId !== tripId) }))
}
