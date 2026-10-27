import type { Place, Stop, Transfer, Trip } from '../types'
import { arrivesLate } from './journeys'
import { eachDate } from './days'
import { centroid, distanceKm } from './geo'

// The itinerary suggester. Everything here is plain, predictable code (no AI):
//   1. leave out accommodation and transport places (accommodation becomes the day's start/end point)
//   2. if there are more places than the days can hold, set aside the most out-of-the-way ones
//      (and surplus food stops, so each day keeps a sensible mix of sights, meals and coffee)
//   3. join the remaining places into one short route (nearest-neighbour + 2-opt)
//   4. cut that route into days, preferring cuts at the biggest jumps so each day is one compact area
//   5. order each day's places so the route doesn't zigzag, starting/ending at accommodation if there is one

export type Pace = 'relaxed' | 'standard' | 'packed'
export type DayMode = 'full' | 'half' | 'off'

// How you like to travel. Meals: 0 = "I'll sort my own", 2 = lunch and dinner, 3 = all three.
export type Prefs = { meals: 0 | 2 | 3; cafe: boolean }
export const DEFAULT_PREFS: Prefs = { meals: 3, cafe: false }

// Sights (things to see and do) in a full day. Meals and a coffee stop are added on top of these.
export const PACE_COUNT: Record<Pace, number> = { relaxed: 2, standard: 3, packed: 5 }

export type MealName = 'Breakfast' | 'Lunch' | 'Dinner'
export type Quota = { sights: number; meals: number; cafes: number; mealNames?: MealName[] }

// The part of a day that's free, in minutes after midnight (a journey may take the rest).
export type FreeWindow = { start: number; end: number }

export function quotaFor(pace: Pace, mode: DayMode, prefs: Prefs, free?: FreeWindow): Quota {
  if (mode === 'off') return { sights: 0, meals: 0, cafes: 0 }
  if (free) {
    // A journey takes part of the day: scale the sights to the time left, and keep only the meals that fall in it.
    const len = free.end - free.start
    const wanted: MealName[] = prefs.meals === 3 ? ['Breakfast', 'Lunch', 'Dinner'] : prefs.meals === 2 ? ['Lunch', 'Dinner'] : []
    const fits = (m: MealName) =>
      m === 'Breakfast' ? free.start <= 570 && free.end >= 540 : m === 'Lunch' ? free.start <= 810 && free.end >= 750 : free.end >= 1050 && free.start <= 1200
    const mealNames = wanted.filter(fits)
    return {
      sights: len < 90 ? 0 : Math.max(1, Math.round((PACE_COUNT[pace] * len) / 720)),
      meals: mealNames.length,
      cafes: prefs.cafe && len >= 240 ? 1 : 0,
      mealNames,
    }
  }
  const full = mode === 'full'
  return {
    sights: full ? PACE_COUNT[pace] : Math.ceil(PACE_COUNT[pace] / 2),
    meals: full ? prefs.meals : Math.ceil(prefs.meals / 2),
    cafes: prefs.cafe ? 1 : 0,
  }
}
const capOf = (q: Quota): number => q.sights + q.meals + q.cafes

// The dates a stop plans for. A date you leave one stop and arrive at the next belongs to the
// arriving stop (you travel in the morning and explore the new place in the afternoon).
// Arrival and departure days default to half days.
export function stopDays(trip: Trip, stop: Stop, transfers: Transfer[] = []): { date: string; mode: DayMode }[] {
  const i = trip.stops.findIndex((s) => s.id === stop.id)
  const next = trip.stops[i + 1]
  const prev = trip.stops[i - 1]
  let dates = eachDate(stop.arrival, stop.departure)
  // A journey that gets you there in the evening means the day is still spent in the place you're leaving.
  const lateOn = (date: string) => arrivesLate(transfers.filter((t) => t.tripId === trip.id), date)
  if (next && next.arrival === stop.departure && dates.length > 1 && !lateOn(stop.departure)) dates = dates.slice(0, -1)
  if (prev && prev.departure === stop.arrival && dates.length > 1 && lateOn(stop.arrival)) dates = dates.slice(1)
  return dates.map((date, n) => ({
    date,
    mode: n === 0 || date === stop.departure ? 'half' : 'full',
  }))
}

export type SuggestedDay = { dayId: string; date: string; mode: DayMode; placeIds: string[]; anchorId?: string; labels?: Record<string, string> }
export type Suggestion = { days: SuggestedDay[]; unscheduled: string[] }
export type Slot = { dayId: string; date: string; mode: DayMode; free?: FreeWindow }

