import { get, set } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import type { AppData, ChecklistItem, Day, DayItem, Expense, Group, ImportSummary, Place, Stop, Tag, Trip } from '../types'
import { eachDate } from './days'
import { distanceKm } from './geo'
import { GROUP_RADIUS_KM, clusterPlaces, nextAreaName } from './grouping'
import type { TripData } from './backup'
import type { ParseResult } from './kml'
import { suggestTags } from './tagging'

// One small store holds everything and saves it to the browser (IndexedDB)
// after each change. Components read it with useAppData().

const KEY = 'trip-planner-data'
const empty: AppData = { version: 1, trips: [], places: [], groups: [], days: [], expenses: [], activeTripId: null }

let state: AppData = empty
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | undefined

export async function loadData(): Promise<void> {
  try {
    const saved = await get<AppData>(KEY)
    if (saved && saved.version === 1) {
      // Data saved by Stage 1 has no groups yet — fill them in.
      state = {
        ...saved,
        groups: saved.groups ?? [],
        days: saved.days ?? [],
        expenses: saved.expenses ?? [],
        trips: saved.trips.map((t) => ({ ...t, checklist: t.checklist ?? seedChecklist() })),
      }
      for (const t of state.trips) state = autoLinkGroups(syncDays(assignGroups(state, t.id), t.id), t.id)
      void tagUntagged()
    }
  } catch {
    // Storage can be unavailable (e.g. private browsing) — start empty.
  }
}

export function getState(): AppData {
  return state
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
  const trip: Trip = { id: newId(), name, startDate, endDate, stops: [], checklist: seedChecklist() }
  update((s) => syncDays({ ...s, trips: [...s.trips, trip], activeTripId: trip.id }, trip.id))
}

export function updateTrip(id: string, patch: Partial<Pick<Trip, 'name' | 'startDate' | 'endDate'>>) {
  update((s) => syncDays({ ...s, trips: s.trips.map((t) => (t.id === id ? { ...t, ...patch } : t)) }, id))
}

export function deleteTrip(id: string) {
  update((s) => {
    const trips = s.trips.filter((t) => t.id !== id)
    return {
      ...s,
      trips,
      places: s.places.filter((p) => p.tripId !== id),
      groups: s.groups.filter((g) => g.tripId !== id),
      days: s.days.filter((d) => d.tripId !== id),
      expenses: s.expenses.filter((e) => e.tripId !== id),
      activeTripId: s.activeTripId === id ? (trips[0]?.id ?? null) : s.activeTripId,
    }
  })
}

export function setActiveTrip(id: string) {
  update((s) => ({ ...s, activeTripId: id }))
}

function mapStops(tripId: string, fn: (stops: Stop[]) => Stop[]) {
  update((s) =>
    autoLinkGroups(
      {
        ...s,
        trips: s.trips.map((t) => (t.id === tripId ? { ...t, stops: fn(t.stops) } : t)),
      },
      tripId,
    ),
  )
}

// Links a location group to a trip stop when their names obviously match ("Seoul" and "Seoul"),
// so you don't have to do it by hand. Groups you've already linked yourself are left alone.
const norm = (n: string) => n.toLowerCase().replace(/-(si|gun|gu)$/, '').replace(/[^\p{L}\p{N}]/gu, '')
function autoLinkGroups(s: AppData, tripId: string): AppData {
  const trip = s.trips.find((t) => t.id === tripId)
  if (!trip) return s
  return {
    ...s,
    groups: s.groups.map((g) => {
      const gn = norm(g.name)
      if (g.tripId !== tripId || g.stopId || !gn) return g
      const hits = trip.stops.filter((st) => {
        const sn = norm(st.name)
        return sn && (gn.includes(sn) || sn.includes(gn))
      })
      return hits.length === 1 ? { ...g, stopId: hits[0].id } : g
    }),
  }
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

  if (added.length > 0) {
    update((s) => assignGroups({ ...s, places: [...s.places, ...added] }, tripId))
    void tagUntagged()
  }

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
  update((s) => ({
    ...s,
    places: s.places.filter((p) => p.tripId !== tripId),
    groups: s.groups.filter((g) => g.tripId !== tripId),
    days: s.days.map((d) => (d.tripId === tripId ? { ...d, items: [] } : d)),
  }))
}

// ---- Location groups ----

