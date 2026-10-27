import type { Stay, Stop, Trip } from '../types'
import { eachDate, fromISO, toISO } from './days'

// Where you sleep. A stay covers the nights from check-in up to (not including) check-out.

const dayBefore = (date: string): string => {
  const d = fromISO(date)
  d.setDate(d.getDate() - 1)
  return toISO(d)
}

export const nightsOf = (s: Pick<Stay, 'checkIn' | 'checkOut'>): number => eachDate(s.checkIn, s.checkOut).length - 1

export const sortedStays = (trip: Trip): Stay[] => [...(trip.stays ?? [])].sort((a, b) => a.checkIn.localeCompare(b.checkIn))

// The stay you sleep in on the night that starts on this date.
export function stayOnNight(trip: Trip, date: string): Stay | undefined {
  return (trip.stays ?? []).find((s) => s.checkIn <= date && date < s.checkOut)
}

// Where a day begins and ends: where you slept last night, and where you'll sleep tonight.
// (On a day you arrive somewhere new, the day starts from the new place's door.)
export function dayStays(trip: Trip, date: string): { start?: Stay; end?: Stay } {
  const end = stayOnNight(trip, date)
  return { start: stayOnNight(trip, dayBefore(date)) ?? end, end }
}

// The stay to use when planning a stop: whichever covers the most of its nights.
export function stayForStop(trip: Trip, stop: Stop): Stay | undefined {
  const nights = eachDate(stop.arrival, stop.departure).slice(0, -1)
  let best: { s: Stay; n: number } | undefined
  for (const s of trip.stays ?? []) {
    const n = nights.filter((d) => s.checkIn <= d && d < s.checkOut).length
    if (n > 0 && (!best || n > best.n)) best = { s, n }
  }
  return best?.s
}

export function staysForStop(trip: Trip, stop: Stop): Stay[] {
  const nights = eachDate(stop.arrival, stop.departure).slice(0, -1)
  return sortedStays(trip).filter((s) => nights.some((d) => s.checkIn <= d && d < s.checkOut))
}

// Nights of the trip, by stop, that have nowhere to sleep yet.
export function uncoveredNights(trip: Trip): { stop: Stop; dates: string[] }[] {
  return trip.stops.flatMap((stop) => {
    const dates = eachDate(stop.arrival, stop.departure).slice(0, -1).filter((d) => !stayOnNight(trip, d))
    return dates.length > 0 ? [{ stop, dates }] : []
  })
}