// Each place is a meal, a coffee stop, or a sight (everything else). A day is built from a mix of all three.
type Kind = 'meal' | 'cafe' | 'sight'
const kindOf = (p: Place): Kind => (p.tag === 'Food' ? 'meal' : p.tag === 'Cafes' ? 'cafe' : 'sight')
const isFood = (p: Place) => kindOf(p) !== 'sight'

export function suggestItinerary(opts: { places: Place[]; slots: Slot[]; pace: Pace; prefs?: Prefs; variant?: number; stay?: Place }): Suggestion {
  const { places, slots, pace, prefs = DEFAULT_PREFS, variant = 0, stay } = opts
  // The accommodation you chose for the stop is the start and end of every day; otherwise any
  // accommodation among the places is used.
  const accommodations = stay ? [stay] : places.filter((p) => p.tag === 'Accommodation')
  const cands = places.filter((p) => p.tag !== 'Accommodation' && p.tag !== 'Transport')
  const active = slots.filter((s) => s.mode !== 'off')
  const quotas = active.map((s) => quotaFor(pace, s.mode, prefs, s.free))
  const caps = quotas.map(capOf)
  const totalCap = caps.reduce((a, b) => a + b, 0)
  const emptyDays = (): SuggestedDay[] => slots.map((s) => ({ ...s, placeIds: [] }))
  if (active.length === 0 || cands.length === 0) return { days: emptyDays(), unscheduled: cands.map((p) => p.id) }

  const n = cands.length
  const D = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) D[i * n + j] = D[j * n + i] = distanceKm(cands[i], cands[j])
  }

  // ---- 2. set aside what won't fit ----
  const kept = new Array<boolean>(n).fill(true)
  const dropped: number[] = []
  const nearest = (i: number): { d: number; j: number } => {
    let d = Infinity
    let j = -1
    for (let k = 0; k < n; k++) {
      if (k !== i && kept[k] && D[i * n + k] < d) {
        d = D[i * n + k]
        j = k
      }
    }
    return { d, j }
  }
  const nn = cands.map((_, i) => nearest(i))
  const dropMostRemote = (eligible: (i: number) => boolean, count: number) => {
    for (let c = 0; c < count; c++) {
      let best = -1
      for (let i = 0; i < n; i++) {
        if (kept[i] && eligible(i) && (best < 0 || nn[i].d > nn[best].d)) best = i
      }
      if (best < 0) return
      kept[best] = false
      dropped.push(best)
      for (let i = 0; i < n; i++) if (kept[i] && nn[i].j === best) nn[i] = nearest(i)
    }
  }
  const keptCount = () => kept.filter(Boolean).length
  if (n > totalCap) {
    const foodCount = cands.filter((p, i) => kept[i] && isFood(p)).length
    const foodSoft = quotas.reduce((a, q) => a + q.meals + q.cafes, 0)
    const foodAllowed = Math.max(foodSoft, totalCap - (n - foodCount))
    if (foodCount > foodAllowed) dropMostRemote((i) => isFood(cands[i]), foodCount - foodAllowed)
    if (keptCount() > totalCap) dropMostRemote(() => true, keptCount() - totalCap)
  }

  // ---- 3. one short route through everything that's left ----
  const R = cands.map((_, i) => i).filter((i) => kept[i])
  const m = R.length
  const c0 = centroid(R.map((i) => cands[i]))
  const byRemoteness = [...R].sort((a, b) => distanceKm(cands[b], c0) - distanceKm(cands[a], c0))
  const start = byRemoteness[variant % Math.min(5, m)]
  const left = new Set(R)
  let tour = [start]
  left.delete(start)
  while (left.size > 0) {
    const last = tour[tour.length - 1]
    let best = -1
    for (const j of left) if (best < 0 || D[last * n + j] < D[last * n + best]) best = j
    tour.push(best)
    left.delete(best)
  }
  twoOpt(tour, D, n)
  if (variant % 2 === 1) tour = tour.reverse()

  // ---- 4. cut the route into days ----
  const k = active.length
  const edge = [0]
  for (let t = 1; t < m; t++) edge.push(edge[t - 1] + D[tour[t - 1] * n + tour[t]])
  const KINDS: Kind[] = ['meal', 'cafe', 'sight']
  const prefix: Record<Kind, number[]> = { meal: [0], cafe: [0], sight: [0] }
  for (let t = 0; t < m; t++) for (const kd of KINDS) prefix[kd].push(prefix[kd][t] + (kindOf(cands[tour[t]]) === kd ? 1 : 0))
  const avail: Record<Kind, number> = { meal: prefix.meal[m], cafe: prefix.cafe[m], sight: prefix.sight[m] }
  const slotsOf = (kd: Kind) => quotas.reduce((a, q) => a + (kd === 'meal' ? q.meals : kd === 'cafe' ? q.cafes : q.sights), 0)
  // If there aren't enough sights to fill the sight slots (e.g. a map of only restaurants), the
  // spare room can take extra food rather than leaving days thin.
  const spare = Math.max(0, slotsOf('sight') - avail.sight)
  const quotaOf = (q: Quota, kd: Kind) => (kd === 'meal' ? q.meals : kd === 'cafe' ? q.cafes : q.sights)
  const targets = quotas.map((q) =>
    Object.fromEntries(KINDS.map((kd) => {
      const slots = slotsOf(kd)
      return [kd, slots === 0 ? 0 : avail[kd] >= slots ? quotaOf(q, kd) : Math.round((avail[kd] * quotaOf(q, kd)) / slots)]
    })) as Record<Kind, number>,
  )
  const spareShare = quotas.map((q) => (slotsOf('sight') === 0 ? 0 : Math.ceil((spare * q.sights) / slotsOf('sight'))))
  const INF = Infinity
  const dp: number[][] = Array.from({ length: k + 1 }, () => new Array(m + 1).fill(INF))
  const from: number[][] = Array.from({ length: k + 1 }, () => new Array(m + 1).fill(0))
  dp[0][0] = 0
  for (let d = 1; d <= k; d++) {
    const cap = caps[d - 1]
    const target = Math.min(cap, Math.round((m * cap) / totalCap))
    for (let i = 0; i <= m; i++) {
      for (let s = 0; s <= Math.min(cap, i); s++) {
        const j = i - s
        if (dp[d - 1][j] === INF) continue
        let cost: number
        if (s === 0) cost = 40
        else {
          const path = s > 1 ? edge[i - 1] - edge[j] : 0
          const cnt = (kd: Kind) => prefix[kd][i] - prefix[kd][j]
          const tg = targets[d - 1]
          let mix = 0
          for (const kd of KINDS) mix += 3 * Math.max(0, tg[kd] - cnt(kd)) ** 2 // missing a meal / coffee / sight
          mix += 3 * Math.max(0, cnt('sight') - quotas[d - 1].sights) ** 2
          mix += 2 * Math.max(0, cnt('meal') - tg.meal - spareShare[d - 1]) ** 2
          mix += 2 * Math.max(0, cnt('cafe') - tg.cafe - spareShare[d - 1]) ** 2
          cost = path + 3 * (s - target) ** 2 + mix
        }
        if (dp[d - 1][j] + cost < dp[d][i]) {
          dp[d][i] = dp[d - 1][j] + cost
          from[d][i] = j
        }
      }
    }
  }
  const chunks: number[][] = new Array(k)
  for (let d = k, i = m; d >= 1; d--) {
    const j = from[d][i]
    chunks[d - 1] = tour.slice(j, i)
    i = j
  }

  // ---- 5. order each day ----
  const byDayId = new Map<string, SuggestedDay>()
  active.forEach((slot, d) => {
    const chunk = chunks[d]
    let anchor: Place | undefined
    if (accommodations.length > 0 && chunk.length > 0) {
      const c = centroid(chunk.map((i) => cands[i]))
      anchor = accommodations.reduce((a, b) => (distanceKm(b, c) < distanceKm(a, c) ? b : a))
    }
    const { order, labels } = bestOrder(chunk, anchor, cands, D, n, quotas[d].mealNames)
    byDayId.set(slot.dayId, { ...slot, placeIds: order.map((i) => cands[i].id), anchorId: anchor?.id, labels: Object.fromEntries(order.flatMap((i, x) => (labels[x] ? [[cands[i].id, labels[x]]] : []))) })
  })
  return {
    days: slots.map((s) => byDayId.get(s.dayId) ?? { ...s, placeIds: [] }),
    unscheduled: dropped.map((i) => cands[i].id),
  }
}

