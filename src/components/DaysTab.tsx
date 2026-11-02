import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BedDouble, CalendarCheck, ChevronDown, ChevronUp, GripVertical, MoveRight, Pencil, Plus, Sparkles, TriangleAlert } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  LONG_TRAVEL_MINUTES,
  MODES,
  appleMapsUrl,
  estimate,
  defaultModeFor,
  fmtKm,
  fmtMinutes,
  getCommute,
  googleMapsUrl,
  useCommute,
  type Commute,
  type Mode,
} from '../lib/commute'
import { fromISO, shortDate, stopLabel, stopsOn, toISO } from '../lib/days'
import { hoursWarning } from '../lib/hours'
import { arrivalDate, journeyPositions } from '../lib/journeys'
import { dayStays } from '../lib/stays'
import { fmtMoney } from '../lib/money'
import { addExpense, addToDay, moveDayItem, moveItemToDay, removeDayItem, setLegMode, sortDayByTime, updateDayItem, useAppData } from '../lib/store'
import { EXPENSE_CATEGORIES, type Day, type DayItem, type ExpenseCategory, type Place, type Stop, type Transfer, type Trip } from '../types'
import { DayMap } from './DayMap'
import { FilterChips, tagOf } from './FilterChips'
import { PlaceSheet, categoryFor } from './PlaceSheet'
import { StaySheet } from './StaySheet'
import { SuggestSheet } from './SuggestSheet'
import { PlaceThumb, TagIcon } from './TagIcon'
import { KIND_INFO, TransferSheet } from './TransferSheet'
import { WeatherChip } from './WeatherChip'
import { ask } from '../lib/confirm'

// ---- Travel between places ----

function ModeLine({ from, to, mode }: { from: Place; to: Place; mode: Mode }) {
  const c = useCommute(from, to, mode)
  const info = MODES.find((m) => m.id === mode)!
  return (
    <p className="mode-line">
      <info.Icon size={15} aria-hidden /> {info.label}: {c && `${fmtMinutes(c.minutes)} · ${fmtKm(c.km)}`}
      {c?.approx && <small className="muted"> approx.</small>}
    </p>
  )
}

// How you'll make one journey: your choice for this leg, or a walk for short hops and public transport otherwise.
const legModeOf = (day: Day, from: Place, to: Place): Mode => day.legModes?.[`${from.id}>${to.id}`] ?? defaultModeFor(from, to)

function LegRow({ day, from, to }: { day: Day; from: Place; to: Place }) {
  const [open, setOpen] = useState(false)
  const mode = legModeOf(day, from, to)
  const c = useCommute(from, to, mode)
  const info = MODES.find((m) => m.id === mode)!
  if (!c) return null
  return (
    <div className="leg">
      <div className="leg-bar">
        <div className="mode-pick" role="group" aria-label="How you'll get there">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={mode === m.id ? 'on' : ''}
              aria-pressed={mode === m.id}
              aria-label={m.label}
              title={m.label}
              onClick={() => setLegMode(day.id, from.id, to.id, m.id)}
            >
              <m.Icon size={16} />
            </button>
          ))}
        </div>
        <button className="leg-sum" onClick={() => setOpen(!open)} aria-expanded={open}>
          {fmtMinutes(c.minutes)} · {fmtKm(c.km)}
          {c.approx && <small> approx.</small>}
          {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        </button>
      </div>
      {open && (
        <div className="leg-more">
          {MODES.map((m) => (
            <ModeLine key={m.id} from={from} to={to} mode={m.id} />
          ))}
          <div className="row buttons">
            <a className="btn" href={googleMapsUrl(from, to, mode)} target="_blank" rel="noopener noreferrer">
              Open in Google Maps
            </a>
            <a className="btn" href={appleMapsUrl(from, to, mode)} target="_blank" rel="noopener noreferrer">
              Open in Apple Maps
            </a>
          </div>
          <p className="muted">The links use the “{info.label}” you picked for this journey.</p>
        </div>
      )}
    </div>
  )
}

