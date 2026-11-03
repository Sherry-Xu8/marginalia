import { useSyncExternalStore } from 'react'
import { POOR_IMAGE, cityImage, lookupMany } from './lookup'
import { COVER_LOOKUP_VERSION, TAG_CHECK_VERSION, applyLookups, getState, setStopCover, setTripCover } from './store'
import type { Place } from '../types'

// Fetches photos, descriptions and opening hours for your places in the background, a few at a
// time, so you don't have to press anything. Places on your day plans go first. It can be switched
// off (it sends each place's name and location to OpenStreetMap and Wikipedia).

const KEY = 'auto-lookup'
export const isAutoLookupOn = (): boolean => {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}
export function setAutoLookup(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // not saved — fine
  }
  if (on) void runAutoLookup()
}

const DAY = 86_400_000
function needsLookup(p: Place, now: number): boolean {
  if (!p.lookup) return true
  // A place with no category gets one more look, now that the category guesses are better.
  if (!p.tag && p.tagSource !== 'user' && p.tagCheck !== TAG_CHECK_VERSION) return true
  const age = now - new Date(p.lookedUpAt ?? 0).getTime()
  if (p.lookup === 'none') return age > 30 * DAY
  if (p.lookup === 'partial') return age > 3_600_000
  return false
}

type Progress = { running: boolean; done: number; total: number }
let progress: Progress = { running: false, done: 0, total: 0 }
const listeners = new Set<() => void>()
const setProgress = (p: Progress) => {
  progress = p
  listeners.forEach((l) => l())
}
export const useLookupProgress = (): Progress =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => progress,
  )

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// A photo of each city for the stop cards.
async function findCovers() {
  for (const trip of getState().trips) {
    // A trip with no stops (just "Lisbon") gets a photo from its own name.
    if (trip.stops.length === 0) {
      const checked = trip.coverCheckedAt ? Date.now() - new Date(trip.coverCheckedAt).getTime() : Infinity
      if (!(trip.coverUrl && !POOR_IMAGE.test(trip.coverUrl)) && !(!trip.coverUrl && checked < 7 * DAY && trip.coverV === COVER_LOOKUP_VERSION)) {
        const url = await cityImage(trip.name)
        if (url !== undefined) setTripCover(trip.id, url ?? undefined)
      }
    }
    for (const stop of trip.stops) {
      const checked = stop.coverCheckedAt ? Date.now() - new Date(stop.coverCheckedAt).getTime() : Infinity
      // A cover that is only a flag or emblem is replaced with a real photo.
      if ((stop.coverUrl && !POOR_IMAGE.test(stop.coverUrl)) || (!stop.coverUrl && checked < 7 * DAY && stop.coverV === COVER_LOOKUP_VERSION)) continue
      const url = await cityImage(stop.name)
      if (url !== undefined) setStopCover(trip.id, stop.id, url ?? undefined)
    }
  }
}
let running = false
let retryAt = 0

export async function runAutoLookup() {
  if (running || !isAutoLookupOn() || Date.now() < retryAt || (typeof navigator !== 'undefined' && !navigator.onLine)) return
  running = true
  void findCovers()
  let done = 0
  let failures = 0
  try {
    for (;;) {
      const s = getState()
      const onDay = new Set(s.days.flatMap((d) => d.items.map((i) => i.placeId)))
      const todo = s.places
        .filter((p) => needsLookup(p, Date.now()))
        .sort((a, b) => Number(onDay.has(b.id)) - Number(onDay.has(a.id)))
      if (todo.length === 0) break
      setProgress({ running: true, done, total: done + todo.length })

      const batch = todo.slice(0, 12)
      const results = await lookupMany(batch)
      const updates: Parameters<typeof applyLookups>[0] = []
      let unavailable = false
      for (const p of batch) {
        const r = results.get(p.id)
        if (!r || r.status === 'unavailable') unavailable = true
        else if (r.status === 'none') updates.push({ id: p.id, lookup: r.complete ? 'none' : 'partial' })
        else updates.push({ id: p.id, lookup: r.complete ? 'found' : 'partial', details: r.details })
      }
      if (updates.length > 0) applyLookups(updates)
      done += updates.length

      if (unavailable) {
        // A service is busy. Wait and try again; give up for a few minutes if it keeps failing.
        if (++failures >= 3) {
          retryAt = Date.now() + 5 * 60_000
          break
        }
        await sleep(8_000)
      } else {
        failures = 0
        await sleep(600)
      }
    }
  } finally {
    running = false
    setProgress({ running: false, done: 0, total: 0 })
  }
}
