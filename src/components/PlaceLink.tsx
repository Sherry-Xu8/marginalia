import { MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { distanceKm } from '../lib/geo'
import { findLocation, type Located } from '../lib/findplace'
import { addCustomPlace, getState, useAppData } from '../lib/store'
import type { TransferKind } from '../types'
import { tagOf } from './FilterChips'

// What to look for on the map: "Heathrow (LHR), London" on a flight is "Heathrow Airport"; anything else as typed.
export function mapQueryFor(text: string, kind: TransferKind): string {
  const t = text.trim()
  if (t.length < 3) return ''
  if (kind === 'flight') {
    const named = t.match(/^(.+?)\s*\(([A-Z]{3})\)/)
    if (named) return /airport/i.test(named[1]) ? named[1] : `${named[1]} Airport`
    if (/^[A-Z]{3}$/.test(t)) return `${t} airport`
  }
  return t
}

// A name for a spot found on the map. The map's own name is used unless it's too vague ("Airport"), in which case
// what you searched for is ("Shenzhen Bao'an Airport").
export function nameFor(found: Located, query: string): string {
  const first = query.toLowerCase().split(/[^a-z0-9']+/).find((w) => w.length >= 3)
  return query && first && !found.name.toLowerCase().includes(first) ? query : found.name
}

// The saved place for a spot found on the map: one already there (same name, close by), or a new one.
export function placeFor(tripId: string, found: Located, query = ''): string {
  const name = nameFor(found, query)
  const near = getState().places.find((p) => p.tripId === tripId && p.name === name && distanceKm(p, found) < 0.5)
  return near?.id ?? addCustomPlace({ tripId, name, lat: found.lat, lon: found.lon, tag: 'Transport' })
}

// Under a journey's "From" or "To". The app looks what you've typed up on the map by itself ("Heathrow (LHR)" →
// Heathrow Airport) and links it when you save, so the day can show how you get there and the planner can allow
// for it. If it found the wrong spot, "Not right?" lets you pick a saved place or search again.
export function PlaceLink({
  label,
  tripId,
  kind,
  text,
  placeId,
  guess,
  onGuess,
  onLink,
}: {
  label: string // "From" or "To"
  tripId: string
  kind: TransferKind
  text: string
  placeId?: string
  guess: Located | null // what the automatic search found (linked when you save)
  onGuess: (found: Located | null) => void
  onLink: (placeId: string | undefined, name?: string) => void
}) {
  const { places } = useAppData()
  const mine = places.filter((p) => p.tripId === tripId)
  const linked = mine.find((p) => p.id === placeId)
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<Located[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [looking, setLooking] = useState(false)
  const query = mapQueryFor(text, kind)

  // Look it up a moment after you stop typing (or as soon as a flight lookup fills it in).
  useEffect(() => {
    if (placeId || !query) {
      onGuess(null)
      return
    }
    let live = true
    setLooking(true)
    const timer = setTimeout(async () => {
      const found = await findLocation(query)
      if (!live) return
      setLooking(false)
      onGuess(found?.[0] ?? null)
    }, 900)
    return () => {
      live = false
      clearTimeout(timer)
      setLooking(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, placeId])

  if (linked && !open) {
    return (
      <p className="muted link-row">
        <MapPin size={14} aria-hidden /> {label} is on the map: <strong>{linked.name}</strong>{' '}
        <button className="link-btn" onClick={() => onLink(undefined)}>Unlink</button>
      </p>
    )
  }
  if (!open) {
    if (guess) {
      const area = guess.address.split(',').slice(1, 3).join(',').trim()
      return (
        <p className="muted link-row">
          <MapPin size={14} aria-hidden /> {label}: <strong>{nameFor(guess, query)}</strong>
          {area && <small> · {area}</small>}{' '}
          <button className="link-btn" onClick={() => setOpen(true)}>Not right?</button>
        </p>
      )
    }
    if (looking) return <p className="muted link-row"><MapPin size={14} aria-hidden /> Finding “{text.trim()}” on the map…</p>
    if (!text.trim()) return null
    return (
      <button className="link-btn link-row" onClick={() => setOpen(true)}>
        <MapPin size={14} aria-hidden /> Couldn’t find “{text.trim()}” on the map. Choose it
      </button>
    )
  }

  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  const own = mine
    .filter((p) => {
      const tag = tagOf(p)
      const name = p.name.toLowerCase()
      return (tag === 'Transport' || tag === 'Accommodation') && words.some((w) => name.includes(w))
    })
    .sort((a, b) => Number(words.some((w) => b.name.toLowerCase().includes(w))) - Number(words.some((w) => a.name.toLowerCase().includes(w))))
    .slice(0, 6)

  async function search() {
    if (!text.trim()) return setMessage('Type where it leaves from or arrives at first, for example “Changi Airport”.')
    setBusy(true)
    setMessage('')
    const found = await findLocation(query || text.trim())
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
      <button className="soft-btn wide" disabled={busy} onClick={() => void search()}>{busy ? 'Searching…' : `Search the map for “${query || text.trim() || '…'}”`}</button>
      {message && <p className="muted" role="status">{message}</p>}
      {results?.map((r, i) => (
        <button key={i} className="soft-btn wide" onClick={() => pick(placeFor(tripId, r, query), nameFor(r, query))}>
          {nameFor(r, query)} <small className="muted">· {r.address.split(',').slice(1, 3).join(',').trim()}</small>
        </button>
      ))}
      <button className="link-btn" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  )
}