// Puts every place that has no group into one: an existing group if it is within
// 30 km of one of that group's places, otherwise a new group (chain-linked clusters).
function assignGroups(s: AppData, tripId: string): AppData {
  const ungrouped = s.places.filter((p) => p.tripId === tripId && !p.groupId)
  if (ungrouped.length === 0) return s
  const groups = s.groups.filter((g) => g.tripId === tripId)
  const assigned = new Map<string, string>() // place id → group id
  const newGroups: Group[] = []

  const leftover: Place[] = []
  for (const p of ungrouped) {
    let best: { id: string; d: number } | null = null
    for (const q of s.places) {
      if (q.tripId !== tripId || !q.groupId) continue
      const d = distanceKm(p, q)
      if (d <= GROUP_RADIUS_KM && (!best || d < best.d)) best = { id: q.groupId, d }
    }
    if (best) assigned.set(p.id, best.id)
    else leftover.push(p)
  }

  for (const indexes of clusterPlaces(leftover)) {
    const group: Group = {
      id: newId(),
      tripId,
      name: nextAreaName([...groups, ...newGroups]),
      nameSource: 'auto',
    }
    newGroups.push(group)
    for (const i of indexes) assigned.set(leftover[i].id, group.id)
  }

  return {
    ...s,
    groups: [...s.groups, ...newGroups],
    places: s.places.map((p) => (assigned.has(p.id) ? { ...p, groupId: assigned.get(p.id) } : p)),
  }
}

function dropEmptyGroups(s: AppData): AppData {
  const used = new Set(s.places.map((p) => p.groupId))
  return { ...s, groups: s.groups.filter((g) => used.has(g.id)) }
}

export function renameGroup(id: string, name: string) {
  update((s) => ({
    ...s,
    groups: s.groups.map((g) => (g.id === id ? { ...g, name, nameSource: 'user' } : g)),
  }))
}

// Used by the name lookup: only fills in a name if you haven't renamed it yourself.
export function applyLookedUpName(id: string, name: string | null) {
  update((s) => {
    const group = s.groups.find((g) => g.id === id)
    if (!group || group.nameSource !== 'auto') return s
    const taken = s.groups.some((g) => g.tripId === group.tripId && g.id !== id && g.name === name)
    const finalName = name ? (taken ? `${name} (2)` : name) : group.name
    return autoLinkGroups(
      {
        ...s,
        groups: s.groups.map((g) =>
          g.id === id ? { ...g, name: finalName, nameSource: name ? 'geocoded' : 'fallback' } : g,
        ),
      },
      group.tripId,
    )
  })
}

export function retryNaming() {
  update((s) => ({
    ...s,
    groups: s.groups.map((g) => (g.nameSource === 'fallback' ? { ...g, nameSource: 'auto' } : g)),
  }))
}

export function setGroupStop(groupId: string, stopId: string | undefined) {
  update((s) => ({ ...s, groups: s.groups.map((g) => (g.id === groupId ? { ...g, stopId } : g)) }))
}

export function mergeGroups(fromId: string, intoId: string) {
  update((s) => {
    const from = s.groups.find((g) => g.id === fromId)
    return dropEmptyGroups({
      ...s,
      groups: s.groups.map((g) => (g.id === intoId && !g.stopId && from?.stopId ? { ...g, stopId: from.stopId } : g)),
      places: s.places.map((p) => (p.groupId === fromId ? { ...p, groupId: intoId } : p)),
    })
  })
}

// Moves places to another group, or to a brand-new one (this is also how you split a group).
export function movePlaces(placeIds: string[], target: string | 'new') {
  update((s) => {
    const ids = new Set(placeIds)
    const first = s.places.find((p) => ids.has(p.id))
    if (!first) return s
    let groups = s.groups
    let groupId = target
    if (target === 'new') {
      const group: Group = {
        id: newId(),
        tripId: first.tripId,
        name: nextAreaName(s.groups.filter((g) => g.tripId === first.tripId)),
        nameSource: 'auto', // gets a looked-up name
      }
      groups = [...groups, group]
      groupId = group.id
    }
    return dropEmptyGroups({
      ...s,
      groups,
      places: s.places.map((p) => (ids.has(p.id) ? { ...p, groupId } : p)),
    })
  })
}

// ---- Tags ----

