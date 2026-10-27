import { Plus } from 'lucide-react'
import { useState } from 'react'
import { daysUntil } from '../lib/days'
import { go } from '../lib/route'
import { addTrip, getState, useAppData } from '../lib/store'
import { BackupCard } from './BackupCard'
import { NameDatesForm, fmt } from './TripForm'

function when(startDate: string, endDate: string): string {
  const toStart = daysUntil(startDate)
  const toEnd = daysUntil(endDate)
  if (toStart > 0) return `In ${toStart} day${toStart === 1 ? '' : 's'}`
  if (toEnd >= 0) return 'On now'
  return 'Finished'
}

// The front page: all your trips, and a way to start a new one.
export function TripsHome() {
  const { trips, places } = useAppData()
  const [creating, setCreating] = useState(false)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="kicker">Trip Planner</p>
          <h1>Your trips</h1>
        </div>
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
          <a key={t.id} className="card trip-card" href={`#/trip/${t.id}/overview`}>
            <span className="chip-soft">{when(t.startDate, t.endDate)}</span>
            <h2>{t.name}</h2>
            <p className="muted">{fmt(t.startDate)} → {fmt(t.endDate)}</p>
            <p className="muted">
              {t.stops.length} stop{t.stops.length === 1 ? '' : 's'} ·{' '}
              {places.filter((p) => p.tripId === t.id).length} places
            </p>
            {t.stops.length > 0 && <p className="stops-line">{t.stops.map((s) => s.name).join(' → ')}</p>}
          </a>
        ))}
        {!creating && trips.length > 0 && (
          <button className="card add-card" onClick={() => setCreating(true)}>
            <Plus size={24} />
            New trip
          </button>
        )}
      </div>

      <BackupCard />
    </div>
  )
}
