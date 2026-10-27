import { BedDouble, MapPin, Search, X } from 'lucide-react'
import { useState } from 'react'
import { findLocation, type Located } from '../lib/findplace'
import { addCustomPlace, setStay, useAppData } from '../lib/store'
import type { Stop, Trip } from '../types'
import { PinPicker } from './PinPicker'
import { tagName } from './TagIcon'

const PRECISION_NOTE: Record<Located['precision'], string> = {
  exact: '',
  street: 'Nearest street — approximate',
  area: 'Neighbourhood — approximate',
}

// Choose where you're sleeping in a stop. Days in that stop start and end there, so the first and
// last journeys of each day are measured from it.
export function StaySheet({ trip, stop, onClose }: { trip: Trip; stop: Stop; onClose: () => void }) {
  const { places, groups } = useAppData()
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [found, setFound] = useState<Located[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('')
  const [picking, setPicking] = useState(false)

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

  // Where to bias the search and the map: the middle of this stop's places, if it has any.
  const near = (() => {
    const inStop = mine.filter((p) => p.groupId && areaIds.has(p.groupId))
    if (inStop.length === 0) return undefined
    return {
      lat: inStop.reduce((s, p) => s + p.lat, 0) / inStop.length,
      lon: inStop.reduce((s, p) => s + p.lon, 0) / inStop.length,
    }
  })()

  const looksLikeAddress = /^\d/.test(query.trim())

  async function search() {
    if (!query.trim()) return setMessage('Type a hotel name, an address, coordinates or a Google Maps link.')
    setBusy(true)
    setMessage('')
    const results = await findLocation(query.trim(), near)
    setBusy(false)
    setFound(results ?? [])
    if (!results) setMessage('The search service couldn’t be reached. Check your connection and try again.')
    else if (results.length === 0) setMessage('Nothing found. Try just the hotel’s name, or choose the spot on the map.')
  }

  function choose(placeId: string) {
    setStay(trip.id, stop.id, placeId)
    onClose()
  }

  function useLocation(lat: number, lon: number, fallbackName: string) {
    const finalName = name.trim() || fallbackName
    choose(addCustomPlace({ tripId: trip.id, name: finalName, lat, lon, tag: 'Accommodation' }))
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

        {picking ? (
          <>
            <h3>Choose the spot on the map</h3>
            <label>
              Name
              <input value={name} placeholder="e.g. My hotel in Busan" onChange={(e) => setName(e.target.value)} />
            </label>
            <PinPicker
              center={found?.[0] ?? near}
              onCancel={() => setPicking(false)}
              onPick={(lat, lon) => useLocation(lat, lon, 'My accommodation')}
            />
          </>
        ) : (
          <>
            <h3>Find it</h3>
            <p className="muted">
              Type the hotel’s name, paste its address, coordinates, or a Google Maps link. A name usually works best.
            </p>
            <div className="row">
              <input
                value={query}
                placeholder="Hotel name, address, coordinates or link"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
              />
              <button className="primary" disabled={busy} onClick={search}><Search size={16} /> {busy ? 'Searching…' : 'Search'}</button>
            </div>
            {(looksLikeAddress || (found && found.length > 0)) && (
              <label>
                Call it (optional)
                <input value={name} placeholder={looksLikeAddress ? 'e.g. My hotel in Busan' : 'Use the name found'} onChange={(e) => setName(e.target.value)} />
              </label>
            )}
            {message && <p className="muted" role="status">{message}</p>}
            {found && found.length > 0 && found[0].precision !== 'exact' && (
              <p className="note">
                I couldn’t find that exact address, so these are the closest matches ({PRECISION_NOTE[found[0].precision].toLowerCase()}).
                Pick the right area, or place the pin yourself for an exact spot.
              </p>
            )}
            {found?.map((f, i) => (
              <button key={i} className="pick" onClick={() => useLocation(f.lat, f.lon, looksLikeAddress ? 'My accommodation' : f.name)}>
                <BedDouble size={20} aria-hidden />
                <span>
                  {f.name}
                  <small className="muted"> · {f.address.split(',').slice(1, 4).join(',')}</small>
                  {f.precision !== 'exact' && <small className="muted"> · approximate</small>}
                </span>
                <b>Use</b>
              </button>
            ))}
            <button className="wide" onClick={() => setPicking(true)}><MapPin size={16} /> Choose the spot on the map instead</button>

            <h3>Or choose from your places</h3>
            <input type="search" placeholder="Filter your places…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            {candidates.map((p) => (
              <button key={p.id} className="pick" onClick={() => choose(p.id)}>
                <BedDouble size={20} aria-hidden />
                <span>{p.name}<small className="muted"> · {tagName(p)}</small></span>
                <b>Use</b>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
