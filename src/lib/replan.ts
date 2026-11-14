import type { Place } from '../types'
import { arrangeDay } from './daycheck'
import { distanceKm } from './geo'
import { DAY_END, DAY_START, toMinutes } from './journeys'
import { quotaFor, suggestItinerary, type MealName, type Pace, type Prefs, type Suggestion, type SuggestedDay } from './itinerary'

// "Re-plan around my choices". Places you've pinned (for example the café you chose for lunch) stay on
// their day. The rest of the day is then rebuilt around them: nearby places fill whatever the day still
// needs (sights, meals, a café), and the day is put in a sensible order for the clock and the opening hours.
// A whole-trip re-plan does that for each pinned day, then lets the normal planner lay out the other days.

export type ReplanCtx = {
  placeById: Map<string, Place>
  pins: Set<string>
  pace: Pace
  prefs: Prefs
  windowOf: (date: string) => { start: number; end: number } | undefined
  closedOn: (place: Place, date: string) => string | null
  stay?: Place
  variant: number
  fitAll: boolean // keep "fit every place in" on when re-planning, or everything spills back out
}

type Kind = 'meal' | 'cafe' | 'sight'
const kindOf = (p: Place): Kind => (p.tag === 'Food' ? 'meal' : p.tag === 'Cafes' ? 'cafe' : 'sight')
const NEARBY_KM = 3 // nothing further than this from the rest of the day is pulled in

const minDist = (p: Place, among: Place[]) => (among.length ? Math.min(...among.map((r) => distanceKm(p, r))) : Infinity)