// The day's travel time: each journey counted by its own mode.
function DayTravel({ day, points }: { day: Day; points: Place[] }) {
  const legs = points.slice(1).map((p, i) => ({ from: points[i], to: p, mode: legModeOf(day, points[i], p) }))
  const key = legs.map((l) => `${l.from.id}>${l.to.id}:${l.mode}`).join(',')
  const [total, setTotal] = useState<{ key: string; sum: number; approx: boolean } | null>(null)
  useEffect(() => {
    let live = true
    Promise.all(legs.map((l) => getCommute(l.from, l.to, l.mode))).then((results: Commute[]) => {
      if (live) setTotal({ key, sum: results.reduce((a, c) => a + c.minutes, 0), approx: results.some((c) => c.approx) })
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (legs.length === 0) return null
  const quick = legs.reduce((a, l) => a + estimate(l.from, l.to, l.mode).minutes, 0)
  const sum = total?.key === key ? total.sum : quick
  const approx = total?.key === key ? total.approx : true
  return (
    <div className={'travel' + (sum > LONG_TRAVEL_MINUTES ? ' warn' : '')}>
      <strong>
        Travel today, including to and from where you’re staying: {fmtMinutes(sum)}
        {approx && <small> approx.</small>}
      </strong>
      <span className="muted">Each journey uses the way you picked for it.</span>
      {sum > LONG_TRAVEL_MINUTES && <span>That’s over 2½ hours of travel — consider moving something to another day.</span>}
    </div>
  )
}

// ---- Cards ----

function StayCard({ label, place, onClick }: { label: string; place: Place; onClick: () => void }) {
  return (
    <div className="item stay-card">
      <span aria-hidden /> {/* keeps the icon in the same column as the place icons below */}
      <span className="stay-tile"><BedDouble size={22} aria-hidden /></span>
      <button className="item-main" onClick={onClick}>
        <span className="muted">{label}</span>
        <strong className="serif">{place.name}</strong>
      </button>
    </div>
  )
}

function TransferCard({ t, day, onEdit }: { t: Transfer; day: string; onEdit: () => void }) {
  const { Icon, label } = KIND_INFO[t.kind]
  const end = arrivalDate(t)
  const times =
    end === t.date
      ? [t.departTime, t.arriveTime].filter(Boolean).join(' → ')
      : day === t.date
        ? [t.departTime, `arrives ${shortDate(end)}${t.arriveTime ? ' ' + t.arriveTime : ''}`].filter(Boolean).join(' → ')
        : `${t.departTime ? `left ${shortDate(t.date)} ${t.departTime} → ` : ''}arrives ${t.arriveTime ?? 'today'}`
  return (
    <div className="item transfer-card">
      <span aria-hidden />
      <span className="stay-tile transfer"><Icon size={22} /></span>
      <div className="item-main static">
        <strong className="serif">{t.title}</strong>
        <span className="muted">
          {[label, t.from && t.to ? `${t.from} → ${t.to}` : '', times, t.reference ? `Ref ${t.reference}` : ''].filter(Boolean).join(' · ')}
        </span>
        {t.note && <span className="muted">{t.note}</span>}
      </div>
      <button className="icon-btn" aria-label="Edit journey" onClick={onEdit}><Pencil size={18} /></button>
    </div>
  )
}

// A small amount field right on the card, so logging a spend takes a few seconds.
function QuickExpense({ place, day, currency, onDone }: { place: Place; day: Day; currency: string; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>(categoryFor(place.tag))
  const [error, setError] = useState('')

  function add() {
    const n = parseFloat(amount)
    if (!Number.isFinite(n) || n <= 0) return setError('Enter an amount greater than zero.')
    addExpense({
      tripId: place.tripId,
      date: day.date,
      title: note.trim() ? `${place.name}: ${note.trim()}` : place.name,
      amount: n,
      category,
      placeId: place.id,
    })
    onDone()
  }

  return (
    <div className="quick-panel">
      <div className="row">
        <label>
          Amount ({currency})
          <input autoFocus inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError('') }} onKeyDown={(e) => e.key === 'Enter' && add()} />
        </label>
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
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row buttons">
        <button className="primary" onClick={add}>Add expense</button>
        <button onClick={onDone}>Cancel</button>
      </div>
    </div>
  )
}

function ItemRow({
  index, day, allDays, item, place, next, currency, focused, expanded, onToggle, onOpen,
}: {
  index: number; day: Day; allDays: Day[]; item: DayItem; place: Place | undefined; next: Place | undefined
  currency: string; focused: boolean; expanded: boolean; onToggle: () => void; onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const { expenses } = useAppData()
  const [panel, setPanel] = useState<'expense' | 'edit' | 'book' | 'move' | null>(null)
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }
  const tag = place ? tagOf(place) : 'Untagged'
  const spent = expenses
    .filter((e) => e.placeId === item.placeId && e.date === day.date)
    .reduce((s, e) => s + e.amount, 0)
  const sub = [item.time, item.cost ? fmtMoney(item.cost, currency) : '', item.note].filter(Boolean).join(' · ')
  const warning = place ? hoursWarning(place.details?.hours, day.date, item.time) : null
  useEffect(() => {
    if (!expanded) setPanel(null)
  }, [expanded])

  return (
    <div ref={setNodeRef} style={style} className="item-wrap">
      <div className={'item place-item' + (item.done ? ' done' : '') + (focused ? ' focused' : '') + (expanded ? ' expanded' : '')}>
        <button className="handle" aria-label="Drag to reorder" {...attributes} {...listeners}>
          <GripVertical size={20} />
        </button>
        <PlaceThumb place={place} size={52} number={index + 1} />
        <button className="item-main row-main" onClick={onToggle} aria-expanded={expanded} aria-label={`${place?.name ?? 'Place'}: show on the map and open options`}>
          <span className="item-text">
            <strong className="serif">{place?.name ?? '(place removed)'}</strong>
            <span className="muted">{tag}</span>
            {sub && <span className="muted">{sub}</span>}
            {(item.reservation || warning) && (
              <span className="item-flags">
                {item.reservation && (
                  <span className={'rsv ' + item.reservation}>
                    <CalendarCheck size={13} aria-hidden /> {item.reservation === 'booked' ? 'Booked' : 'Needs booking'}
                  </span>
                )}
                {warning && (
                  <span className="rsv warn">
                    <TriangleAlert size={13} aria-hidden /> {warning}
                  </span>
                )}
              </span>
            )}
          </span>
          <ChevronDown size={18} className="item-chev" aria-hidden />
        </button>
        <input
          type="checkbox"
          className="tick"
          aria-label="Done"
          checked={item.done}
          onChange={(e) => updateDayItem(day.id, item.id, { done: e.target.checked })}
        />
        {expanded && place && (
          <div className="item-panel">
            <div className="item-meta">
              {item.time && <span>{item.time}</span>}
              {place.details?.hours && <span>Open {place.details.hours}</span>}
              {item.cost ? <span>Planned {fmtMoney(item.cost, currency)}</span> : null}
              {spent > 0 && <span>{fmtMoney(spent, currency)} spent</span>}
              {item.note && <span>Note: {item.note}</span>}
              {item.reservationNote && <span>Booking: {item.reservationNote}</span>}
            </div>
            <div className="chips">
              <button className="primary" onClick={onOpen}>Details and photos</button>
              <button onClick={() => setPanel(panel === 'expense' ? null : 'expense')}><Plus size={15} /> Expense</button>
              <button onClick={() => setPanel(panel === 'edit' ? null : 'edit')}>Time and note</button>
              <button onClick={() => setPanel(panel === 'book' ? null : 'book')}><CalendarCheck size={15} /> Booking</button>
              {allDays.length > 1 && <button onClick={() => setPanel(panel === 'move' ? null : 'move')}><MoveRight size={15} /> Move</button>}
              <button className="danger" onClick={() => ask(`Remove “${place.name}” from this day?`, () => removeDayItem(day.id, item.id), 'Remove')}>Remove</button>
            </div>
            {panel === 'expense' && <QuickExpense place={place} day={day} currency={currency} onDone={() => setPanel(null)} />}
            {panel === 'book' && (
              <div className="quick-panel">
                <div className="mode-pick wide-pick" role="group" aria-label="Booking status">
                  {([[undefined, 'Not needed'], ['todo', 'Need to book'], ['booked', 'Booked']] as const).map(([v, l]) => (
                    <button key={l} className={item.reservation === v ? 'on' : ''} aria-pressed={item.reservation === v} onClick={() => updateDayItem(day.id, item.id, { reservation: v })}>
                      {l}
                    </button>
                  ))}
                </div>
                {item.reservation && (
                  <label>
                    Confirmation, time or name it’s under
                    <input value={item.reservationNote ?? ''} placeholder="e.g. 7:30pm, under Sherry, ref 48213" onChange={(e) => updateDayItem(day.id, item.id, { reservationNote: e.target.value || undefined })} />
                  </label>
                )}
              </div>
            )}
            {panel === 'move' && (
              <div className="quick-panel">
                <label>
                  Move to another day
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        moveItemToDay(day.id, item.id, e.target.value)
                        onToggle()
                      }
                    }}
                  >
                    <option value="">Choose a day…</option>
                    {allDays.filter((d) => d.id !== day.id).map((d) => (
                      <option key={d.id} value={d.id}>{shortDate(d.date)}{d.items.length ? ` (${d.items.length} planned)` : ''}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {panel === 'edit' && (
              <div className="quick-panel">
                <div className="row">
                  <label>
                    Time
                    <input type="time" value={item.time ?? ''} onChange={(e) => updateDayItem(day.id, item.id, { time: e.target.value || undefined })} />
                  </label>
                  {place.tag !== 'Food' && place.tag !== 'Cafes' && (
                  <label>
                    Planned cost (tickets, tours)
                    <input
                      inputMode="decimal"
                      value={item.cost ?? ''}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value)
                        updateDayItem(day.id, item.id, { cost: Number.isFinite(n) && n >= 0 ? n : undefined })
                      }}
                    />
                  </label>
                  )}
                </div>
                <label>
                  Note, such as the dish to order
                  <textarea rows={2} value={item.note} onChange={(e) => updateDayItem(day.id, item.id, { note: e.target.value })} />
                </label>
              </div>
            )}
          </div>
        )}
      </div>
      {place && next && <LegRow day={day} from={place} to={next} />}
    </div>
  )
}

// ---- Adding places ----

function PlacePicker({ trip, day, onClose }: { trip: Trip; day: Day; onClose: () => void }) {
  const { places, groups } = useAppData()
  const mine = useMemo(() => places.filter((p) => p.tripId === trip.id), [places, trip.id])
  const myGroups = groups.filter((g) => g.tripId === trip.id)
  const stopIds = stopsOn(trip, day.date).map((s) => s.id)
  const [groupId, setGroupId] = useState(myGroups.find((g) => g.stopId && stopIds.includes(g.stopId))?.id ?? 'all')
  const [tags, setTags] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const onDay = new Set(day.items.map((i) => i.placeId))
  const q = query.trim().toLowerCase()
  const list = mine.filter(
    (p) =>
      !onDay.has(p.id) &&
      (groupId === 'all' || p.groupId === groupId) &&
      (tags.length === 0 || tags.includes(tagOf(p))) &&
      (!q || p.name.toLowerCase().includes(q)),
  )

  return (
    <div className="sheet" role="dialog" aria-label="Add places">
      <div className="sheet-head">
        <strong className="serif">Add to {shortDate(day.date)}</strong>
        <button className="primary" onClick={onClose}>Done</button>
      </div>
      <div className="sheet-body">
        <input type="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {myGroups.length > 1 && (
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Area">
            <option value="all">All areas</option>
            {myGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
        <FilterChips places={mine} value={tags} onChange={setTags} />
        {list.length === 0 && <p className="muted">Nothing left to add with these filters.</p>}
        {list.slice(0, 100).map((p) => (
          <button key={p.id} className="pick" onClick={() => addToDay(day.id, p.id)}>
            <TagIcon tag={tagOf(p)} size={32} />
            <span>{p.name}</span>
            <b>Add</b>
          </button>
        ))}
        {list.length > 100 && <p className="muted">Showing 100 — search or filter to narrow down.</p>}
      </div>
    </div>
  )
}

// ---- The screen ----

export function DaysTab({ initialDate }: { initialDate?: string }) {
  const { trips, activeTripId, days, places, transfers, groups } = useAppData()
  const trip = trips.find((t) => t.id === activeTripId)
  const tripDays = useMemo(
    () => days.filter((d) => d.tripId === activeTripId).sort((a, b) => a.date.localeCompare(b.date)),
    [days, activeTripId],
  )
  const [selected, setSelected] = useState('')
  const [picking, setPicking] = useState(false)
  const [suggestFor, setSuggestFor] = useState<Stop | null>(null)
  const [stayFor, setStayFor] = useState<{ checkIn: string; checkOut: string } | null>(null)
  const [focusId, setFocusId] = useState<string | undefined>()
  const [openItem, setOpenItem] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [transferSheet, setTransferSheet] = useState<{ transfer?: Transfer } | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Open on the day from the address, else today if it's a trip day, else the first day.
  useEffect(() => {
    if (tripDays.length === 0) return
    const wanted = initialDate && tripDays.find((d) => d.date === initialDate)
    if (wanted && wanted.id !== selected) setSelected(wanted.id)
    else if (!tripDays.some((d) => d.id === selected)) {
      setSelected((tripDays.find((d) => d.date === toISO(new Date())) ?? tripDays[0]).id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripDays, initialDate])

  useEffect(() => {
    setFocusId(undefined)
    setExpandedId(null)
  }, [selected])

  const day = tripDays.find((d) => d.id === selected)
  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])
  const dayPlaces = useMemo(
    () => (day ? day.items.map((i) => placeById.get(i.placeId)).filter((p): p is Place => !!p) : []),
    [day, placeById],
  )

  // Keep the chosen day in view as you move between days.
  useEffect(() => {
    const strip = document.querySelector<HTMLElement>('.pills')
    const chip = strip?.querySelector<HTMLElement>('button.on')
    if (strip && chip) strip.scrollTo({ left: chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2 })
  }, [selected, tripDays])

  if (!trip) return null
  if (!day) {
    return (
      <div className="page">
        <h1>Days</h1>
        <p className="muted">This trip has no dates yet.</p>
      </div>
    )
  }

  const dayNumber = tripDays.indexOf(day) + 1
  const label = stopLabel(trip, day.date)
  const dayStops = stopsOn(trip, day.date)
  const arriving = dayStops[dayStops.length - 1]
  const stays = dayStays(trip, day.date)
  const startStay = placeById.get(stays.start?.placeId ?? '')
  const endStay = placeById.get(stays.end?.placeId ?? '')
  const done = day.items.filter((i) => i.done).length
  const dayTransfers = transfers
    .filter((t) => t.tripId === trip.id && (t.date === day.date || arrivalDate(t) === day.date))
    .sort((a, b) => ((a.date === day.date ? a.departTime : a.arriveTime) ?? '').localeCompare((b.date === day.date ? b.departTime : b.arriveTime) ?? ''))
  const planned =
    day.items.reduce((s, i) => s + (i.cost ?? 0), 0) + dayTransfers.reduce((s, t) => s + (t.cost ?? 0), 0)
  const timed = day.items.filter((i) => i.time).length
  const route = [startStay, ...dayPlaces, endStay].filter((p): p is Place => !!p)
  const weatherPoint =
    route[0] ?? places.find((p) => p.tripId === trip.id && p.groupId && groups.some((g) => g.id === p.groupId && g.stopId === arriving?.id))
  const jpos = journeyPositions(day.items, dayTransfers, day.date)
  const journeysAt = (i: number) => dayTransfers.filter((t) => jpos.get(t.id) === i)
  const journeyCard = (t: Transfer) => <TransferCard key={t.id} t={t} day={day.date} onEdit={() => setTransferSheet({ transfer: t })} />
  const sheetItem = openItem ? day.items.find((i) => i.id === openItem) : undefined

  function onDragEnd(e: DragEndEvent) {
    if (day && e.over && e.active.id !== e.over.id) moveDayItem(day.id, String(e.active.id), String(e.over.id))
  }

  return (
    <div className="page wide">
      <div className="hero">
        <div>
          <h1>{label || 'No stop for this date'}</h1>
          <p>{shortDate(day.date)} · Day {dayNumber} of {tripDays.length}</p>
          <WeatherChip point={weatherPoint} date={day.date} />
        </div>
        <div className="hero-badge">
          <strong>{day.items.length}</strong>
          <span>{day.items.length === 1 ? 'place' : 'places'}</span>
        </div>
      </div>

      <div className="pills" role="tablist" aria-label="Days">
        {tripDays.map((d) => (
          <button
            key={d.id}
            role="tab"
            aria-selected={d.id === selected}
            aria-label={`${fromISO(d.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, ${d.items.length} places`}
            className={d.id === selected ? 'on' : ''}
            onClick={() => setSelected(d.id)}
          >
            <small>{fromISO(d.date).toLocaleDateString(undefined, { weekday: 'short' })}</small>
            <b>{fromISO(d.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</b>
          </button>
        ))}
      </div>

      <div className="day-grid">
        <aside className="day-side">
          <DayMap places={dayPlaces} startStay={startStay} endStay={endStay} focusId={focusId} onFocus={setFocusId} />
        </aside>
        <div>
          <div className="row between day-actions">
            <p className="muted">
              {done} of {day.items.length} done
              {planned > 0 && ` · planned ${fmtMoney(planned, trip.currency)}`}
            </p>
            {arriving && (
              <button onClick={() => setSuggestFor(arriving)}>
                <Sparkles size={16} /> Suggest my days
              </button>
            )}
          </div>

          {startStay && <StayCard label="Start from" place={startStay} onClick={() => setFocusId(startStay.id)} />}
          {!stays.end && arriving && arriving.departure > day.date && (
            <button className="wide subtle" onClick={() => setStayFor({ checkIn: day.date, checkOut: arriving.departure })}>
              <BedDouble size={16} /> Add where you’re staying in {arriving.name}
            </button>
          )}
          {startStay && dayPlaces[0] && <LegRow day={day} from={startStay} to={dayPlaces[0]} />}

          {day.items.length === 0 ? (
            <>
            {dayTransfers.map(journeyCard)}
            <div className="empty">
              <span className="empty-icon"><CalendarCheck size={30} /></span>
              <h3 className="display">A day with room in it.</h3>
              <p className="muted">Nothing planned yet. Add places from your list, or use “Suggest my days” to get a first draft.</p>
            </div>
            </>
          ) : (
            <>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={day.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  {day.items.map((item, i) => (
                    <Fragment key={item.id}>
                    {journeysAt(i).map(journeyCard)}
                    <ItemRow
                      index={i}
                      day={day}
                      allDays={tripDays}
                      item={item}
                      place={placeById.get(item.placeId)}
                      next={placeById.get(day.items[i + 1]?.placeId ?? '') ?? (i === day.items.length - 1 ? endStay : undefined)}
                      currency={trip.currency ?? 'USD'}
                      focused={item.placeId === focusId}
                      expanded={expandedId === item.id}
                      onToggle={() => {
                        // One tap: zoom the map to the place and open (or close) its options.
                        setFocusId(item.placeId)
                        setExpandedId(expandedId === item.id ? null : item.id)
                      }}
                      onOpen={() => setOpenItem(item.id)}
                    />
                    </Fragment>
                  ))}
                  {journeysAt(day.items.length).map(journeyCard)}
                </SortableContext>
              </DndContext>
              {endStay && <StayCard label="Back to" place={endStay} onClick={() => setFocusId(endStay.id)} />}
              <DayTravel day={day} points={route} />
              {timed > 1 && <button className="wide" onClick={() => sortDayByTime(day.id)}>Sort by time</button>}
            </>
          )}
          <div className="row buttons add-row">
            <button className="primary" onClick={() => setPicking(true)}>
              <Plus size={18} /> Add places
            </button>
            <button onClick={() => setTransferSheet({})}>
              <Plus size={18} /> Add journey
            </button>
          </div>
        </div>
      </div>

      {picking && <PlacePicker trip={trip} day={day} onClose={() => setPicking(false)} />}
      {suggestFor && <SuggestSheet trip={trip} stop={suggestFor} onClose={() => setSuggestFor(null)} />}
      {stayFor && <StaySheet trip={trip} defaults={stayFor} onClose={() => setStayFor(null)} />}
      {transferSheet && (
        <TransferSheet trip={trip} date={day.date} transfer={transferSheet.transfer} onClose={() => setTransferSheet(null)} />
      )}
      {sheetItem && (
        <PlaceSheet placeId={sheetItem.placeId} visit={{ day, item: sheetItem }} onClose={() => setOpenItem(null)} />
      )}
    </div>
  )
}
