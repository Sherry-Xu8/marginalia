import type { Stop, Trip } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromISO = (s: string) => new Date(s + 'T00:00:00')

// Every date from start to end, inclusive (capped at a year as a safety net).
export function eachDate(start: string, end: string): string[] {
  if (!start || !end || end < start) return []
  const out: string[] = []
  const d = fromISO(start)
  while (toISO(d) <= end && out.length < 366) {
    out.push(toISO(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

// Stops you're in on a date (two on a travel day: leaving one, arriving at the next).
export function stopsOn(trip: Trip, date: string): Stop[] {
  return trip.stops.filter((s) => s.arrival <= date && date <= s.departure)
}

export function stopLabel(trip: Trip, date: string): string {
  return stopsOn(trip, date).map((s) => s.name).join(' → ')
}

export function shortDate(date: string): string {
  return fromISO(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

// Whole days from today until the date (negative if it's in the past).
export function daysUntil(date: string): number {
  const today = fromISO(toISO(new Date()))
  return Math.round((fromISO(date).getTime() - today.getTime()) / 86400000)
}