export function setPlaceTag(placeId: string, tag: Tag | undefined) {
  update((s) => ({
    ...s,
    places: s.places.map((p) =>
      p.id === placeId ? { ...p, tag, tagSource: tag ? 'user' : undefined } : p,
    ),
  }))
}

// Runs the taggers over places that have no tag yet. Never touches tags you set yourself.
export async function tagUntagged() {
  const todo = state.places.filter((p) => !p.tag && p.tagSource !== 'user')
  if (todo.length === 0) return
  const found = await suggestTags(todo)
  if (found.size === 0) return
  update((s) => ({
    ...s,
    places: s.places.map((p) =>
      found.has(p.id) && !p.tag && p.tagSource !== 'user'
        ? { ...p, tag: found.get(p.id), tagSource: 'rule' }
        : p,
    ),
  }))
}

// ---- Days ----

// Makes sure there's a day for every date of the trip. Days outside the dates are
// dropped only if empty, so changing the dates never loses a plan you made.
function syncDays(s: AppData, tripId: string): AppData {
  const trip = s.trips.find((t) => t.id === tripId)
  if (!trip) return s
  const dates = eachDate(trip.startDate, trip.endDate)
  const have = new Set(s.days.filter((d) => d.tripId === tripId).map((d) => d.date))
  const keep = s.days.filter((d) => d.tripId !== tripId || dates.includes(d.date) || d.items.length > 0)
  const added: Day[] = dates.filter((d) => !have.has(d)).map((date) => ({ id: newId(), tripId, date, items: [] }))
  return { ...s, days: [...keep, ...added] }
}

function mapDay(dayId: string, fn: (d: Day) => Day) {
  update((s) => ({ ...s, days: s.days.map((d) => (d.id === dayId ? fn(d) : d)) }))
}

// Returns false (and changes nothing) if that place is already on the day.
export function addToDay(dayId: string, placeId: string): boolean {
  const day = state.days.find((d) => d.id === dayId)
  if (!day || day.items.some((i) => i.placeId === placeId)) return false
  mapDay(dayId, (d) => ({ ...d, items: [...d.items, { id: newId(), placeId, note: '', done: false }] }))
  return true
}

export function updateDayItem(dayId: string, itemId: string, patch: Partial<Pick<DayItem, 'time' | 'note' | 'done' | 'cost'>>) {
  mapDay(dayId, (d) => ({ ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }))
}

export function removeDayItem(dayId: string, itemId: string) {
  mapDay(dayId, (d) => ({ ...d, items: d.items.filter((i) => i.id !== itemId) }))
}

export function moveDayItem(dayId: string, activeId: string, overId: string) {
  mapDay(dayId, (d) => {
    const from = d.items.findIndex((i) => i.id === activeId)
    const to = d.items.findIndex((i) => i.id === overId)
    if (from < 0 || to < 0 || from === to) return d
    const items = [...d.items]
    items.splice(to, 0, items.splice(from, 1)[0])
    return { ...d, items }
  })
}

// Items with a time go in time order; items without one keep their place at the end.
export function sortDayByTime(dayId: string) {
  mapDay(dayId, (d) => {
    const timed = d.items.filter((i) => i.time).sort((a, b) => a.time!.localeCompare(b.time!))
    return { ...d, items: [...timed, ...d.items.filter((i) => !i.time)] }
  })
}

// ---- Checklist ----

const STARTER: Record<ChecklistItem['section'], string[]> = {
  pre: [
    'Passport valid for 6+ months',
    'Check visa / entry requirements',
    'Travel insurance',
    'Book flights',
    'Book accommodation',
    'Tell your bank you’re travelling',
    'Phone plan or eSIM sorted',
    'Download offline maps',
  ],
  packing: [
    'Passport and copies',
    'Phone and charger',
    'Power adapter',
    'Medications',
    'Clothes for the weather',
    'Toiletries',
    'Comfortable shoes',
    'Rain jacket or umbrella',
    'Reusable bag',
  ],
}

function seedChecklist(): ChecklistItem[] {
  return (Object.keys(STARTER) as ChecklistItem['section'][]).flatMap((section) =>
    STARTER[section].map((text) => ({ id: newId(), section, text, done: false })),
  )
}

function mapChecklist(tripId: string, fn: (items: ChecklistItem[]) => ChecklistItem[]) {
  update((s) => ({ ...s, trips: s.trips.map((t) => (t.id === tripId ? { ...t, checklist: fn(t.checklist) } : t)) }))
}

