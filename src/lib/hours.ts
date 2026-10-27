import { fromISO } from './days'

// Reads opening hours the way OpenStreetMap writes them ("Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off")
// and says whether a place is open on a given day. Anything it doesn't understand is "unknown",
// never a guess, so a warning only ever appears when the hours are clear.

const DAY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
export type Range = [number, number] // minutes after midnight
export type DayHours = { status: 'open'; ranges: Range[] } | { status: 'closed' } | { status: 'unknown' }

const UNKNOWN: DayHours = { status: 'unknown' }

function daysOf(spec: string): number[] | null {
  const out: number[] = []
  for (const part of spec.split(',').map((x) => x.trim()).filter(Boolean)) {
    if (part === 'PH' || part === 'SH') continue
    const m = part.match(/^([A-Z][a-z])(?:\s*-\s*([A-Z][a-z]))?$/)
    if (!m) return null
    const a = DAY.indexOf(m[1])
    const b = m[2] ? DAY.indexOf(m[2]) : a
    if (a < 0 || b < 0) return null
    for (let d = a; ; d = (d + 1) % 7) {
      out.push(d)
      if (d === b) break
    }
  }
  return out
}

export function hoursOn(hours: string | undefined, date: string): DayHours {
  if (!hours) return UNKNOWN
  const text = hours.trim()
  if (/\b(24\/7)\b/.test(text)) return { status: 'open', ranges: [[0, 1440]] }
  if (/sunrise|sunset|dawn|dusk|\[|week\s*\d|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|"/.test(text)) return UNKNOWN
  const weekday = fromISO(date).getDay()
  let result: DayHours | undefined
  let sawDaySpecific = false
  for (const rule of text.split(';').map((r) => r.trim()).filter(Boolean)) {
    const m = rule.match(/^((?:[A-Z][a-z](?:\s*-\s*[A-Z][a-z])?)(?:\s*,\s*[A-Z][a-z](?:\s*-\s*[A-Z][a-z])?)*)\s+(.*)$/)
    const days = m ? daysOf(m[1]) : null
    if (m && !days) return UNKNOWN
    if (days) sawDaySpecific = true
    const rest = (m ? m[2] : rule).trim()
    const applies = !days || days.includes(weekday)
    if (/^(off|closed)$/i.test(rest)) {
      if (applies) result = { status: 'closed' }
      continue
    }
    const ranges: Range[] = []
    for (const t of rest.split(',')) {
      const r = t.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/)
      if (!r) return UNKNOWN
      const start = +r[1] * 60 + +r[2]
      let end = +r[3] * 60 + +r[4]
      if (end <= start) end += 1440 // open past midnight
      ranges.push([start, end])
    }
    if (ranges.length === 0) return UNKNOWN
    if (applies) result = { status: 'open', ranges }
  }
  // A list that names some days but not this one means it's shut that day.
  return result ?? (sawDaySpecific ? { status: 'closed' } : UNKNOWN)
}

const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

// A short warning if the place looks closed that day, or closed at the time you planned. null = nothing to say.
export function hoursWarning(hours: string | undefined, date: string, time?: string): string | null {
  const h = hoursOn(hours, date)
  const dayName = fromISO(date).toLocaleDateString(undefined, { weekday: 'long' })
  if (h.status === 'closed') return `Looks closed on ${dayName}s`
  if (h.status === 'open' && time) {
    const t = +time.slice(0, 2) * 60 + +time.slice(3, 5)
    const ok = h.ranges.some(([a, b]) => (t >= a && t < b) || (t + 1440 >= a && t + 1440 < b))
    if (!ok) return `Usually open ${h.ranges.map(([a, b]) => `${clock(a)}–${clock(b)}`).join(', ')}, not ${time}`
  }
  return null
}
