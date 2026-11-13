import { MapPin } from 'lucide-react'
import { useState } from 'react'
import { findLocation, type Located } from '../lib/findplace'
import { addCustomPlace, useAppData } from '../lib/store'
import { tagOf } from './FilterChips'

// Under a journey's "From" or "To": link it to a place on the map (an airport, a station, a hotel), so the day
// can show how you get there and the planner can allow for it. Pick a place you've saved, or search the map.
export function PlaceLink({
  label,
  tripId,
  text,
  placeId,
  onLink,
}: {
  label: string // "From" or "To"
  tripId: string
  text: string
  placeId?: string
  onLink: (placeId: string | undefined, name?: string) => void
}) {
  const { places } = useAppData()
  const mine = places.filter((p) => p.tripId === tripId)
  const linked = mine.find((p) => p.id === placeId)
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<Located[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  if (linked && !open) {
    return (
      <p className="muted link-row">
        <MapPin size={14} aria-hidden /> {label} is on the map: <strong>{linked.name}</strong>{' '}
        <button className="link-btn" onClick={() => onLink(undefined)}>Unlink</button>
      </p>
    )
  }
  if (!open) {
    return (
      <button className="link-btn link-row" onClick={() => setOpen(true)}>
        <MapPin size={14} aria-hidden /> Link “{label.toLowerCase()}” to a place on the map
      </button>
    )
  }

  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  const own = mine
    .filter((p) => {
      const tag = tagOf(p)
      const name = p.name.toLowerCase()
      return tag === 'Transport' || tag === 'Accommodation' || words.some((w) => name.includes(w))
    })
    .sort((a, b) => Number(words.some((w) => b.name.toLowerCase().includes(w))) - Number(words.some((w) => a.name.toLowerCase().includes(w))))
    .slice(0, 6)

  async function search() {
    if (!text.trim()) return setMessage('Type where it leaves from or arrives at first, for example “Changi Airport”.')
    setBusy(true)
    setMessage('')
    const found = await findLocation(text.trim())
    setBusy(false)
    setResults(found ?? [])
    if (!found) setMessage('The search service couldn’t be reached. Check your connection and try again.')
    else if (found.length === 0) setMessage('Nothing found. Try a simpler name, like “Changi Airport” or “KL Sentral”.')
  }

  function pick(id: string, name: string) {
    onLink(id, name)
    setOpen(false)
    setResults(null)
  }

  return (
    <div className="card link-panel">
      <strong>Link “{text.trim() || label.toLowerCase()}” to a place</strong>
      {own.length > 0 && <p className="muted">From your saved places:</p>}
      {own.map((p) => (
        <button key={p.id} className="soft-btn wide" onClick={() => pick(p.id, p.name)}>{p.name}</button>
      ))}
      <button className="soft-btn wide" disabled={busy} onClick={() => void search()}>{busy ? 'Searching…' : `Search the map for “${text.trim() || '…'}”`}</button>
      {message && <p className="muted" role="status">{message}</p>}
      {results?.map((r, i) => (
        <button key={i} className="soft-btn wide" onClick={() => pick(addCustomPlace({ tripId, name: r.name, lat: r.lat, lon: r.lon, tag: 'Transport' }), r.name)}>
          {r.name} <small className="muted">· {r.address.split(',').slice(1, 3).join(',').trim()}</small>
        </button>
      ))}
      <button className="link-btn" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  )
}
