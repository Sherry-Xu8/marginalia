import { MapPin, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { distanceKm } from '../lib/geo'
import { findLocation, type Located } from '../lib/findplace'
import { addCustomPlace, getState, useAppData } from '../lib/store'
import type { TransferKind } from '../types'
import { tagOf } from './FilterChips'
import { PinPicker } from './PinPicker'

// A spot found on the map for a journey's From or To, with the name it will be saved under.
export type Guess = Located & { label: string }

// The searches to try, in order, for what you typed. What you typed always comes first, except that a flight's
// "Heathrow (LHR), London" is searched as "Heathrow Airport" and a train's "Ipoh" as "Ipoh station" (a town's name
// alone finds the town). For buses and ferries the stop could be anywhere (a mall, a pier), so "… bus terminal" is
// only a last try.
export function searchesFor(text: string, kind: TransferKind): string[] {
  const t = text.trim()
  if (t.length < 3) return []
  const out: string[] = []
  if (kind === 'flight') {
    const named = t.match(/^(.+?)\s*\(([A-Z]{3})\)/)
    if (named) out.push(/airport/i.test(named[1]) ? named[1] : `${named[1]} Airport`)
    else if (/^[A-Z]{3}$/.test(t)) out.push(`${t} airport`)
  }
  if (kind === 'train' && !/station|sentral|central|terminal|stesen|stazione|bahnhof|gare|역|駅|站/i.test(t)) out.push(`${t} station`)
  out.push(t)
  if (kind === 'bus' && !/station|terminal|stop|bus|역|站/i.test(t)) out.push(`${t} bus terminal`)
  if (kind === 'ferry' && !/terminal|pier|port|jetty|ferry|harbour|harbor/i.test(t)) out.push(`${t} ferry terminal`)
  return [...new Set(out)]
}

// The name to save a found spot under: the map's own name when it matches what you typed; otherwise what you typed
// (a flight uses "Heathrow Airport" rather than "Heathrow (LHR), London"). A town found for a train becomes "… station".
function labelFor(found: Located, typed: string, via: string, kind: TransferKind): string {
  const name = found.name
  const words = typed.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter((w) => w.length >= 3)
  if (words.some((w) => name.toLowerCase().includes(w))) {
    return kind === 'train' && / station$/.test(via) && !/station|sentral|central|terminal/i.test(name) ? `${name} station` : name
  }
  return kind === 'flight' && via !== typed.trim() ? via : typed.trim() || name
}

// The saved place for a spot: one already there (same name, close by), or a new one.
export function placeFor(tripId: string, spot: { lat: number; lon: number }, name: string): string {
  const near = getState().places.find((p) => p.tripId === tripId && p.name === name && distanceKm(p, spot) < 0.5)
  return near?.id ?? addCustomPlace({ tripId, name, lat: spot.lat, lon: spot.lon, tag: 'Transport' })
}

// Under a journey's "From" or "To". The app looks up what you've typed on the map by itself and links it when you
// save, so the day can show how you get there and the planner can allow for it. If it found the wrong spot (or
// nothing), you can search for it yourself, pick a saved place, or drop a pin on the map.
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
  guess: Guess | null // what the automatic search found (linked when you save)
  onGuess: (found: Guess | null) => void
  onLink: (placeId: string | undefined, name?: string) => void
}) {
  const { places } = useAppData()
  const mine = places.filter((p) => p.tripId === tripId)
  const linked = mine.find((p) => p.id === placeId)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Located[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [looking, setLooking] = useState(false)
  const [pinning, setPinning] = useState(false)
  const tries = searchesFor(text, kind)
  const key = tries.join('|')
  // Trains, buses and ferries are looked for near your trip's places first (there are many "Central Stations").
  const near =
    kind === 'flight' || mine.length === 0
      ? undefined
      : { lat: mine.reduce((s, p) => s + p.lat, 0) / mine.length, lon: mine.reduce((s, p) => s + p.lon, 0) / mine.length }

  // Look it up a moment after you stop typing (or as soon as a flight lookup fills it in).
  useEffect(() => {
    if (placeId || tries.length === 0) {
      onGuess(null)
      return
    }
    let live = true
    setLooking(true)
    const timer = setTimeout(async () => {
      for (const via of tries) {
        const found = await findLocation(via, near)
        if (!live) return
        if (found && found.length > 0) {
          setLooking(false)
          onGuess({ ...found[0], label: labelFor(found[0], text, via, kind) })
          return
        }
      }
      setLooking(false)
      onGuess(null)
    }, 900)
    return () => {
      live = false
      clearTimeout(timer)
      setLooking(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, placeId])

  function openPanel() {
    setQ(text.trim())
    setResults(null)
    setMessage('')
    setOpen(true)
  }

  if (linked && !open) {
    return (
      <p className="muted link-row">
        <MapPin size={14} aria-hidden /> {label} is on the map: <strong>{linked.name}</strong>{' '}
        <button className="link-btn" onClick={() => onLink(undefined)}>Change</button>
      </p>
    )
  }
  if (!open) {
    if (guess) {
      const area = guess.address.split(',').slice(1, 3).join(',').trim()
      return (
        <p className="muted link-row">
          <MapPin size={14} aria-hidden /> {label}: <strong>{guess.label}</strong>
          {area && <small> · {area}</small>}{' '}
          <button className="link-btn" onClick={openPanel}>Not right?</button>
        </p>
      )
    }
    if (looking) return <p className="muted link-row"><MapPin size={14} aria-hidden /> Finding “{text.trim()}” on the map…</p>
    if (!text.trim()) return null
    return (
      <button className="link-btn link-row" onClick={openPanel}>
        <MapPin size={14} aria-hidden /> Couldn’t find “{text.trim()}” on the map. Find it
      </button>
    )
  }

  const words = q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2)
  const own = mine.filter((p) => words.some((w) => p.name.toLowerCase().includes(w)) || (tagOf(p) === 'Transport' && words.length === 0)).slice(0, 5)

  async function search() {
    if (!q.trim()) return setMessage('Type a name, an address, or paste a Google Maps link.')
    setBusy(true)
    setMessage('')
    const found = await findLocation(q.trim(), near)
    setBusy(false)
    setResults(found ?? [])
    if (!found) setMessage('The search service couldn’t be reached. Check your connection and try again.')
    else if (found.length === 0) setMessage('Nothing found. Try fewer words (just “Prangin Mall”), add the city, or drop a pin on the map.')
  }

  function pick(id: string, name: string) {
    onLink(id, name)
    setOpen(false)
    setResults(null)
    setPinning(false)
  }

  if (pinning) {
    return (
      <div className="card link-panel">
        <strong>Tap the map where “{text.trim() || label.toLowerCase()}” is</strong>
        <PinPicker
          center={guess ?? near ?? mine[0]}
          onCancel={() => setPinning(false)}
          onPick={(lat, lon) => pick(placeFor(tripId, { lat, lon }, text.trim() || `${label} point`), text.trim())}
        />
      </div>
    )
  }

  return (
    <div className="card link-panel">
      <strong>Find “{text.trim() || label.toLowerCase()}” on the map</strong>
      <div className="search-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
          placeholder="A name, an address or a Google Maps link"
          aria-label={`Search for the ${label.toLowerCase()} place`}
          autoFocus
        />
        <button className="primary" disabled={busy} onClick={() => void search()}>
          <Search size={16} /> {busy ? 'Searching…' : 'Search'}
        </button>
      </div>
      {message && <p className="muted" role="status">{message}</p>}
      {results?.map((r, i) => {
        const name = labelFor(r, q, q, kind)
        return (
          <button key={i} className="soft-btn wide" onClick={() => pick(placeFor(tripId, r, name), name)}>
            {r.name} <small className="muted">· {r.address.split(',').slice(1, 3).join(',').trim()}</small>
          </button>
        )
      })}
      {own.length > 0 && <p className="muted">Or one of your saved places:</p>}
      {own.map((p) => (
        <button key={p.id} className="soft-btn wide" onClick={() => pick(p.id, p.name)}>{p.name}</button>
      ))}
      <div className="row buttons">
        <button className="link-btn" onClick={() => setPinning(true)}>Drop a pin on the map instead</button>
        <button className="link-btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}
