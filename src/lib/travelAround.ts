import type { Place, Transfer, Trip } from '../types'
import { estimate } from './commute'
import { distanceKm } from './geo'
import { arrivalDate, type TravelExtra } from './journeys'
import { dayStays } from './stays'

// The time it takes to get to where a journey leaves from (an airport or station you've linked it to) from where you
// slept, and from where it lands to the place you'll sleep. Estimated from the distance between them, so it is only
// ever added for journeys linked to places. The usual time to be at the airport or station early is allowed for separately.
export function travelAround(trip: Trip, transfers: Transfer[], places: Place[]): TravelExtra {
  const byId = new Map(places.map((p) => [p.id, p]))
  const out: TravelExtra = {}
  // Getting to a station is a local trip. Anything far away is the journey itself (or a link to the wrong place),
  // so it is ignored rather than swallowing the day, and even a long local run is capped.
  const FAR_KM = 80
  const CAP = 180
  const minutes = (a?: Place, b?: Place) => {
    if (!a || !b || distanceKm(a, b) > FAR_KM) return 0
    return Math.min(CAP, Math.max(10, Math.round(Math.min(estimate(a, b, 'transit').minutes, estimate(a, b, 'taxi').minutes + 10))))
  }
  for (const t of transfers) {
    const from = t.fromPlaceId ? byId.get(t.fromPlaceId) : undefined
    const to = t.toPlaceId ? byId.get(t.toPlaceId) : undefined
    if (!from && !to) continue
    const leaveStay = dayStays(trip, t.date).start
    const arriveStay = dayStays(trip, arrivalDate(t)).end
    const before = minutes(leaveStay ? byId.get(leaveStay.placeId) : undefined, from)
    const after = minutes(to, arriveStay ? byId.get(arriveStay.placeId) : undefined)
    if (before || after) out[t.id] = { before, after }
  }
  return out
}