// Improves an open route by reversing stretches that make it shorter, until nothing helps.
function twoOpt(path: number[], D: Float64Array, n: number) {
  const len = path.length
  for (let pass = 0, improved = true; improved && pass < 30; pass++) {
    improved = false
    for (let i = 0; i < len - 1; i++) {
      for (let j = i + 1; j < len; j++) {
        const before = (i > 0 ? D[path[i - 1] * n + path[i]] : 0) + (j < len - 1 ? D[path[j] * n + path[j + 1]] : 0)
        const after = (i > 0 ? D[path[i - 1] * n + path[j]] : 0) + (j < len - 1 ? D[path[i] * n + path[j + 1]] : 0)
        if (after < before - 1e-9) {
          for (let a = i, b = j; a < b; a++, b--) [path[a], path[b]] = [path[b], path[a]]
          improved = true
        }
      }
    }
  }
}

// Lays out the day like a real day: breakfast, then sights, lunch, more sights, a coffee stop, more
// sights, dinner. Each place is then fitted to the shape (a meal goes in a meal slot, and so on) by
// trying every arrangement and keeping the shortest walk, which begins and ends at the
// accommodation if there is one. With no sights (a map of only restaurants) the meals still
// land at breakfast / lunch / dinner time and the rest spread between them.
type DaySlot = { kind: 'meal' | 'cafe' | 'free'; t: number; label?: string }
const MEAL_T: Record<MealName, number> = { Breakfast: 0.05, Lunch: 0.45, Dinner: 0.95 }
function dayShape(idx: number[], cands: Place[], names: MealName[] = ['Breakfast', 'Lunch', 'Dinner']): DaySlot[] {
  const count = (kd: Kind) => idx.filter((i) => kindOf(cands[i]) === kd).length
  const nMeal = count('meal')
  // Which meals this day has: all of them if there are enough restaurants, else the later ones (a lone meal is lunch if it can be).
  const chosen: MealName[] = nMeal >= names.length ? names : nMeal === 1 ? [names.includes('Lunch') ? 'Lunch' : names[0]] : names.slice(names.length - nMeal)
  const meals: [number, string][] = (nMeal === 0 ? [] : chosen).map((n) => [MEAL_T[n], n])
  const slots: DaySlot[] = meals.map(([t, label]) => ({ kind: 'meal', t, label }))
  if (count('cafe') >= 1) slots.push({ kind: 'cafe', t: 0.7, label: 'Coffee' })
  const free = idx.length - slots.length
  for (let k = 0; k < free; k++) slots.push({ kind: 'free', t: 0.1 + (0.8 * (k + 0.5)) / free })
  return slots.sort((a, b) => a.t - b.t)
}

