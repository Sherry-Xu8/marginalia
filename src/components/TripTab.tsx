import { useState } from 'react'
import {
  addStop,
  addTrip,
  deleteStop,
  deleteTrip,
  moveStop,
  setActiveTrip,
  updateStop,
  updateTrip,
  useAppData,
} from '../lib/store'
import type { Stop, Trip } from '../types'

function fmt(date: string): string {
  if (!date) return '—'
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

type FormProps = {
  title: string
  initial: { name: string; start: string; end: string }
  nameLabel: string
  startLabel: string
  endLabel: string
  onSave: (v: { name: string; start: string; end: string }) => void
  onCancel?: () => void
}

// One form used for both trips and stops (they have the same three fields).
function NameDatesForm({ title, initial, nameLabel, startLabel, endLabel, onSave, onCancel }: FormProps) {
  const [name, setName] = useState(initial.name)
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const [error, setError] = useState('')

  function save() {
    if (!name.trim()) return setError('Please give it a name.')
    if (!start || !end) return setError('Please choose both dates.')
    if (end < start) return setError('The end date can’t be before the start date.')
    onSave({ name: name.trim(), start, end })
  }

  return (
    <div className="card form">
      <h3>{title}</h3>
      <label>
        {nameLabel}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="row">
        <label>
          {startLabel}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          {endLabel}
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row buttons">
        <button className="primary" onClick={save}>Save</button>
        {onCancel && <button onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}

function StopCard({ trip, stop, index }: { trip: Trip; stop: Stop; index: number }) {
  const { groups } = useAppData()
  const areas = groups.filter((g) => g.stopId === stop.id).map((g) => g.name)
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <NameDatesForm
        title="Edit stop"
        initial={{ name: stop.name, start: stop.arrival, end: stop.departure }}
        nameLabel="City or area"
        startLabel="Arrive"
        endLabel="Leave"
        onSave={(v) => {
          updateStop(trip.id, stop.id, { name: v.name, arrival: v.start, departure: v.end })
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }
  const last = index === trip.stops.length - 1
  return (
    <div className="card stop">
      <div className="stop-info">
        <strong>{stop.name}</strong>
        <span className="muted">{fmt(stop.arrival)} → {fmt(stop.departure)}</span>
        {areas.length > 0 && <span className="muted">Places from: {areas.join(', ')}</span>}
      </div>
      <div className="row buttons">
        <button aria-label="Move up" disabled={index === 0} onClick={() => moveStop(trip.id, stop.id, -1)}>↑</button>
        <button aria-label="Move down" disabled={last} onClick={() => moveStop(trip.id, stop.id, 1)}>↓</button>
        <button onClick={() => setEditing(true)}>Edit</button>
        <button
          className="danger"
          onClick={() => confirm(`Remove the stop “${stop.name}”?`) && deleteStop(trip.id, stop.id)}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

export function TripTab() {
  const { trips, activeTripId } = useAppData()
  const [creating, setCreating] = useState(false)
  const [editingTrip, setEditingTrip] = useState(false)
  const [addingStop, setAddingStop] = useState(false)
  const trip = trips.find((t) => t.id === activeTripId) ?? null

  if (trips.length === 0 || creating) {
    return (
      <section>
        <h2>{trips.length === 0 ? 'Plan your first trip' : 'New trip'}</h2>
        <NameDatesForm
          title="Trip details"
          initial={{ name: '', start: '', end: '' }}
          nameLabel="Trip name"
          startLabel="Start date"
          endLabel="End date"
          onSave={(v) => {
            addTrip(v.name, v.start, v.end)
            setCreating(false)
          }}
          onCancel={trips.length > 0 ? () => setCreating(false) : undefined}
        />
      </section>
    )
  }
  if (!trip) return null

  return (
    <section>
      <div className="row between">
        {trips.length > 1 ? (
          <select value={trip.id} onChange={(e) => setActiveTrip(e.target.value)} aria-label="Choose trip">
            {trips.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        ) : (
          <h2>{trip.name}</h2>
        )}
        <button onClick={() => setCreating(true)}>+ New trip</button>
      </div>

      {editingTrip ? (
        <NameDatesForm
          title="Edit trip"
          initial={{ name: trip.name, start: trip.startDate, end: trip.endDate }}
          nameLabel="Trip name"
          startLabel="Start date"
          endLabel="End date"
          onSave={(v) => {
            updateTrip(trip.id, { name: v.name, startDate: v.start, endDate: v.end })
            setEditingTrip(false)
          }}
          onCancel={() => setEditingTrip(false)}
        />
      ) : (
        <div className="card">
          <p><strong>{fmt(trip.startDate)} → {fmt(trip.endDate)}</strong></p>
          <div className="row buttons">
            <button onClick={() => setEditingTrip(true)}>Edit trip</button>
            <button
              className="danger"
              onClick={() =>
                confirm(`Delete “${trip.name}” and all its places? This can’t be undone.`) && deleteTrip(trip.id)
              }
            >
              Delete trip
            </button>
          </div>
        </div>
      )}

      <h3>Stops</h3>
      <p className="muted">Cities or areas you’ll visit, in order.</p>
      {trip.stops.map((stop, i) => (
        <StopCard key={stop.id} trip={trip} stop={stop} index={i} />
      ))}
      {addingStop ? (
        <NameDatesForm
          title="Add a stop"
          initial={{ name: '', start: trip.startDate, end: trip.endDate }}
          nameLabel="City or area"
          startLabel="Arrive"
          endLabel="Leave"
          onSave={(v) => {
            addStop(trip.id, { name: v.name, arrival: v.start, departure: v.end })
            setAddingStop(false)
          }}
          onCancel={() => setAddingStop(false)}
        />
      ) : (
        <button className="primary wide" onClick={() => setAddingStop(true)}>+ Add a stop</button>
      )}
    </section>
  )
}
