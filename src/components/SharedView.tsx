import { ArrowRight, BedDouble, CalendarCheck, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BackupError, type TripData } from '../lib/backup'
import { shortDate, stopLabel } from '../lib/days'
import { go } from '../lib/route'
import { readShared } from '../lib/sharelink'
import { nightsOf, sortedStays } from '../lib/stays'
import { getState, importTripData } from '../lib/store'
import { KIND_INFO } from './TransferSheet'
import { fmt } from './TripForm'

// What someone sees when they open a shared link: the plan, to read. They can save their own copy.
export function SharedView({ payload }: { payload: string }) {
  const [data, setData] = useState<TripData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    readShared(payload)
      .then((r) => live && setData(r.data))
      .catch((e) => live && setError(e instanceof BackupError ? e.message : 'That link couldn’t be opened.'))
    return () => {
      live = false
    }
  }, [payload])

  if (error) {
    return (
      <div className="page">
        <h1 className="display">This link can’t be opened</h1>
        <p className="error" role="alert">{error}</p>
        <a className="soft-btn" href="#/">Go to my trips</a>
      </div>
    )
  }
  if (!data) return <div className="page"><p className="muted" role="status">Opening the trip…</p></div>

  const { trip, places, days, transfers } = data
  const byId = new Map(places.map((p) => [p.id, p]))
  const planned = [...days].filter((d) => d.items.length > 0).sort((a, b) => a.date.localeCompare(b.date))
  const mapLink = (lat: number, lon: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`

  return (
    <div className="page shared">
      <header className="page-head">
        <div>
          <p className="eyebrow">Shared with you · read-only</p>
          <h1 className="display">{trip.name}</h1>
          <p className="lede small">{fmt(trip.startDate)} — {fmt(trip.endDate)}</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            importTripData(data)
            const id = getState().activeTripId
            if (id) go({ page: 'trip', tripId: id, tab: 'overview' })
          }}
        >
          Save a copy to my trips
        </button>
      </header>

      <section className="card panel">
        <p className="eyebrow">The route</p>
        <h2 className="display">Stops</h2>
        {trip.stops.map((s) => (
          <div key={s.id} className="line"><strong>{s.name}</strong><span className="muted">{shortDate(s.arrival)} → {shortDate(s.departure)}</span></div>
        ))}
      </section>

      {sortedStays(trip).length > 0 && (
        <section className="card panel">
          <p className="eyebrow">Where we’re staying</p>
          {sortedStays(trip).map((s) => {
            const p = byId.get(s.placeId)
            return (
              <div key={s.id} className="line">
                <span className="stay-tile"><BedDouble size={18} aria-hidden /></span>
                <span style={{ flex: 1 }}>
                  <strong>{p?.name ?? 'Accommodation'}</strong>
                  <span className="muted" style={{ display: 'block' }}>{shortDate(s.checkIn)} → {shortDate(s.checkOut)} · {nightsOf(s)} nights</span>
                </span>
                {p && <a className="btn" href={mapLink(p.lat, p.lon)} target="_blank" rel="noopener noreferrer"><MapPin size={15} /> Map</a>}
              </div>
            )
          })}
        </section>
      )}

      {transfers.length > 0 && (
        <section className="card panel">
          <p className="eyebrow">Getting around</p>
          {[...transfers].sort((a, b) => (a.date + (a.departTime ?? '')).localeCompare(b.date + (b.departTime ?? ''))).map((t) => {
            const { Icon } = KIND_INFO[t.kind]
            return (
              <div key={t.id} className="line">
                <span className="stay-tile transfer"><Icon size={18} /></span>
                <span>
                  <strong>{t.title}</strong>
                  <span className="muted" style={{ display: 'block' }}>
                    {shortDate(t.date)}{t.from && t.to ? ` · ${t.from} → ${t.to}` : ''}{t.departTime ? ` · ${t.departTime}${t.arriveTime ? ' → ' + t.arriveTime : ''}` : ''}
                  </span>
                </span>
              </div>
            )
          })}
        </section>
      )}

      {planned.map((d) => (
        <section key={d.id} className="card panel">
          <p className="eyebrow">{stopLabel(trip, d.date)}</p>
          <h2 className="display">{shortDate(d.date)}</h2>
          {d.items.map((i, n) => {
            const p = byId.get(i.placeId)
            return (
              <div key={i.id} className="line">
                <span className="tile num-tile" aria-hidden>{n + 1}</span>
                <span style={{ flex: 1 }}>
                  <strong>{p?.name ?? '(place)'}</strong>
                  <span className="muted" style={{ display: 'block' }}>
                    {[i.time, p?.tag, i.note].filter(Boolean).join(' · ')}
                  </span>
                  {i.reservation && (
                    <span className={'rsv ' + i.reservation}><CalendarCheck size={13} aria-hidden /> {i.reservation === 'booked' ? 'Booked' : 'Needs booking'}{i.reservationNote ? ` · ${i.reservationNote}` : ''}</span>
                  )}
                </span>
                {p && <a className="btn" href={mapLink(p.lat, p.lon)} target="_blank" rel="noopener noreferrer"><MapPin size={15} /> Map</a>}
              </div>
            )
          })}
        </section>
      ))}

      {(trip.notes ?? []).length > 0 && (
        <section className="card panel">
          <p className="eyebrow">Handy notes</p>
          {(trip.notes ?? []).map((n) => (
            <div key={n.id} className="note-card"><strong>{n.title}</strong><p className="note-text">{n.text}</p></div>
          ))}
        </section>
      )}

      <a className="soft-btn" href="#/">Go to my trips <ArrowRight size={16} /></a>
    </div>
  )
}
