import { ArrowRight, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { daysUntil, eachDate } from '../lib/days'
import { go } from '../lib/route'
import { addTrip, deleteTrip, getState, updateTrip, useAppData } from '../lib/store'
import type { Place, Trip } from '../types'
import { BackupCard } from './BackupCard'
import { BackupNudge } from './BackupNudge'
import { NameDatesForm, fmt } from './TripForm'
import { ask } from '../lib/confirm'

function when(startDate: string, endDate: string): string {
  const toStart = daysUntil(startDate)
  const toEnd = daysUntil(endDate)
  if (toStart > 0) return `In ${toStart} day${toStart === 1 ? '' : 's'}`
  if (toEnd >= 0) return 'On now'
  return 'Finished'
}

// Up to three photos for a trip: a photo of each stop's city first, then photos of its places
// (your own uploads before ones found online).
function tripPhotos(trip: Trip, places: Place[]): string[] {
  const out: string[] = []
  const add = (u?: string) => {
    if (u && !out.includes(u)) out.push(u)
  }
  for (const s of trip.stops) add(s.coverUrl)
  add(trip.coverUrl)
  const mine = places.filter((p) => p.tripId === trip.id)
  for (const p of mine) add(p.photos?.[0])
  for (const p of mine) add(p.details?.imageUrl)
  return out
}

// A soft colour for trips that have no photos yet, chosen from the trip so it stays the same.
const TINTS: [string, string][] = [['#cfe0cf', '#2f5646'], ['#f0dcc4', '#7a4a1c'], ['#d9e8e8', '#274b4f']]
const tintFor = (id: string) => TINTS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length]

function Collage({ trip, photos, status }: { trip: Trip; photos: string[]; status: string }) {
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const shown = photos.filter((u) => !failed.has(u)).slice(0, 3)
  const [bg, ink] = tintFor(trip.id)
  const img = (u: string) => (
    <img key={u} src={u} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed((f) => new Set(f).add(u))} />
  )
  return (
    <div className={'collage n' + shown.length}>
      {shown.length > 0 ? (
        shown.map(img)
      ) : (
        <>
          <span className="collage-letter" style={{ background: bg, color: ink }} aria-hidden>{trip.name.charAt(0).toUpperCase()}</span>
          <span style={{ background: TINTS[1][0] }} aria-hidden />
          <span style={{ background: TINTS[2][0] }} aria-hidden />
        </>
      )}
      <span className="collage-pill">{status}</span>
    </div>
  )
}

function TripCard({ trip }: { trip: Trip }) {
  const { places } = useAppData()
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const placeCount = places.filter((p) => p.tripId === trip.id).length
  const days = eachDate(trip.startDate, trip.endDate).length
  const photos = tripPhotos(trip, places)

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
    <article className="card tcard">
      <a className="tcard-link" href={`#/trip/${trip.id}/overview`} aria-label={`Open ${trip.name}`} />
      <div className="tcard-photos">
        <Collage trip={trip} photos={photos} status={when(trip.startDate, trip.endDate)} />
      </div>
      <div className="tcard-body">
        <div className="tcard-title">
          <h2 className="display">{trip.name}</h2>
          <div className="tcard-menu">
          <button className="menu-btn" aria-label={`Options for ${trip.name}`} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <MoreHorizontal size={18} />
          </button>
          {menu && <div className="menu-scrim" onClick={() => setMenu(false)} />}
          {menu && (
            <div className="menu-pop" role="menu">
              <button role="menuitem" onClick={() => { setMenu(false); setEditing(true) }}><Pencil size={16} /> Edit</button>
              <button
                role="menuitem"
                className="danger"
                onClick={() => {
                  setMenu(false)
                  ask(`Delete “${trip.name}” and all its places? This can’t be undone.`, () => deleteTrip(trip.id), 'Delete trip')
                }}
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
          )}
        </div>
        </div>
        <p className="lede small">
          {fmt(trip.startDate)} — {fmt(trip.endDate)}
          {trip.stops.length > 0 && ` · ${trip.stops.map((s) => s.name).join(', ')}`}
        </p>
        <div className="trip-stats">
          <div><strong>{days}</strong><span>days</span></div>
          {trip.stops.length > 0 && <div><strong>{trip.stops.length}</strong><span>stops</span></div>}
          <div><strong>{placeCount}</strong><span>saved places</span></div>
        </div>
      </div>
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

      <BackupNudge />

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