function bestOrder(idx: number[], anchor: Place | undefined, cands: Place[], D: Float64Array, n: number, names?: MealName[]): { order: number[]; labels: (string | undefined)[] } {
  if (idx.length <= 1 || idx.length > 10) return { order: idx, labels: idx.map(() => undefined) }
  const shape = dayShape(idx, cands, names)
  const fits = (slot: DaySlot, p: number) => slot.kind === 'free' || (slot.kind === 'meal' ? kindOf(cands[p]) === 'meal' : kindOf(cands[p]) === 'cafe')
  let best: number[] = idx
  let bestCost = Infinity
  const used = new Array(idx.length).fill(false)
  const cur: number[] = []
  const go = (cost: number) => {
    if (cost >= bestCost) return
    if (cur.length === idx.length) {
      const total = cost + (anchor ? distanceKm(cands[cur[cur.length - 1]], anchor) : 0)
      if (total < bestCost) {
        bestCost = total
        best = [...cur]
      }
      return
    }
    const slot = shape[cur.length]
    for (let t = 0; t < idx.length; t++) {
      if (used[t] || !fits(slot, idx[t])) continue
      const p = idx[t]
      const step = cur.length === 0 ? (anchor ? distanceKm(anchor, cands[p]) : 0) : D[cur[cur.length - 1] * n + p]
      used[t] = true
      cur.push(p)
      go(cost + step)
      cur.pop()
      used[t] = false
    }
  }
  go(0)
  if (best.length !== idx.length || bestCost === Infinity) return { order: idx, labels: idx.map(() => undefined) }
  // Only label a place if it is really the kind its slot expects (a meal slot filled by a restaurant).
  const labels = best.map((p, x) => {
    const slot = shape[x]
    return slot.label && ((slot.kind === 'meal' && kindOf(cands[p]) === 'meal') || (slot.kind === 'cafe' && kindOf(cands[p]) === 'cafe')) ? slot.label : undefined
  })
  return { order: best, labels }
}
