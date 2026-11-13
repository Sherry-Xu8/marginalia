import { get, set } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import type { AppData, ChecklistItem, Day, DayItem, Expense, Group, ImportSummary, Note, Place, PlaceDetails, Stay, Stop, Tag, Transfer, TravelMode, Trip } from '../types'
import { eachDate } from './days'
import { distanceKm } from './geo'
import { GROUP_RADIUS_KM, clusterPlaces, nextAreaName } from './grouping'
import type { TripData } from './backup'
import type { ParseResult } from './kml'
import { englishPart } from './names'
import { migrateLegacyTag, suggestTags } from './tagging'

// One small store holds everything and saves it to the browser (IndexedDB)
// after each change. Components read it with useAppData().

const KEY = 'trip-planner-data'
const empty: AppData = { version: 1, trips: [], places: [], groups: [], days: [], transfers: [], expenses: [], activeTripId: null }

let state: AppData = empty
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | undefined

// Bump this when the photo lookup gets better: places that found nothing before are tried again once.
export const COVER_LOOKUP_VERSION = 3
// Bump this when the category guesses from OpenStreetMap get better: untagged places are looked up once more.
export const TAG_CHECK_VERSION = 2

// Older saves kept one hotel per stop (stayPlaceId on the stop). Those become stays covering the stop's nights.
export function migrateStays(t: Trip): Trip {
  const legacy = t.stops.filter((s) => (s as { stayPlaceId?: string }).stayPlaceId)
  if (legacy.length === 0) return t
  const stays: Stay[] = [...(t.stays ?? [])]
  for (const s of legacy) {
    const placeId = (s as { stayPlaceId?: string }).stayPlaceId!
    if (s.arrival < s.departure && !stays.some((x) => x.placeId === placeId && x.checkIn === s.arrival)) {
      stays.push({ id: newId(), placeId, checkIn: s.arrival, checkOut: s.departure })
    }
  }
  return { ...t, stays, stops: t.stops.map((s) => { const { stayPlaceId: _drop, ...rest } = s as Stop & { stayPlaceId?: string }; return rest }) }
}