// Fills a day around its pinned places from a pool of candidates, then orders it. Returns the day and what it used.
function fillDay(day: SuggestedDay, pinned: Place[], pool: Place[], ctx: ReplanCtx, cap?: number): { day: SuggestedDay; used: Set<string> } {
  const w = ctx.windowOf(day.date)
  const q = quotaFor(ctx.pace, day.mode, ctx.prefs, w)
  const have: Record<Kind, number> = { sight: 0, meal: 0, cafe: 0 }
  for (const p of pinned) have[kindOf(p)]++
  const need: Record<Kind, number> = {
    sight: Math.max(0, q.sights - have.sight),
    meal: Math.max(0, q.meals - have.meal),
    cafe: Math.max(0, q.cafes - have.cafe),
  }
  // Fitting everything in means a day takes its share of the places — not a day's worth, and not the whole lot.
  if (ctx.fitAll && cap !== undefined) {
    need.sight += Math.max(0, cap - (pinned.length + need.sight + need.meal + need.cafe))
  }
  const left = pool.filter((p) => !ctx.closedOn(p, day.date))
  const reference = [...pinned]
  const chosen: Place[] = []
  while (need.sight + need.meal + need.cafe > 0) {
    let best: Place | undefined
    let bestScore = Infinity
    for (const p of left) {
      if (need[kindOf(p)] <= 0) continue
      const d = minDist(p, reference)
      if (d > NEARBY_KM) continue
      const score = d - (p.must ? 0.5 : 0) // must-dos are preferred when two are about as close
      if (score < bestScore) {
        bestScore = score
        best = p
      }
    }
    if (!best) break
    chosen.push(best)
    reference.push(best)
    need[kindOf(best)]--
    left.splice(left.indexOf(best), 1)
  }

  // Which meal each food place is: the ones you labelled keep their label, the rest take the meals still free.
  const places = [...pinned, ...chosen]
  const all: MealName[] = ['Breakfast', 'Lunch', 'Dinner']
  const names: MealName[] = q.mealNames ?? (ctx.prefs.meals === 3 ? all : ctx.prefs.meals === 2 ? (['Lunch', 'Dinner'] as MealName[]) : []).slice(q.meals ? -q.meals : 99)
  const labels: Record<string, string> = {}
  for (const p of pinned) if (day.labels?.[p.id]) labels[p.id] = day.labels[p.id]
  const free = names.filter((n) => !Object.values(labels).includes(n))
  for (const p of places) {
    if (labels[p.id]) continue
    if (kindOf(p) === 'cafe') labels[p.id] = 'Café'
    else if (kindOf(p) === 'meal' && free.length > 0) labels[p.id] = free.shift()!
  }

  // A first draft of the order (breakfast first, lunch in the middle, dinner last), then the clock and opening hours tidy it.
  const anchor = day.anchorId ? ctx.placeById.get(day.anchorId) : ctx.stay
  const use = day.anchorUse ?? 'both'
  const byLabel = (l: string) => places.filter((p) => labels[p.id] === l)
  const rest = places.filter((p) => !['Breakfast', 'Lunch', 'Dinner', 'Café'].includes(labels[p.id] ?? ''))
  const route: Place[] = []
  const from = anchor ?? rest[0]
  const todo = [...rest]
  let cur: Place | undefined = from
  while (todo.length) {
    const next = todo.reduce((a, b) => (distanceKm(b, cur ?? b) < distanceKm(a, cur ?? a) ? b : a))
    route.push(next)
    todo.splice(todo.indexOf(next), 1)
    cur = next
  }
  const half = Math.ceil(route.length / 2)
  const draft = [...byLabel('Breakfast'), ...route.slice(0, half), ...byLabel('Lunch'), ...byLabel('Café'), ...route.slice(half), ...byLabel('Dinner')]
  // A place with a time you fixed yourself sits at that hour; everything else keeps its place in the day,
  // so the draft the ordering starts from already respects your bookings.
  const dayFrom = w?.start ?? DAY_START
  const dayUntil = Math.max(dayFrom + 60, w?.end ?? DAY_END)
  const seeded = draft
    .map((p, i) => ({ p, at: toMinutes(day.times?.[p.id]) ?? dayFrom + ((i + 0.5) * (dayUntil - dayFrom)) / draft.length }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.p)
  // Times you've fixed go in too, or the re-plan happily drops a 09:00 booking into the afternoon.
  const ordered = arrangeDay({ places: seeded, labels, times: day.times, date: day.date, start: w?.start ?? DAY_START, anchor: use === 'both' || use === 'start' ? anchor : undefined, anchorEnd: use === 'both' || use === 'end' ? anchor : undefined })
  const sorted = ordered.map((p) => p.id)
  return { day: { ...day, placeIds: sorted, labels, anchorId: anchor?.id ?? day.anchorId }, used: new Set(chosen.map((p) => p.id)) }
}

export type Replanned = { plan: Suggestion; pulled: number; setAside: number }

// Rebuild one day around its pinned places, drawing on unscheduled places and on places on other days
// that are close to what's pinned here.
export function replanDay(plan: Suggestion, dayId: string, ctx: ReplanCtx): Replanned {
  const day = plan.days.find((d) => d.dayId === dayId)
  if (!day || day.mode === 'off') return { plan, pulled: 0, setAside: 0 }
  const pinned = day.placeIds.map((id) => ctx.placeById.get(id)).filter((p): p is Place => !!p && ctx.pins.has(p.id))
  if (pinned.length === 0) return { plan, pulled: 0, setAside: 0 }

  const pool: Place[] = []
  const add = (id: string) => {
    const p = ctx.placeById.get(id)
    if (p && !ctx.pins.has(id)) pool.push(p)
  }
  day.placeIds.forEach(add)
  plan.unscheduled.forEach(add)
  for (const other of plan.days) {
    if (other.dayId === dayId) continue
    for (const id of other.placeIds) {
      const p = ctx.placeById.get(id)
      if (p && !ctx.pins.has(id) && minDist(p, pinned) <= NEARBY_KM) pool.push(p)
    }
  }

  const active = plan.days.filter((d) => d.mode !== 'off').length
  const everything = plan.days.reduce((n, d) => n + d.placeIds.length, 0) + plan.unscheduled.length
  const { day: filled, used } = fillDay(day, pinned, pool, ctx, active > 0 ? Math.ceil(everything / active) : undefined)
  const keep = new Set(filled.placeIds)
  let displaced = day.placeIds.filter((id) => !keep.has(id))
  // With "fit every place in" on, nothing is meant to be set aside, so anything pushed off this day goes to
  // whichever other day it sits closest to rather than back into Unscheduled.
  const rehomed = new Map<string, string[]>()
  if (ctx.fitAll && displaced.length > 0) {
    const others = plan.days.filter((d) => d.dayId !== dayId && d.mode !== 'off')
    if (others.length > 0) {
      for (const id of displaced) {
        const p = ctx.placeById.get(id)
        const best = others
          .map((o) => {
            const here = o.placeIds.map((x) => ctx.placeById.get(x)).filter((x): x is Place => !!x)
            return { o, km: p && here.length ? minDist(p, here) : Infinity }
          })
          .sort((a, b) => a.km - b.km)[0].o
        rehomed.set(best.dayId, [...(rehomed.get(best.dayId) ?? []), id])
      }
      displaced = []
    }
  }
  const fresh = filled.placeIds.filter((id) => !day.placeIds.includes(id)).length
  return {
    pulled: fresh,
    setAside: displaced.length,
    plan: {
    ...plan,
    days: plan.days.map((d) => {
      if (d.dayId === dayId) return filled
      const extra = rehomed.get(d.dayId) ?? []
      if (!d.placeIds.some((id) => used.has(id)) && extra.length === 0) return d
      const placeIds = [...d.placeIds.filter((id) => !used.has(id)), ...extra]
      const labels = Object.fromEntries(Object.entries(d.labels ?? {}).filter(([id]) => !used.has(id)))
      return { ...d, placeIds, labels }
    }),
    unscheduled: [...plan.unscheduled.filter((id) => !keep.has(id)), ...displaced],
    },
  }
}

// Rebuild every day that has pinned places, then plan the remaining days from whatever is left.
export function replanAll(plan: Suggestion, ctx: ReplanCtx): Suggestion {
  const pinnedDays = plan.days.filter((d) => d.mode !== 'off' && d.placeIds.some((id) => ctx.pins.has(id)))
  if (pinnedDays.length === 0) return plan

  const pool = new Map<string, Place>()
  const add = (id: string) => {
    const p = ctx.placeById.get(id)
    if (p && !ctx.pins.has(id)) pool.set(id, p)
  }
  plan.days.forEach((d) => d.placeIds.forEach(add))
  plan.unscheduled.forEach(add)

  const activeDays = plan.days.filter((d) => d.mode !== 'off').length
  const everything = pool.size + plan.days.reduce((n, d) => n + d.placeIds.filter((id) => ctx.pins.has(id)).length, 0)
  const share = activeDays > 0 ? Math.ceil(everything / activeDays) : 0

  const done = new Map<string, SuggestedDay>()
  for (const day of pinnedDays) {
    const pinned = day.placeIds.map((id) => ctx.placeById.get(id)).filter((p): p is Place => !!p && ctx.pins.has(p.id))
    const { day: filled, used } = fillDay(day, pinned, [...pool.values()], ctx, share)
    used.forEach((id) => pool.delete(id))
    done.set(day.dayId, filled)
  }

  const restSlots = plan.days
    .filter((d) => d.mode !== 'off' && !done.has(d.dayId))
    .map((d) => ({ dayId: d.dayId, date: d.date, mode: d.mode, free: ctx.windowOf(d.date) }))
  const rest = suggestItinerary({
    places: [...pool.values()],
    slots: restSlots,
    pace: ctx.pace,
    prefs: ctx.prefs,
    variant: ctx.variant,
    fitAll: ctx.fitAll,
    closedOn: ctx.closedOn,
    stay: ctx.stay,
  })
  const restById = new Map(rest.days.map((d) => [d.dayId, d]))
  const keepSettings = (was: SuggestedDay, now: SuggestedDay): SuggestedDay => ({ ...now, anchorUse: was.anchorUse })
  return {
    days: plan.days.map((d) =>
      done.get(d.dayId) ?? (d.mode === 'off' ? d : restById.get(d.dayId) ? keepSettings(d, restById.get(d.dayId)!) : { ...d, placeIds: [], labels: {}, times: {} }),
    ),
    unscheduled: rest.unscheduled,
    reasons: rest.reasons,
  }
}

