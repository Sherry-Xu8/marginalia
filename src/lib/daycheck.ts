import type { Place } from '../types'
import { distanceKm } from './geo'
import { hoursOn } from './hours'

// Looks at one planned day as a timeline: roughly when you'd reach each place (from the order, how long
// each stop takes and how far apart they are), and whether the place would be open then. It can also try
// other orders and offer one that fits opening hours better or saves walking. These are estimates: they
// only ever raise a warning when the place's opening hours are clear, never on a guess.

export type MealLabel = 'Breakfast' | 'Lunch' | 'Dinner' | 'Café'
export type Problem = { id: string; kind: 'closed' | 'late' | 'early' | 'order' | 'meal-late' | 'meal-gap' | 'meal-run'; text: string }
export type DayCheck = { arrive: Record<string, number>; problems: Problem[]; km: number; end: number }

// A meal isn't eaten before its usual time, so a stop labelled Dinner is reached no earlier than 18:00.
const EARLIEST: Partial<Record<MealLabel, number>> = { Breakfast: 8 * 60, Lunch: 12 * 60, Dinner: 18 * 60 }
// And the latest they still make sense: a "lunch" at 16:25 isn't lunch, and most kitchens have stopped serving by then.
const LATEST: Partial<Record<MealLabel, number>> = { Breakfast: 11 * 60, Lunch: 15 * 60, Dinner: 22 * 60 }
const MEAL_GAP = 150 // you don't eat two meals within two and a half hours of each other

// A meal is a restaurant, or any place you've said is breakfast, lunch or dinner. A café on its own isn't
// (coffee or dessert after dinner is fine), so only meals need something to do between them.
const isMeal = (p: Place, label?: string) => p.tag === 'Food' || (label !== undefined && RANK[label] !== undefined)
const RANK: Partial<Record<string, number>> = { Breakfast: 0, Lunch: 1, Dinner: 2 }
const LAST_VISIT = 30 // you need at least this long before closing for it to be worth going

