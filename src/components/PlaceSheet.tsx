import { ExternalLink, ImagePlus, Phone, Search, Star, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { lookupPlace } from '../lib/lookup'
import { fileToDataUrl } from '../lib/photo'
import { fmtMoney } from '../lib/money'
import {
  setPlaceMust,
  addPlacePhoto,
  applyLookups,
  deleteExpense,
  removeDayItem,
  removePlacePhoto,
  renamePlace,
  resetPlaceName,
  setPlaceTag,
  setPlaceDetails,
  updateDayItem,
  useAppData,
} from '../lib/store'
import { TAGS, TAG_STYLE } from '../lib/tagging'
import { EXPENSE_CATEGORIES, type Day, type DayItem, type ExpenseCategory, type Place, type PlaceDetails, type Tag, type Trip } from '../types'
import { TagIcon, tagName } from './TagIcon'
import { AmountInput, CostField } from './AmountInput'
import { addExpenseIn, entryCurrency, tripCurrency } from '../lib/convert'

const enc = encodeURIComponent

// A sensible starting category for an expense, from the place's own category.
export function categoryFor(tag: string | undefined): ExpenseCategory {
  switch (tag) {
    case 'Food':
    case 'Cafes': return 'Food & drink'
    case 'Accommodation': return 'Accommodation'
    case 'Shopping': return 'Shopping'
    case 'Transport': return 'Transport'
    case 'Sightseeing':
    case 'Nature & outdoors':
    case 'Nightlife': return 'Activities'
    default: return 'Other'
  }
}

// Log what you spend at this place, on this day. It shows up in the Budget tab too.
function VisitExpenses({ trip, place, day, currency }: { trip: Trip | undefined; place: Place; day: Day; currency: string }) {
  const { expenses } = useAppData()
  const [cur, setCur] = useState(entryCurrency(trip))
  const mine = expenses.filter((e) => e.placeId === place.id && e.date === day.date)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>(categoryFor(place.tag))
  const [error, setError] = useState('')
  const total = mine.reduce((s, e) => s + e.amount, 0)

  async function add() {
    const n = parseFloat(amount)
    if (!Number.isFinite(n) || n <= 0) return setError('Enter an amount greater than zero.')
    const ok = await addExpenseIn(
      { tripId: place.tripId, date: day.date, title: note.trim() ? `${place.name}: ${note.trim()}` : place.name, category, placeId: place.id },
      n, cur, currency,
    )
    if (!ok) return setError(`Couldn’t get the ${cur}→${currency} exchange rate. Try again, or enter it in ${currency}.`)
    setAmount('')
    setNote('')
    setError('')
  }

  return (
    <>
      <h3>Expenses{total > 0 && <span className="muted"> · {fmtMoney(total, currency)} spent here</span>}</h3>
      <div className="card form">
        {mine.map((e) => (
          <div key={e.id} className="check">
            <span style={{ flex: 1 }}>
              {e.title.startsWith(place.name + ': ') ? e.title.slice(place.name.length + 2) : 'Spent'}
              <small className="muted"> · {e.category}</small>
            </span>
            <strong>{fmtMoney(e.amount, currency)}</strong>
            <button aria-label="Delete expense" onClick={() => deleteExpense(e.id)}><X size={16} /></button>
          </div>
        ))}
        <div className="row">
          <AmountInput label="Amount" trip={trip ?? {}} amount={amount} currency={cur} onChange={(a, c) => { setAmount(a); setCur(c); setError('') }} onEnter={() => void add()} />
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          What was it for? (optional)
          <input value={note} placeholder="e.g. Bibimbap and a drink" onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary wide" onClick={() => void add()}>Add expense</button>
      </div>
    </>
  )
}

// Rename a place. The original name is kept so you can undo.
function NameField({ place }: { place: Place }) {
  const [text, setText] = useState(place.name)
  useEffect(() => setText(place.name), [place.name])
  return (
    <>
      <label>
        Name
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim()
            if (v && v !== place.name) renamePlace(place.id, v)
            else setText(place.name)
          }}
        />
      </label>
      {place.originalName && (
        <p className="muted">
          Originally “{place.originalName}”{' '}
          <button className="linklike" onClick={() => resetPlaceName(place.id)}>Undo</button>
        </p>
      )}
    </>
  )
}