export async function loadData(): Promise<void> {
  try {
    const saved = await get<AppData>(KEY)
    if (saved && saved.version === 1) {
      // Data saved by Stage 1 has no groups yet — fill them in.
      state = {
        ...saved,
        places: saved.places.map(migrateLegacyTag),
        groups: saved.groups ?? [],
        days: saved.days ?? [],
        expenses: saved.expenses ?? [],
        transfers: saved.transfers ?? [],
        trips: saved.trips.map((t) => migrateStays({ ...t, checklist: t.checklist ?? seedChecklist() })),
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

// Puts back some parts of an earlier copy of the data (used by Undo after a delete).
export function restoreParts(before: AppData, parts: (keyof AppData)[]) {
  update((s) => ({ ...s, ...Object.fromEntries(parts.map((k) => [k, before[k]])) }))
}

// Lets other code (like sync) hear about every change.
export function onChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
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
      transfers: s.transfers.filter((t) => t.tripId !== id),
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
    added.push({ id: newId(), tripId, dedupeKey: key, sourceMap: parsed.mapName, ...p })
  }

  // Places already here that are in this file now belong to this map (so a later re-import knows).
  const inFile = new Set(parsed.places.map((p) => dedupeKeyOf(p.name, p.lat, p.lon)))
  const adopt = state.places.some((p) => p.tripId === tripId && !p.sourceMap && inFile.has(p.dedupeKey))
  if (added.length > 0 || adopt) {
    update((s) =>
      assignGroups(
        {
          ...s,
          places: [
            ...s.places.map((p) =>
              p.tripId === tripId && !p.sourceMap && inFile.has(p.dedupeKey) ? { ...p, sourceMap: parsed.mapName } : p,
            ),
            ...added,
          ],
        },
        tripId,
      ),
    )
    if (added.length > 0) void tagUntagged()
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

// Places that came from an earlier import of this map but are not in this file any more.
// Places you added yourself are never listed.
export function placesGoneFromFile(tripId: string, parsed: ParseResult): Place[] {
  const keys = new Set(parsed.places.map((p) => dedupeKeyOf(p.name, p.lat, p.lon)))
  const layers = new Set(parsed.places.map((p) => p.layer))
  return state.places.filter(
    (p) =>
      p.tripId === tripId &&
      p.layer !== 'Added by you' &&
      !keys.has(p.dedupeKey) &&
      // same map, or (for places imported before maps were recorded) a layer that is in this file
      (p.sourceMap ? p.sourceMap === parsed.mapName : layers.has(p.layer)),
  )
}

// Removes places, and everything that pointed at them: day plans, accommodation, links on expenses.
export function removePlaces(ids: string[]) {
  const gone = new Set(ids)
  update((s) =>
    dropEmptyGroups({
      ...s,
      places: s.places.filter((p) => !gone.has(p.id)),
      days: s.days.map((d) => (d.items.some((i) => gone.has(i.placeId)) ? { ...d, items: d.items.filter((i) => !gone.has(i.placeId)) } : d)),
      trips: s.trips.map((t) => ((t.stays ?? []).some((st) => gone.has(st.placeId)) ? { ...t, stays: (t.stays ?? []).filter((st) => !gone.has(st.placeId)) } : t)),
      expenses: s.expenses.map((e) => (e.placeId && gone.has(e.placeId) ? { ...e, placeId: undefined } : e)),
      transfers: s.transfers.map((t) => ((t.fromPlaceId && gone.has(t.fromPlaceId)) || (t.toPlaceId && gone.has(t.toPlaceId)) ? { ...t, fromPlaceId: t.fromPlaceId && gone.has(t.fromPlaceId) ? undefined : t.fromPlaceId, toPlaceId: t.toPlaceId && gone.has(t.toPlaceId) ? undefined : t.toPlaceId } : t)),
    }),
  )
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

// Looks again (online) at places that still have no category, then the name taggers have another go.
export function recheckUntagged(): number {
  const n = state.places.filter((p) => !p.tag && p.tagSource !== 'user').length
  if (n === 0) return 0
  update((s) => ({
    ...s,
    places: s.places.map((p) => (!p.tag && p.tagSource !== 'user' ? { ...p, tagCheck: undefined, lookup: p.lookup === 'none' ? undefined : p.lookup } : p)),
  }))
  void tagUntagged()
  return n
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

export function updateDayItem(dayId: string, itemId: string, patch: Partial<Pick<DayItem, 'time' | 'note' | 'done' | 'cost' | 'reservation' | 'reservationNote'>>) {
  mapDay(dayId, (d) => ({ ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }))
}

export function removeDayItem(dayId: string, itemId: string) {
  mapDay(dayId, (d) => ({ ...d, items: d.items.filter((i) => i.id !== itemId) }))
}

// Empties a day's plan but keeps anything already ticked as done. Returns how many places were removed.
export function clearDay(dayId: string): number {
  const day = state.days.find((d) => d.id === dayId)
  const removed = day ? day.items.filter((i) => !i.done).length : 0
  if (removed > 0) mapDay(dayId, (d) => ({ ...d, items: d.items.filter((i) => i.done) }))
  return removed
}

// Moves a planned place to the end of another day.
export function moveItemToDay(fromDayId: string, itemId: string, toDayId: string) {
  if (fromDayId === toDayId) return
  update((s) => {
    const item = s.days.find((d) => d.id === fromDayId)?.items.find((i) => i.id === itemId)
    if (!item) return s
    return {
      ...s,
      days: s.days.map((d) =>
        d.id === fromDayId ? { ...d, items: d.items.filter((i) => i.id !== itemId) } : d.id === toDayId ? { ...d, items: [...d.items, item] } : d,
      ),
    }
  })
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
export function applySuggestion(plan: { dayId: string; placeIds: string[]; times?: Record<string, string> }[]) {
  const byDay = new Map(plan.map((p) => [p.dayId, p]))
  update((s) => ({
    ...s,
    days: s.days.map((d) =>
      byDay.has(d.id)
        ? {
            ...d,
            // Times you fixed yourself in the draft (a booking, a tour) are kept on the day's plan.
            items: byDay.get(d.id)!.placeIds.map((placeId) => ({ id: newId(), placeId, note: '', done: false, time: byDay.get(d.id)!.times?.[placeId] })),
          }
        : d,
    ),
  }))
}

// ---- Budget and expenses ----

export function setBudget(tripId: string, budget: number | undefined, currency: string) {
  update((s) => ({
    ...s,
    trips: s.trips.map((t) => (t.id === tripId ? { ...t, budget, currency: currency.trim().toUpperCase() || 'GBP' } : t)),
  }))
}

export function setFoodPerDay(tripId: string, amount: number | undefined) {
  update((s) => ({ ...s, trips: s.trips.map((t) => (t.id === tripId ? { ...t, foodPerDay: amount } : t)) }))
}

export function setHomeCurrency(tripId: string, code: string) {
  const clean = code.trim().toUpperCase().slice(0, 4)
  update((s) => ({ ...s, trips: s.trips.map((t) => (t.id === tripId ? { ...t, homeCurrency: clean || undefined } : t)) }))
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
    let next = clearOrphans({ ...data, trips: data.trips.map((t) => migrateStays({ ...t, checklist: t.checklist ?? seedChecklist() })) })
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
    stays: (d.trip.stays ?? []).filter((st) => d.places.some((p) => p.id === st.placeId)).map((st) => ({ ...st, id: newId(), placeId: fresh('place:' + st.placeId) })),
    notes: (d.trip.notes ?? []).map((n) => ({ ...n, id: newId() })),
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
    legModes: day.legModes
      ? Object.fromEntries(
          Object.entries(day.legModes).flatMap(([k, v]): [string, TravelMode][] => {
            const [a, b] = k.split('>')
            return placeIds.has(a) && placeIds.has(b) ? [[`${fresh('place:' + a)}>${fresh('place:' + b)}`, v]] : []
          }),
        )
      : undefined,
  }))
  const expenses = d.expenses.map((e) => ({
    ...e,
    id: newId(),
    tripId,
    placeId: e.placeId && placeIds.has(e.placeId) ? fresh('place:' + e.placeId) : undefined,
  }))
  const transfers = d.transfers.map((t) => ({ ...t, id: newId(), tripId }))
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
          transfers: [...s.transfers, ...transfers],
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

// ---- Renaming places ----
// Only the display name changes. The original is kept so you can undo, and re-importing the
// same file still recognises the place (the duplicate check uses the original name).

export function renamePlace(id: string, name: string) {
  const clean = name.trim().slice(0, 300)
  if (!clean) return
  update((s) => ({
    ...s,
    places: s.places.map((p) =>
      p.id === id
        ? {
            ...p,
            name: clean,
            originalName: p.originalName ?? p.name,
            // back to the original text = nothing renamed any more
            ...(clean === p.originalName ? { originalName: undefined } : {}),
          }
        : p,
    ),
  }))
}

export function resetPlaceName(id: string) {
  update((s) => ({
    ...s,
    places: s.places.map((p) => (p.id === id && p.originalName ? { ...p, name: p.originalName, originalName: undefined } : p)),
  }))
}

// How many names in this trip have an English version that's different from what's shown.
export function englishNameCandidates(tripId: string): { id: string; to: string }[] {
  return state.places.flatMap((p) => {
    if (p.tripId !== tripId) return []
    const to = englishPart(p.name)
    return to && to !== p.name ? [{ id: p.id, to }] : []
  })
}

export function applyEnglishNames(tripId: string): number {
  const list = englishNameCandidates(tripId)
  const to = new Map(list.map((x) => [x.id, x.to]))
  update((s) => ({
    ...s,
    places: s.places.map((p) =>
      to.has(p.id) ? { ...p, name: to.get(p.id)!, originalName: p.originalName ?? p.name } : p,
    ),
  }))
  return list.length
}

export function restoreOriginalNames(tripId: string) {
  update((s) => ({
    ...s,
    places: s.places.map((p) =>
      p.tripId === tripId && p.originalName ? { ...p, name: p.originalName, originalName: undefined } : p,
    ),
  }))
}

// ---- Where you're staying ----

function mapTrip(tripId: string, fn: (t: Trip) => Trip) {
  update((s) => ({ ...s, trips: s.trips.map((t) => (t.id === tripId ? fn(t) : t)) }))
}

export function addStay(tripId: string, stay: Omit<Stay, 'id'>) {
  mapTrip(tripId, (t) => ({ ...t, stays: [...(t.stays ?? []), { ...stay, id: newId() }] }))
}

export function updateStay(tripId: string, id: string, patch: Partial<Omit<Stay, 'id'>>) {
  mapTrip(tripId, (t) => ({ ...t, stays: (t.stays ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)) }))
}

export function deleteStay(tripId: string, id: string) {
  mapTrip(tripId, (t) => ({ ...t, stays: (t.stays ?? []).filter((s) => s.id !== id) }))
}

// ---- Handy notes ----

export function addNote(tripId: string, note: Omit<Note, 'id'>) {
  mapTrip(tripId, (t) => ({ ...t, notes: [...(t.notes ?? []), { ...note, id: newId() }] }))
}

export function updateNote(tripId: string, id: string, patch: Partial<Omit<Note, 'id'>>) {
  mapTrip(tripId, (t) => ({ ...t, notes: (t.notes ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n)) }))
}

export function deleteNote(tripId: string, id: string) {
  mapTrip(tripId, (t) => ({ ...t, notes: (t.notes ?? []).filter((n) => n.id !== id) }))
}

// A place you add yourself (for example a hotel found by search). It is sorted into a
// location group like any imported place.
export function addCustomPlace(p: { tripId: string; name: string; lat: number; lon: number; tag?: Tag }): string {
  const place: Place = {
    id: newId(),
    tripId: p.tripId,
    name: p.name.trim().slice(0, 300),
    description: '',
    lat: p.lat,
    lon: p.lon,
    layer: 'Added by you',
    dedupeKey: dedupeKeyOf(p.name, p.lat, p.lon),
    tag: p.tag,
    tagSource: p.tag ? 'user' : undefined,
  }
  update((s) => autoLinkGroups(assignGroups({ ...s, places: [...s.places, place] }, p.tripId), p.tripId))
  return place.id
}

// ---- Place details and photos ----

export function setPlaceMust(id: string, must: boolean) {
  update((s) => ({ ...s, places: s.places.map((p) => (p.id === id ? { ...p, must: must || undefined } : p)) }))
}

export function setPlaceDetails(id: string, details: PlaceDetails | undefined) {
  update((s) => ({ ...s, places: s.places.map((p) => (p.id === id ? { ...p, details } : p)) }))
}

export function addPlacePhoto(id: string, dataUrl: string) {
  update((s) => ({
    ...s,
    places: s.places.map((p) => (p.id === id ? { ...p, photos: [...(p.photos ?? []), dataUrl].slice(-6) } : p)),
  }))
}

export function removePlacePhoto(id: string, index: number) {
  update((s) => ({
    ...s,
    places: s.places.map((p) => (p.id === id ? { ...p, photos: (p.photos ?? []).filter((_, i) => i !== index) } : p)),
  }))
}

// ---- Flights, trains and other transport ----

export function addTransfer(t: Omit<Transfer, 'id'>) {
  update((s) => ({ ...s, transfers: [...s.transfers, { ...t, id: newId() }] }))
}

export function updateTransfer(id: string, patch: Partial<Omit<Transfer, 'id' | 'tripId'>>) {
  update((s) => ({ ...s, transfers: s.transfers.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
}

export function deleteTransfer(id: string) {
  update((s) => ({ ...s, transfers: s.transfers.filter((t) => t.id !== id) }))
}

// Saves what the automatic online lookup found. Anything you typed yourself is kept.
export function applyLookups(
  updates: { id: string; lookup: 'found' | 'partial' | 'none'; details?: PlaceDetails }[],
) {
  const by = new Map(updates.map((u) => [u.id, u]))
  const now = new Date().toISOString()
  update((s) => ({
    ...s,
    places: s.places.map((p) => {
      const u = by.get(p.id)
      if (!u) return p
      const mine = Object.fromEntries(Object.entries(p.details ?? {}).filter(([, v]) => v))
      const { suggestedTag, ...found } = u.details ?? {}
      const details = u.details ? { ...found, ...mine } : p.details
      // A place the name couldn't place gets its category from what OpenStreetMap calls it. Your own choice always stays.
      const tagged = !p.tag && p.tagSource !== 'user' && suggestedTag ? { tag: suggestedTag, tagSource: 'rule' as const } : {}
      return { ...p, ...tagged, details, lookup: u.lookup, lookedUpAt: now, tagCheck: TAG_CHECK_VERSION }
    }),
  }))
}

// Saves a city photo for a stop (or records that none was found, so we don't keep asking).
export function setStopCover(tripId: string, stopId: string, coverUrl: string | undefined) {
  mapStops(tripId, (stops) =>
    stops.map((st) => (st.id === stopId ? { ...st, coverUrl: coverUrl ?? (st.coverUrl && /flag_of|coat_of_arms|emblem|locator|location_map|map_of|seal_of|logo/i.test(st.coverUrl) ? undefined : st.coverUrl), coverCheckedAt: new Date().toISOString(), coverV: COVER_LOOKUP_VERSION } : st)),
  )
}

export function setTripCover(tripId: string, coverUrl: string | undefined) {
  mapTrip(tripId, (t) => ({ ...t, coverUrl: coverUrl ?? t.coverUrl, coverCheckedAt: new Date().toISOString(), coverV: COVER_LOOKUP_VERSION }))
}

// How you travel one journey of a day (from one place to the next).
export function setLegMode(dayId: string, fromId: string, toId: string, mode: TravelMode) {
  mapDay(dayId, (d) => ({ ...d, legModes: { ...(d.legModes ?? {}), [`${fromId}>${toId}`]: mode } }))
}
