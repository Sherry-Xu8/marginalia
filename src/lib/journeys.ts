import type { DayItem, Transfer, TransferKind } from '../types'
import { fromISO, toISO } from './days'

// Flights, trains and buses take up part of a day. These helpers work out which part, so a day's
// plan (and "Suggest my days") can be built around them rather than ignoring them.

export const DAY_START = 9 * 60 // we plan days between 9:00 and 21:00
export const DAY_END = 21 * 60

// Time to allow before leaving and after arriving (airport, station, getting settled).
const BUFFER: Record<TransferKind, { before: number; after: number }> = {
  flight: { before: 150, after: 75 },
  train: { before: 40, after: 30 },
  bus: { before: 40, after: 30 },
  ferry: { before: 60, after: 30 },
  car: { before: 15, after: 15 },
  other: { before: 30, after: 30 },
}

export const toMinutes = (t?: string): number | undefined =>
  t && /^\d{2}:\d{2}$/.test(t) ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : undefined
export const clock = (m: number): string => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`

const dayBefore = (date: string): string => {
  const d = fromISO(date)
  d.setDate(d.getDate() - 1)
  return toISO(d)
}

// The stretches of this date taken up by journeys (including time to get to and from them).
export function busyOn(transfers: Transfer[], date: string): { from: number; to: number; transfer: Transfer }[] {
  const out: { from: number; to: number; transfer: Transfer }[] = []
  for (const t of transfers) {
    const dep = toMinutes(t.departTime)
    const arr = toMinutes(t.arriveTime)
    const b = BUFFER[t.kind]
    const overnight = dep !== undefined && arr !== undefined && arr < dep
    if (t.date === date) {
      if (dep === undefined && arr === undefined) continue
      if (dep !== undefined && arr !== undefined && !overnight) out.push({ from: dep - b.before, to: arr + b.after, transfer: t })
      else if (overnight) out.push({ from: dep! - b.before, to: 24 * 60, transfer: t })
      else if (dep !== undefined) out.push({ from: dep - b.before, to: dep + 30, transfer: t })
      else out.push({ from: arr! - 30, to: arr! + b.after, transfer: t })
    } else if (overnight && dayBefore(date) === t.date) {
      out.push({ from: 0, to: arr! + b.after, transfer: t }) // arrives early the next morning
    }
  }
  return out
}

// The part of the day left for plans: the longest stretch between 9:00 and 21:00 that no journey uses.
export function freeWindow(transfers: Transfer[], date: string, side?: 'arriving' | 'departing'): { start: number; end: number; busy: { from: number; to: number; transfer: Transfer }[] } {
  const busy = busyOn(transfers, date).sort((a, b) => a.from - b.from)
  let best = { start: DAY_START, end: DAY_START }
  let cursor = DAY_START
  for (const b of busy) {
    if (b.from - cursor > best.end - best.start) best = { start: cursor, end: Math.min(b.from, DAY_END) }
    cursor = Math.max(cursor, b.to)
  }
  if (DAY_END - cursor > best.end - best.start) best = { start: cursor, end: DAY_END }
  if (busy.length === 0) best = { start: DAY_START, end: DAY_END }
  // On the day you move between two places, the new place gets the time after you arrive, the old one the time before you leave.
  else if (side === 'arriving') best = { start: Math.min(DAY_END, Math.max(DAY_START, ...busy.map((b) => b.to))), end: DAY_END }
  else if (side === 'departing') best = { start: DAY_START, end: Math.max(DAY_START, Math.min(DAY_END, ...busy.map((b) => b.from))) }
  return { ...best, busy }
}

// Does a journey on this date get you to your next stop in the evening (or overnight)? Then that date is spent in the place you're leaving.
export function arrivesLate(transfers: Transfer[], date: string): boolean {
  return transfers.some((t) => {
    if (t.date !== date) return false
    const dep = toMinutes(t.departTime)
    const arr = toMinutes(t.arriveTime)
    return (arr !== undefined && arr >= 17 * 60) || (dep !== undefined && arr !== undefined && arr < dep) || (arr === undefined && dep !== undefined && dep >= 16 * 60)
  })
}

// A one-line description of a journey for the plan: "Night bus 19:00 → 21:00".
export function describeTransfer(t: Transfer): string {
  const times = [t.departTime, t.arriveTime].filter(Boolean).join(' → ')
  return `${t.title}${times ? ' ' + times : ''}`
}

// Where each journey of the day falls among its places (0 = before the first place, n = after the last).
// Places with a time use it; the others are spread evenly across the part of the day that is free.
export function journeyPositions(items: DayItem[], transfers: Transfer[]): Map<string, number> {
  const out = new Map<string, number>()
  const free = freeWindow(transfers, transfers[0]?.date ?? '')
  const n = items.length
  const est = items.map((i, k) => toMinutes(i.time) ?? free.start + ((k + 0.5) * (free.end - free.start)) / Math.max(1, n))
  for (const t of transfers) {
    const at = toMinutes(t.departTime) ?? toMinutes(t.arriveTime)
    if (at === undefined) {
      out.set(t.id, n)
      continue
    }
    out.set(t.id, est.filter((e) => e < at).length)
  }
  return out
}