export const clockText = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`

function stayMinutes(p: Place, label?: string): number {
  if (label === 'Breakfast') return 45
  if (label === 'Lunch') return 60
  if (label === 'Dinner') return 75
  if (label === 'Café' || p.tag === 'Cafes') return 30
  if (p.tag === 'Food') return 60
  if (p.tag === 'Shopping') return 60
  return 75
}

// Walking for short hops, otherwise a bus or train.
const travelMinutes = (km: number) => (km < 1.2 ? km * 13 : 8 + km * 3.5)

export function checkDay(opts: { places: Place[]; labels?: Record<string, string>; date: string; start: number; anchor?: Place }): DayCheck {
  const { places, labels = {}, date, start, anchor } = opts
  const arrive: Record<string, number> = {}
  const problems: Problem[] = []
  let t = start
  let km = 0
  let lastMeal: { at: number; name: string } | undefined
  let prevMeal: string | undefined
  // With more meals than other things to do, some have to sit together, so leave it alone.
  const canSeparate = places.filter((p) => !isMeal(p, labels[p.id])).length >= places.filter((p) => isMeal(p, labels[p.id])).length - 1
  let prev: Place | undefined = anchor
  for (const p of places) {
    const hop = prev ? distanceKm(prev, p) : 0
    km += hop
    t += prev ? travelMinutes(hop) : 0
    const label = labels[p.id]
    // A meal planned after a later one (lunch after dinner) is a clash in its own right.
    const rank = RANK[label ?? '']
    const clash = rank === undefined ? undefined : places.slice(0, places.indexOf(p)).map((q) => labels[q.id]).find((l) => (RANK[l ?? ''] ?? -1) > rank)
    if (clash) problems.push({ id: p.id, kind: 'order', text: `${label} is after ${clash.toLowerCase()}, so it would be about ${clockText(Math.max(t, EARLIEST[label as MealLabel] ?? 0))}` })
    const earliest = label ? EARLIEST[label as MealLabel] : undefined
    if (earliest !== undefined && t < earliest) t = earliest
    arrive[p.id] = t

    const h = hoursOn(p.details?.hours, date)
    if (h.status === 'closed') {
      problems.push({ id: p.id, kind: 'closed', text: 'Looks closed that day' })
    } else if (h.status === 'open') {
      const ranges = [...h.ranges].sort((a, b) => a[0] - b[0])
      const r = ranges.find(([, close]) => t <= close - LAST_VISIT)
      if (!r) problems.push({ id: p.id, kind: 'late', text: `Closes ${clockText(ranges[ranges.length - 1][1])}, you’d get there about ${clockText(t)}` })
      else if (t < r[0]) problems.push({ id: p.id, kind: 'early', text: `Opens ${clockText(r[0])}, you’d get there about ${clockText(t)}` })
    }
    // Two meals in a row, with nothing to do in between. Only worth saying when there's something to put between them.
    if (isMeal(p, label) && prevMeal && canSeparate) {
      problems.push({ id: p.id, kind: 'meal-run', text: `straight after ${prevMeal}, with nothing in between` })
    }
    prevMeal = isMeal(p, label) ? p.name : undefined

    // A meal at the wrong time of day, or right on top of the one before it.
    const meal = label as MealLabel | undefined
    if (meal && RANK[meal] !== undefined) {
      const latest = LATEST[meal]
      if (latest !== undefined && t > latest) problems.push({ id: p.id, kind: 'meal-late', text: `${clockText(t)} is late for ${meal.toLowerCase()} — most places stop serving by ${clockText(latest)}` })
      if (lastMeal && t - lastMeal.at < MEAL_GAP) problems.push({ id: p.id, kind: 'meal-gap', text: `only ${Math.round((t - lastMeal.at) / 15) * 15} minutes after ${lastMeal.name.toLowerCase()}` })
      lastMeal = { at: t, name: meal }
    }
    t += stayMinutes(p, label)
    prev = p
  }
  if (prev && anchor) km += distanceKm(prev, anchor)
  return { arrive, problems, km, end: t }
}

// Lower is better: a place that's shut when you arrive matters most, then meals out of order, then walking.
function cost(places: Place[], opts: { labels?: Record<string, string>; date: string; start: number; anchor?: Place }): number {
  const c = checkDay({ ...opts, places })
  return 1000 * c.problems.length + 10 * c.km + 2 * Math.max(0, c.end - 21 * 60) / 10
}

export type Improvement = { order: string[]; fixed: number; savedKm: number }

type DayOpts = { places: Place[]; labels?: Record<string, string>; date: string; start: number; anchor?: Place }

// Tries moving each stop to every other position and keeps whatever helps, until nothing does.
export function arrangeDay(opts: DayOpts): Place[] {
  const { places } = opts
  if (places.length < 2 || places.length > 14) return places
  let best = places
  let bestCost = cost(places, opts)
  for (let pass = 0; pass < 12; pass++) {
    let next = best
    let nextCost = bestCost
    for (let i = 0; i < best.length; i++) {
      const without = best.filter((_, k) => k !== i)
      for (let j = 0; j <= without.length; j++) {
        if (j === i) continue
        const trial = [...without.slice(0, j), best[i], ...without.slice(j)]
        const c = cost(trial, opts)
        if (c < nextCost - 1e-6) {
          next = trial
          nextCost = c
        }
      }
    }
    if (next === best) break
    best = next
    bestCost = nextCost
  }
  return best
}

// Returns null unless a different order is clearly better: it clears a clash (a closed place, a meal out of
// order), or saves a real stretch of travel.
export function improveOrder(opts: DayOpts): Improvement | null {
  const { places } = opts
  const before = checkDay(opts)
  const best = arrangeDay(opts)
  const after = checkDay({ ...opts, places: best })
  const fixed = before.problems.length - after.problems.length
  const savedKm = before.km - after.km
  const sameOrder = best.every((p, i) => p.id === places[i].id)
  if (sameOrder) return null
  if (after.problems.length > before.problems.length) return null
  if (fixed > 0 || (savedKm >= 0.8 && savedKm >= before.km * 0.15)) return { order: best.map((p) => p.id), fixed: Math.max(0, fixed), savedKm: Math.max(0, savedKm) }
  return null
}
