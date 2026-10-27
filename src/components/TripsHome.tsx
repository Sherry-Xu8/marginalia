import { ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { daysUntil, eachDate } from '../lib/days'
import { go } from '../lib/route'
import { addTrip, deleteTrip, getState, updateTrip, useAppData } from '../lib/store'
import type { Trip } from '../types'
import { BackupCard } from './BackupCard'
import { NameDatesForm, fmt } from './TripForm'

function month(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function when(startDate: string, endDate: string): string {
  const toStart = daysUntil(startDate)
  const toEnd = daysUntil(endDate)
  if (toStart > 0) return `In ${toStart} day${toStart === 1 ? '' : 's'}`
  if (toEnd >= 0) return 'On now'
  return 'Finished'
}

function TripCard({ trip }: { trip: Trip }) {
  const { places } = useAppData()
  const [editing, setEditing] = useState(false)
  const placeCount = places.filter((p) => p.tripId === trip.id).length
  const days = eachDate(trip.startDate, trip.endDate).length

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
    <article className="card trip-card">
      <div className="trip-deco" aria-hidden />
      <div className="trip-actions">
        <button
          className="icon-btn"
          aria-label={`Delete ${trip.name}`}
          onClick={() => confirm(`Delete “${trip.name}” and all its places? This can’t be undone.`) && deleteTrip(trip.id)}
        >
          <Trash2 size={18} />
        </button>
        <button className="icon-btn" aria-label={`Edit ${trip.name}`} onClick={() => setEditing(true)}>
          <Pencil size={18} />
        </button>
      </div>
      <p className="eyebrow">{month(trip.startDate)} · {when(trip.startDate, trip.endDate)}</p>
      <h2 className="display">{trip.name}</h2>
      <p className="lede small">{fmt(trip.startDate)} — {fmt(trip.endDate)}</p>
      <div className="trip-stats">
        <div><strong>{days}</strong><span>days</span></div>
        <div><strong>{trip.stops.length}</strong><span>stops</span></div>
        <div><strong>{placeCount}</strong><span>saved places</span></div>
      </div>
      <a className="open-btn" href={`#/trip/${trip.id}/overview`}>
        Open trip <ArrowRight size={18} />
      </a>
    </article>
  )
}

// The front page: all your trips, and a way to start a new one.
export function TripsHome() {
  const { trips } = useAppData()
  const [creating, setCreating] = useState(false)

  return (
    <div className="page">
      <header className="home-head">
        <div>
          <p className="eyebrow">Your travel journal</p>
          <h1 className="display">Somewhere to begin.</h1>
          <p className="lede">Keep the little details together, then leave room for the unexpected.</p>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>
          <Plus size={18} /> Plan a trip
        </button>
      </header>

      {(creating || trips.length === 0) && (
        <NameDatesForm
          title={trips.length === 0 ? 'Plan your first trip' : 'New trip'}
          initial={{ name: '', start: '', end: '' }}
          nameLabel="Trip name"
          startLabel="Start date"
          endLabel="End date"
          onSave={(v) => {
            addTrip(v.name, v.start, v.end)
            setCreating(false)
            go({ page: 'trip', tripId: getState().activeTripId!, tab: 'overview' })
          }}
          onCancel={trips.length > 0 ? () => setCreating(false) : undefined}
        />
      )}

      <div className="grid trips">
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} />
        ))}
      </div>

      <div className="home-foot">
        <span className="muted">Saved on this device</span>
        <a className="link" href="#backup" onClick={(e) => { e.preventDefault(); document.getElementById('backup')?.scrollIntoView({ behavior: 'smooth' }) }}>
          Export or restore a backup <ArrowRight size={16} />
        </a>
      </div>
      <div id="backup"><BackupCard /></div>
    </div>
  )
}
