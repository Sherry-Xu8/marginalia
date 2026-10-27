import { BedDouble, Search, X } from 'lucide-react'
import { useState } from 'react'
import { searchPlaces, type FoundPlace } from '../lib/geocode'
import { addCustomPlace, setStay, useAppData } from '../lib/store'
import type { Stop, Trip } from '../types'
import { tagName } from './TagIcon'

// Choose where you're sleeping in a stop. Days in that stop start and end there, so the first and
// last journeys of each day are measured from it.
export function StaySheet({ trip, stop, onClose }: { trip: Trip; stop: Stop; onClose: () => void }) {
  const { places, groups } = useAppData()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<FoundPlace[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('')

  const current = places.find((p) => p.id === stop.stayPlaceId)
  const areaIds = new Set(groups.filter((g) => g.stopId === stop.id).map((g) => g.id))
  const mine = places.filter((p) => p.tripId === trip.id)
  const q = filter.trim().toLowerCase()
  const candidates = mine
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const score = (p: typeof a) => (tagName(p) === 'Accommodation' ? 0 : 2) + (p.groupId && areaIds.has(p.groupId) ? 0 : 1)
      return score(a) - score(b)
    })
    .slice(0, 40)

  // Where to bias the search: the middle of this stop's places, if it has any.
  const near = (() => {
    const inStop = mine.filter((p) => p.groupId && areaIds.has(p.groupId))
    if (inStop.length === 0) return undefined
    return {
      lat: inStop.reduce((s, p) => s + p.lat, 0) / inStop.length,
      lon: inStop.reduce((s, p) => s + p.lon, 0) / inStop.length,
    }
  })()

  async function search() {
    if (!query.trim()) return setMessage('Type the hotel’s name first.')
    setBusy(true)
    setMessage('')
    const results = await searchPlaces(query.trim(), near)
    setBusy(false)
    setFound(results ?? [])
    if (!results) setMessage('The search service couldn’t be reached. Check your connection and try again.')
    else if (results.length === 0) setMessage('Nothing found. Try the name plus the city, or choose from your places below.')
  }

  function choose(placeId: string) {
    setStay(trip.id, stop.id, placeId)
    onClose()
  }

  return (
    <div className="sheet" role="dialog" aria-label={`Accommodation in ${stop.name}`}>
      <div className="sheet-head">
        <strong className="serif">Where are you staying in {stop.name}?</strong>
        <button onClick={onClose}><X size={16} /> Close</button>
      </div>
      <div className="sheet-body">
        {current && (
          <div className="card line">
            <BedDouble size={20} aria-hidden />
            <span><strong>{current.name}</strong></span>
            <button className="danger" onClick={() => { setStay(trip.id, stop.id, undefined); onClose() }}>Remove</button>
          </div>
        )}

        <h3>Search for a hotel</h3>
        <p className="muted">Looks it up on OpenStreetMap. Add the city to the name for better results.</p>
        <div className="row">
          <input
            value={query}
            placeholder="Hotel name"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <button className="primary" disabled={busy} onClick={search}><Search size={16} /> Search</button>
        </div>
        {message && <p className="muted" role="status">{message}</p>}
        {found?.map((f, i) => (
          <button
            key={i}
            className="pick"
            onClick={() => choose(addCustomPlace({ tripId: trip.id, name: f.name, lat: f.lat, lon: f.lon, tag: 'Accommodation' }))}
          >
            <BedDouble size={20} aria-hidden />
            <span>
              {f.name}
              <small className="muted"> · {f.address.split(',').slice(1, 4).join(',')}</small>
            </span>
            <b>Use</b>
          </button>
        ))}

        <h3>Or choose from your places</h3>
        <input type="search" placeholder="Filter your places…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {candidates.map((p) => (
          <button key={p.id} className="pick" onClick={() => choose(p.id)}>
            <BedDouble size={20} aria-hidden />
            <span>{p.name}<small className="muted"> · {tagName(p)}</small></span>
            <b>Use</b>
          </button>
        ))}
      </div>
    </div>
  )
}
