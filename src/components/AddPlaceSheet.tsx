import { MapPin, Plus, Search, X } from 'lucide-react'
import { useState } from 'react'
import { findLocation, type Located } from '../lib/findplace'
import { addCustomPlace, tagUntagged, useAppData } from '../lib/store'
import { TAGS } from '../lib/tagging'
import type { Tag, Trip } from '../types'
import { PinPicker } from './PinPicker'

// Add a place without a map file: find it by name, address, coordinates or a Google Maps link,
// or tap the spot on a map.
export function AddPlaceSheet({ trip, onClose, onAdded }: { trip: Trip; onClose: () => void; onAdded: (id: string) => void }) {
  const { places } = useAppData()
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [tag, setTag] = useState<Tag | ''>('')
  const [found, setFound] = useState<Located[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [picking, setPicking] = useState(false)

  const mine = places.filter((p) => p.tripId === trip.id)
  // Search near your existing places, if there are any.
  const near = mine.length
    ? { lat: mine.reduce((s, p) => s + p.lat, 0) / mine.length, lon: mine.reduce((s, p) => s + p.lon, 0) / mine.length }
    : undefined
  const looksLikeAddress = /^\d/.test(query.trim())

  async function search() {
    if (!query.trim()) return setMessage('Type a name, an address, coordinates or a Google Maps link.')
    setBusy(true)
    setMessage('')
    const results = await findLocation(query.trim(), near)
    setBusy(false)
    setFound(results ?? [])
    if (!results) setMessage('The search service couldn’t be reached. Check your connection and try again.')
    else if (results.length === 0) setMessage('Nothing found. Try just the name, or choose the spot on the map.')
  }

  function add(lat: number, lon: number, fallbackName: string) {
    const id = addCustomPlace({ tripId: trip.id, name: name.trim() || fallbackName, lat, lon, tag: tag || undefined })
    if (!tag) void tagUntagged() // let the app guess the category from the name
    onAdded(id)
    onClose()
  }

  return (
    <div className="sheet" role="dialog" aria-label="Add a place">
      <div className="sheet-head">
        <strong className="serif">Add a place</strong>
        <button onClick={onClose}><X size={16} /> Close</button>
      </div>
      <div className="sheet-body">
        <label>
          Name (optional)
          <input value={name} placeholder="What do you want to call it?" onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Category
          <select value={tag} onChange={(e) => setTag(e.target.value as Tag | '')}>
            <option value="">Let the app guess</option>
            {TAGS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        {picking ? (
          <PinPicker center={found?.[0] ?? near} onCancel={() => setPicking(false)} onPick={(lat, lon) => add(lat, lon, 'New place')} />
        ) : (
          <>
            <h3>Where is it?</h3>
            <p className="muted">Search by name, paste an address, coordinates or a Google Maps link. A name usually works best.</p>
            <div className="row">
              <input
                value={query}
                placeholder="Name, address, coordinates or link"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
              />
              <button className="primary" disabled={busy} onClick={search}><Search size={16} /> {busy ? 'Searching…' : 'Search'}</button>
            </div>
            {message && <p className="muted" role="status">{message}</p>}
            {found && found.length > 0 && found[0].precision !== 'exact' && (
              <p className="note">I couldn’t find that exact address, so these are the closest matches. Pick one, or place the pin yourself for an exact spot.</p>
            )}
            {found?.map((f, i) => (
              <button key={i} className="pick" onClick={() => add(f.lat, f.lon, looksLikeAddress ? 'New place' : f.name)}>
                <Plus size={20} aria-hidden />
                <span>
                  {f.name}
                  <small className="muted"> · {f.address.split(',').slice(1, 4).join(',')}</small>
                  {f.precision !== 'exact' && <small className="muted"> · approximate</small>}
                </span>
                <b>Add</b>
              </button>
            ))}
            <button className="wide" onClick={() => setPicking(true)}><MapPin size={16} /> Choose the spot on the map instead</button>
          </>
        )}
      </div>
    </div>
  )
}
