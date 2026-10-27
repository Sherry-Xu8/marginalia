import { BedDouble, MapPin, Search, X } from 'lucide-react'
import { useState } from 'react'
import { findLocation, type Located } from '../lib/findplace'
import { addCustomPlace, addStay, deleteStay, updateStay, useAppData } from '../lib/store'
import { nightsOf } from '../lib/stays'
import type { Stay, Trip } from '../types'
import { PinPicker } from './PinPicker'
import { tagName } from './TagIcon'
import { ask } from '../lib/confirm'

const PRECISION_NOTE: Record<Located['precision'], string> = {
  exact: '',
  street: 'Nearest street — approximate',
  area: 'Neighbourhood — approximate',
}

// Add or edit a place you're sleeping: which hotel, which nights, and what it costs. Days that fall
// in those nights start and end there, so the first and last journeys of each day are measured from it.
export function StaySheet({
  trip,
  stay,
  defaults,
  onClose,
}: {
  trip: Trip
  stay?: Stay
  defaults?: { checkIn: string; checkOut: string }
  onClose: () => void
}) {
  const { places, groups } = useAppData()
  const [placeId, setPlaceId] = useState<string | undefined>(stay?.placeId)
  const [checkIn, setCheckIn] = useState(stay?.checkIn ?? defaults?.checkIn ?? trip.startDate)
  const [checkOut, setCheckOut] = useState(stay?.checkOut ?? defaults?.checkOut ?? trip.endDate)
  const [cost, setCost] = useState(stay?.cost !== undefined ? String(stay.cost) : '')
  const [reference, setReference] = useState(stay?.reference ?? '')
  const [note, setNote] = useState(stay?.note ?? '')
  const [error, setError] = useState('')

  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [found, setFound] = useState<Located[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('')
  const [picking, setPicking] = useState(false)

  const current = places.find((p) => p.id === placeId)
  const mine = places.filter((p) => p.tripId === trip.id)
  const areaIds = new Set(
    groups.filter((g) => g.stopId && trip.stops.some((s) => s.id === g.stopId && s.arrival <= checkOut && s.departure >= checkIn)).map((g) => g.id),
  )
  const q = filter.trim().toLowerCase()
  const candidates = mine
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const score = (p: typeof a) => (tagName(p) === 'Accommodation' ? 0 : 2) + (p.groupId && areaIds.has(p.groupId) ? 0 : 1)
      return score(a) - score(b)
    })
    .slice(0, 40)

  // Where to bias the search and the map: the middle of the places around those dates, if there are any.
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

  function useLocation(lat: number, lon: number, fallbackName: string) {
    setPlaceId(addCustomPlace({ tripId: trip.id, name: name.trim() || fallbackName, lat, lon, tag: 'Accommodation' }))
    setPicking(false)
  }

  function save() {
    if (!placeId) return setError('Choose where you’re staying first.')
    if (!checkIn || !checkOut || checkOut <= checkIn) return setError('Check-out needs to be after check-in.')
    const n = parseFloat(cost)
    const data = {
      placeId,
      checkIn,
      checkOut,
      cost: cost.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined,
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
    }
    if (stay) updateStay(trip.id, stay.id, data)
    else addStay(trip.id, data)
    onClose()
  }

  const nights = checkIn && checkOut && checkOut > checkIn ? nightsOf({ checkIn, checkOut }) : 0

  return (
    <div className="sheet" role="dialog" aria-label="Accommodation">
      <div className="sheet-head">
        <strong className="serif">{stay ? 'Edit your stay' : 'Where are you staying?'}</strong>
        <button onClick={onClose}><X size={16} /> Close</button>
      </div>
      <div className="sheet-body">
        {current && !picking ? (
          <>
            <div className="card line">
              <BedDouble size={20} aria-hidden />
              <span><strong>{current.name}</strong></span>
              <button onClick={() => setPlaceId(undefined)}>Change</button>
            </div>
            <div className="row">
              <label>
                Check-in
                <input type="date" value={checkIn} onChange={(e) => { setCheckIn(e.target.value); setError('') }} />
              </label>
              <label>
                Check-out
                <input type="date" value={checkOut} onChange={(e) => { setCheckOut(e.target.value); setError('') }} />
              </label>
            </div>
            {nights > 0 && <p className="muted">{nights} night{nights === 1 ? '' : 's'}</p>}
            <div className="row">
              <label>
                Total cost ({trip.currency ?? 'USD'}, optional)
                <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
              </label>
              <label>
                Booking reference
                <input value={reference} onChange={(e) => setReference(e.target.value)} />
              </label>
            </div>
            <label>
              Note (check-in time, address in the local language…)
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary wide" onClick={save}>{stay ? 'Save changes' : 'Add this stay'}</button>
            {stay && (
              <button className="danger wide" onClick={() => ask('Remove this stay?', () => { deleteStay(trip.id, stay.id); onClose() }, 'Remove')}>
                Remove this stay
              </button>
            )}
          </>
        ) : picking ? (
          <>
            <h3>Choose the spot on the map</h3>
            <label>
              Name
              <input value={name} placeholder="e.g. My hotel in Busan" onChange={(e) => setName(e.target.value)} />
            </label>
            <PinPicker center={found?.[0] ?? near} onCancel={() => setPicking(false)} onPick={(lat, lon) => useLocation(lat, lon, 'My accommodation')} />
          </>
        ) : (
          <>
            <div className="row">
              <label>
                Check-in
                <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
              </label>
              <label>
                Check-out
                <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
              </label>
            </div>
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
              <button key={p.id} className="pick" onClick={() => setPlaceId(p.id)}>
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
