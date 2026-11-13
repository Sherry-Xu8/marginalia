import type { Expense, ExpenseCategory, Place, Stay, Transfer, Trip } from '../types'

// Hotels and journeys you've entered with a price count as booked and paid for, so they are part of what you've
// spent (unless you tick "Not paid yet" on them, in which case they stay in what's still to come).

export type Booking = {
  id: string
  kind: 'stay' | 'journey'
  title: string
  detail: string // dates, for the list
  date: string // the day the money counts against
  amount: number // in the trip's currency
  paid?: { amount: number; currency: string } // what was actually paid, if in another currency
  unpaid: boolean
  category: ExpenseCategory
  stay?: Stay
  transfer?: Transfer
}

export function bookingsOf(trip: Trip, transfers: Transfer[], places: Place[]): Booking[] {
  const stays: Booking[] = (trip.stays ?? [])
    .filter((s) => s.cost !== undefined)
    .map((s) => ({
      id: s.id,
      kind: 'stay',
      title: places.find((p) => p.id === s.placeId)?.name ?? 'Accommodation',
      detail: `${s.checkIn} → ${s.checkOut}`,
      date: s.checkIn,
      amount: s.cost!,
      paid: s.paid,
      unpaid: !!s.unpaid,
      category: 'Accommodation',
      stay: s,
    }))
  const journeys: Booking[] = transfers
    .filter((t) => t.tripId === trip.id && t.cost !== undefined)
    .map((t) => ({
      id: t.id,
      kind: 'journey',
      title: t.title || `${t.from} → ${t.to}`,
      detail: t.from && t.to ? `${t.from} → ${t.to}` : '',
      date: t.date,
      amount: t.cost!,
      paid: t.paid,
      unpaid: !!t.unpaid,
      category: 'Transport',
      transfer: t,
    }))
  return [...stays, ...journeys].sort((a, b) => a.date.localeCompare(b.date))
}

// Everything spent on a trip: the expenses you logged plus the bookings you've paid for.
export function spentOf(trip: Trip, expenses: Expense[], transfers: Transfer[], places: Place[]): number {
  return (
    expenses.filter((e) => e.tripId === trip.id).reduce((s, e) => s + e.amount, 0) +
    bookingsOf(trip, transfers, places).filter((b) => !b.unpaid).reduce((s, b) => s + b.amount, 0)
  )
}
