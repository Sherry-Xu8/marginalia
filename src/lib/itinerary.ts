import type { Place, Stop, Trip } from '../types'
import { eachDate } from './days'
import { centroid, distanceKm } from './geo'

// The itinerary suggester. Everything here is plain, predictable code (no AI):
//   1. leave out accommodation and transport places (accommodation becomes the day's start/end point)
//   2. if there are more places than the days can hold, set aside the most out-of-the-way ones
//      (and surplus food stops, so each day keeps a sensible mix)
//   3. join the remaining places into one short route (nearest-neighbour + 2-opt)
//   4. cut that route into days, preferring cuts at the biggest jumps so each day is one compact area
//   5. order each day's places so the route doesn't zigzag, starting/ending at accommodation if there is one

export type Pace = 'relaxed' | 'standard' | 'packed'
export type DayMode = 'full' | 'half' | 'off'

export const PACE_COUNT: Record<Pace, number> = { relaxed: 3, standard: 5, packed: 7 }

export const capacityFor = (pace: Pace, mode: DayMode): number =>
  mode === 'full' ? PACE_COUNT[pace] : mode === 'half' ? Math.ceil(PACE_COUNT[pace] / 2) : 0

// "A couple" of food stops per day.
export const foodMax = (cap: number): number => Math.min(cap, Math.max(1, Math.ceil(cap * 0.4)))

// The dates a stop plans for. A date you leave one stop and arrive at the next belongs to the
// arriving stop (you travel in the morning and explore the new place in the afternoon).
// Arrival and departure days default to half days.
export function stopDays(trip: Trip, stop: Stop): { date: string; mode: DayMode }[] {
  const i = trip.stops.findIndex((s) => s.id === stop.id)
  const next = trip.stops[i + 1]
  let dates = eachDate(stop.arrival, stop.departure)
  if (next && next.arrival === stop.departure && dates.length > 1) dates = dates.slice(0, -1)
  return dates.map((date, n) => ({
    date,
    mode: n === 0 || date === stop.departure ? 'half' : 'full',
  }))
}

export type SuggestedDay = { dayId: string; date: string; mode: DayMode; placeIds: string[]; anchorId?: string }
export type Suggestion = { days: SuggestedDay[]; unscheduled: string[] }
export type Slot = { dayId: string; date: string; mode: DayMode }

const isFood = (p: Place) => p.tag === 'Food & drink'

export function suggestItinerary(opts: { places: Place[]; slots: Slot[]; pace: Pace; variant?: number }): Suggestion {
  const { places, slots, pace, variant = 0 } = opts
  const accommodations = places.filter((p) => p.tag === 'Accommodation')
  const cands = places.filter((p) => p.tag !== 'Accommodation' && p.tag !== 'Transport')
  const active = slots.filter((s) => s.mode !== 'off')
  const caps = active.map((s) => capacityFor(pace, s.mode))
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
    const foodSoft = caps.reduce((a, c) => a + foodMax(c), 0)
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
  const foodPrefix = [0]
  for (let t = 0; t < m; t++) foodPrefix.push(foodPrefix[t] + (isFood(cands[tour[t]]) ? 1 : 0))
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
          const foodOver = Math.max(0, foodPrefix[i] - foodPrefix[j] - foodMax(cap))
          cost = path + 3 * (s - target) ** 2 + 2 * foodOver ** 2
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
    const ordered = bestOrder(chunk, anchor, cands, D, n)
    byDayId.set(slot.dayId, { ...slot, placeIds: ordered.map((i) => cands[i].id), anchorId: anchor?.id })
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

// Tries every order (a day has at most 7 places) and keeps the shortest route, which begins and
// ends at the accommodation if there is one. Two food stops in a row cost a little extra so
// meals are spread between other things.
function bestOrder(idx: number[], anchor: Place | undefined, cands: Place[], D: Float64Array, n: number): number[] {
  if (idx.length <= 1) return idx
  const hasNonFood = idx.some((i) => !isFood(cands[i]))
  const pen = (a: number, b: number) => (hasNonFood && isFood(cands[a]) && isFood(cands[b]) ? 0.4 : 0)
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
    for (let t = 0; t < idx.length; t++) {
      if (used[t]) continue
      const p = idx[t]
      const step = cur.length === 0
        ? anchor ? distanceKm(anchor, cands[p]) : 0
        : D[cur[cur.length - 1] * n + p] + pen(cur[cur.length - 1], p)
      used[t] = true
      cur.push(p)
      go(cost + step)
      cur.pop()
      used[t] = false
    }
  }
  go(0)
  return best
}
