import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { daysUntil } from '../lib/days'
import { updateTrip } from '../lib/store'
import type { Trip } from '../types'
import { NameDatesForm } from './TripForm'

const long = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
const longYear = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

// The big banner at the top of a trip's overview.
export function TripHero({ trip }: { trip: Trip }) {
  const [editing, setEditing] = useState(false)
  const toStart = daysUntil(trip.startDate)
  const toEnd = daysUntil(trip.endDate)
  const kicker = toStart > 0 ? 'Your next chapter' : toEnd >= 0 ? 'On the road' : 'A chapter closed'
  const big = toStart > 0 ? String(toStart) : toEnd >= 0 ? `Day ${-toStart + 1}` : '—'
  const label = toStart > 0 ? (toStart === 1 ? 'day until takeoff' : 'days until takeoff') : toEnd >= 0 ? 'enjoy the trip' : 'trip finished'

  if (editing) {
    return (
      <NameDatesForm
        title="Edit trip"
        initial={{ name: trip.name, start: trip.startDate, end: trip.endDate }}
        nameLabel="Trip name"
        startLabel="Start date"
        endLabel="End date"
        onSave={(v) => {
          updateTrip(trip.id, { name: v.name, startDate: v.start, endDate: v.end })
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <section className="hero-card">
      <div className="hero-deco" aria-hidden />
      <div className="hero-text">
        <p className="eyebrow">{kicker}</p>
        <h1 className="display">{trip.name}</h1>
        <p className="lede small">{long(trip.startDate)} — {longYear(trip.endDate)}</p>
      </div>
      <div className="hero-count">
        <strong className="display">{big}</strong>
        <span>{label}</span>
      </div>
      <button className="icon-btn hero-edit" aria-label="Edit trip name and dates" onClick={() => setEditing(true)}>
        <Pencil size={18} />
      </button>
    </section>
  )
}