// Everything about one place: photos, what it is, opening hours, links — and, when you open it
// from a day, the details of that visit (time, cost, note).
export function PlaceSheet({
  placeId,
  visit,
  onClose,
}: {
  placeId: string
  visit?: { day: Day; item: DayItem }
  onClose: () => void
}) {
  const { places, groups, trips } = useAppData()
  const place = places.find((p) => p.id === placeId)
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  if (!place) return null

  const trip = trips.find((t) => t.id === place.tripId)
  const area = groups.find((g) => g.id === place.groupId)?.name
  const tag = tagName(place)
  const photos = place.photos ?? []
  const hero = photos[photoIndex] ?? (photos.length === 0 ? place.details?.imageUrl : undefined)
  const d = place.details ?? {}
  const live = visit && visit.day.items.find((i) => i.id === visit.item.id)

  async function onLookup() {
    setBusy(true)
    setStatus('Looking it up…')
    const result = await lookupPlace(place!)
    setBusy(false)
    if (result.status === 'unavailable') {
      setStatus('The lookup services are busy or can’t be reached right now. Try again in a minute, or use the search links below.')
      return
    }
    if (result.status === 'none') {
      applyLookups([{ id: place!.id, lookup: result.complete ? 'none' : 'partial' }])
      setStatus('Couldn’t find a matching listing online. Try the search links below, or add details yourself.')
      return
    }
    // Keep anything you typed yourself; fill in the rest.
    applyLookups([{ id: place!.id, lookup: result.complete ? 'found' : 'partial', details: result.details }])
    setStatus(`Found details from ${result.details.source}.`)
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return
    try {
      addPlacePhoto(place!.id, await fileToDataUrl(file))
      setPhotoIndex((place!.photos ?? []).length)
      setStatus('')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Couldn’t add that photo.')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const setField = (k: keyof PlaceDetails, v: string) => {
    const next = { ...d, [k]: v.trim() === '' ? undefined : v }
    setPlaceDetails(place.id, Object.values(next).some(Boolean) ? next : undefined)
  }

  const query = `${place.name} ${area ?? ''}`.trim()
  const hasAnything = d.summary || d.hours || d.website || d.phone || d.cuisine

  return (
    <div className="sheet" role="dialog" aria-label={`Details for ${place.name}`}>
      <div className="sheet-head">
        <strong className="serif">Place details</strong>
        <span className="head-actions">
          <button className={'star-pill' + (place.must ? ' on' : '')} aria-pressed={!!place.must} onClick={() => setPlaceMust(place.id, !place.must)}>
            <Star size={16} fill={place.must ? 'currentColor' : 'none'} /> Must-do
          </button>
          <button onClick={onClose}><X size={16} /> Close</button>
        </span>
      </div>
      <div className="sheet-body place-sheet">
        <div className="photo-hero">
          {hero ? <img src={hero} alt={place.name} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none' }} /> : (
            <div className="photo-empty" style={{ background: TAG_STYLE[tag as keyof typeof TAG_STYLE].tint }}>
              <TagIcon tag={tag} size={56} />
              <span className="muted">No photo yet</span>
            </div>
          )}
        </div>
        {photos.length > 0 && (
          <div className="photo-strip">
            {photos.map((src, i) => (
              <div key={i} className={'thumb' + (i === photoIndex ? ' on' : '')}>
                <button aria-label={`Show photo ${i + 1}`} onClick={() => setPhotoIndex(i)}>
                  <img src={src} alt="" />
                </button>
                <button className="thumb-x" aria-label="Remove photo" onClick={() => { removePlacePhoto(place.id, i); setPhotoIndex(0) }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
        <div className="row buttons">
          <button onClick={() => fileInput.current?.click()}><ImagePlus size={16} /> Add your own photo</button>
          <button className="primary" disabled={busy} onClick={onLookup}><Search size={16} /> Look up online</button>
        </div>
        {status && <p className="muted" role="status">{status}</p>}

        <h2 className="place-title">{place.name}</h2>
        <p className="muted">{tag}{area ? ` · ${area}` : ''}{d.cuisine ? ` · ${d.cuisine}` : ''}{place.layer && !/^untitled layer$/i.test(place.layer) && place.layer !== 'Added by you' ? ` · Layer: ${place.layer}` : ''}</p>
        {place.description && <p className="desc">{place.description}</p>}
        {d.summary && <p>{d.summary}</p>}
        {d.hours && <p><strong>Opening hours</strong><br />{d.hours}</p>}
        <div className="row buttons">
          {d.website && (
            <a className="btn" href={d.website} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} /> Website
            </a>
          )}
          {d.phone && (
            <a className="btn" href={`tel:${d.phone.replace(/[^\d+]/g, '')}`}><Phone size={16} /> {d.phone}</a>
          )}
        </div>
        {d.source && <p className="muted">Source: {d.source}</p>}
        {!hasAnything && !status && (
          <p className="muted">Tap “Look up online” to fetch hours, a website and a description where they exist.</p>
        )}

        <h3>Find out more</h3>
        <div className="row buttons">
          <a className="btn" href={`https://www.google.com/maps/search/?api=1&query=${enc(query)}%20${place.lat},${place.lon}`} target="_blank" rel="noopener noreferrer">Google Maps</a>
          <a className="btn" href={`https://www.google.com/search?tbm=isch&q=${enc(query)}`} target="_blank" rel="noopener noreferrer">Photos</a>
          <a className="btn" href={`https://www.google.com/search?q=${enc(query + ' menu opening hours')}`} target="_blank" rel="noopener noreferrer">Menu and hours</a>
          <a className="btn" href={`https://www.google.com/search?q=${enc(query + ' instagram')}`} target="_blank" rel="noopener noreferrer">Instagram</a>
        </div>

        <button className="wide" onClick={() => setEditing(!editing)}>{editing ? 'Done editing' : 'Edit details yourself'}</button>
        {editing && (
          <div className="card form">
            <NameField place={place} />
            <label>
              Category
              <select value={place.tag ?? ''} onChange={(e) => setPlaceTag(place.id, (e.target.value || undefined) as Tag | undefined)}>
                <option value="">Untagged</option>
                {TAGS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>About<textarea rows={3} value={d.summary ?? ''} onChange={(e) => setField('summary', e.target.value)} /></label>
            <label>Opening hours<input value={d.hours ?? ''} onChange={(e) => setField('hours', e.target.value)} /></label>
            <label>Website<input inputMode="url" placeholder="https://…" value={d.website ?? ''} onChange={(e) => setField('website', /^https?:\/\//i.test(e.target.value) || e.target.value === '' ? e.target.value : 'https://' + e.target.value)} /></label>
            <label>Phone<input inputMode="tel" value={d.phone ?? ''} onChange={(e) => setField('phone', e.target.value)} /></label>
          </div>
        )}

        {visit && live && (
          <>
            <VisitExpenses trip={trip} place={place} day={visit.day} currency={tripCurrency(trip)} />
            <h3>This visit</h3>
            <div className="card form">
              <label>
                Time (optional)
                <input type="time" value={live.time ?? ''} onChange={(e) => updateDayItem(visit.day.id, live.id, { time: e.target.value || undefined })} />
              </label>
              <CostField label="Planned cost (optional)" trip={trip ?? {}} value={live.cost} onCommit={(cost) => updateDayItem(visit.day.id, live.id, { cost })} />
              <label>
                Note — for example the dish you want to order
                <textarea rows={3} value={live.note} onChange={(e) => updateDayItem(visit.day.id, live.id, { note: e.target.value })} />
              </label>
              <button className="danger" onClick={() => { removeDayItem(visit.day.id, live.id); onClose() }}>
                <Trash2 size={16} /> Remove from this day
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