export function addCheckItem(tripId: string, section: ChecklistItem['section'], text: string) {
  mapChecklist(tripId, (items) => [...items, { id: newId(), section, text, done: false }])
}

export function toggleCheckItem(tripId: string, itemId: string) {
  mapChecklist(tripId, (items) => items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)))
}

export function removeCheckItem(tripId: string, itemId: string) {
  mapChecklist(tripId, (items) => items.filter((i) => i.id !== itemId))
}

// Saves an accepted suggestion: each listed day gets exactly these places, in this order.
export function applySuggestion(plan: { dayId: string; placeIds: string[] }[]) {
  const byDay = new Map(plan.map((p) => [p.dayId, p.placeIds]))
  update((s) => ({
    ...s,
    days: s.days.map((d) =>
      byDay.has(d.id)
        ? {
            ...d,
            items: byDay.get(d.id)!.map((placeId) => ({ id: newId(), placeId, note: '', done: false })),
          }
        : d,
    ),
  }))
}

// ---- Budget and expenses ----

export function setBudget(tripId: string, budget: number | undefined, currency: string) {
  update((s) => ({
    ...s,
    trips: s.trips.map((t) => (t.id === tripId ? { ...t, budget, currency: currency.trim().toUpperCase() || 'USD' } : t)),
  }))
}

export function addExpense(e: Omit<Expense, 'id'>) {
  update((s) => ({ ...s, expenses: [...s.expenses, { ...e, id: newId() }] }))
}

export function deleteExpense(id: string) {
  update((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) }))
}

// ---- Backup and sharing ----

// A place pointing at a group that isn't there (e.g. a damaged file) is put back in the "ungrouped" pile.
function clearOrphans(s: AppData): AppData {
  const ok = new Set(s.groups.map((g) => g.id))
  return { ...s, places: s.places.map((p) => (p.groupId && !ok.has(p.groupId) ? { ...p, groupId: undefined } : p)) }
}

// Replaces everything on this device with a backup file's contents.
export function replaceAllData(data: AppData) {
  update(() => {
    let next = clearOrphans({ ...data, trips: data.trips.map((t) => ({ ...t, checklist: t.checklist ?? seedChecklist() })) })
    for (const t of next.trips) next = syncDays(assignGroups(next, t.id), t.id)
    return next
  })
  void tagUntagged()
}

// Adds a shared trip as a new trip. Every id is replaced with a fresh one so it can never
// clash with (or overwrite) anything already here, even if you import the same file twice.
export function importTripData(d: TripData): string {
  const ids = new Map<string, string>()
  const fresh = (old: string) => {
    if (!ids.has(old)) ids.set(old, newId())
    return ids.get(old)!
  }
  const tripId = fresh('trip:' + d.trip.id)
  const trip: Trip = {
    ...d.trip,
    id: tripId,
    stops: d.trip.stops.map((s) => ({ ...s, id: fresh('stop:' + s.id) })),
    checklist: d.trip.checklist.map((c) => ({ ...c, id: newId() })),
  }
  const placeIds = new Set(d.places.map((p) => p.id))
  const places = d.places.map((p) => ({
    ...p,
    id: fresh('place:' + p.id),
    tripId,
    groupId: p.groupId ? fresh('group:' + p.groupId) : undefined,
  }))
  const groups = d.groups.map((g) => ({
    ...g,
    id: fresh('group:' + g.id),
    tripId,
    stopId: g.stopId && d.trip.stops.some((s) => s.id === g.stopId) ? fresh('stop:' + g.stopId) : undefined,
  }))
  const days = d.days.map((day) => ({
    ...day,
    id: newId(),
    tripId,
    items: day.items.filter((i) => placeIds.has(i.placeId)).map((i) => ({ ...i, id: newId(), placeId: fresh('place:' + i.placeId) })),
  }))
  const expenses = d.expenses.map((e) => ({ ...e, id: newId(), tripId }))
  update((s) =>
    syncDays(
      assignGroups(
        clearOrphans({
          ...s,
          trips: [...s.trips, trip],
          places: [...s.places, ...places],
          groups: [...s.groups, ...groups],
          days: [...s.days, ...days],
          expenses: [...s.expenses, ...expenses],
          activeTripId: tripId,
        }),
        tripId,
      ),
      tripId,
    ),
  )
  void tagUntagged()
  return trip.name
}
