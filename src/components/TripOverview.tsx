import { ArrowDown, ArrowRight, ArrowUp, BedDouble, ChevronDown, MoreHorizontal, Pencil, Plus, Route, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { shortDate, toISO } from '../lib/days'
import { arrivalDate } from '../lib/journeys'
import { stopDays } from '../lib/itinerary'
import { nightsOf, staysForStop } from '../lib/stays'
import { tripCurrency } from '../lib/convert'
import { spentOf } from '../lib/bookings'
import { fmtMoney, fmtPaid } from '../lib/money'
import { go } from '../lib/route'
import { addStop, deleteStop, deleteTrip, moveStop, updateStop, useAppData } from '../lib/store'
import type { Stop, Transfer, Trip } from '../types'
import { BackupCard } from './BackupCard'
import { Checklist } from './Checklist'
import { StaySheet } from './StaySheet'
import { StaysPanel } from './StaysPanel'
import { NotesPanel } from './NotesPanel'
import { BackupNudge } from './BackupNudge'
import { TodayCard } from './TodayCard'
import { SuggestSheet } from './SuggestSheet'
import { KIND_INFO, TransferSheet } from './TransferSheet'
import { PlaceThumb } from './TagIcon'
import { NameDatesForm, fmt } from './TripForm'
import { ask } from '../lib/confirm'

const BANDS = [
  'linear-gradient(135deg, #cfe0cf, #a9c4ad)',
  'linear-gradient(135deg, #f0dcc4, #e2bf98)',
  'linear-gradient(135deg, #cfdcf2, #a7bfe6)',
  'linear-gradient(135deg, #efd6e2, #dcaec4)',
]

function StopCard({ trip, stop, index, onStays }: { trip: Trip; stop: Stop; index: number; onStays: () => void }) {
  const { groups, places, days } = useAppData()
  const [editing, setEditing] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [staying, setStaying] = useState(false)
  const [menu, setMenu] = useState(false)
  const stopStays = staysForStop(trip, stop)
  const stayNames = stopStays.map((s) => places.find((p) => p.id === s.placeId)?.name ?? '').filter(Boolean)
  const nightCount = stopStays.reduce((n, s) => n + nightsOf(s), 0)
  const areaIds = groups.filter((g) => g.stopId === stop.id).map((g) => g.id)
  const placeCount = places.filter((p) => p.groupId && areaIds.includes(p.groupId)).length
  const dates = stopDays(trip, stop).map((d) => d.date)
  const coverPlace = places.find((p) => p.groupId && areaIds.includes(p.groupId) && (p.photos?.[0] ?? p.details?.imageUrl))
  // A photo of the city comes first; failing that, a photo of one of its places.
  const cover = stop.coverUrl ?? coverPlace?.photos?.[0] ?? coverPlace?.details?.imageUrl
  const [coverFailed, setCoverFailed] = useState(false)
  const planned = days.filter((d) => d.tripId === trip.id && dates.includes(d.date) && d.items.length > 0).length
  const last = index === trip.stops.length - 1

  if (editing) {
    return (
      <NameDatesForm
        title="Edit stop"
        initial={{ name: stop.name, start: stop.arrival, end: stop.departure }}
        nameLabel="City or area"
        startLabel="Arrive"
        endLabel="Leave"
        onSave={(v) => {
          updateStop(trip.id, stop.id, { name: v.name, arrival: v.start, departure: v.end })
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="card stop-card">
      <a className="tcard-link" href={`#/trip/${trip.id}/days/${dates[0] ?? ''}`} aria-label={`Open the days in ${stop.name}`} />
      <div className="band" style={{ background: BANDS[index % BANDS.length] }}>
        {cover && !coverFailed ? (
          <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setCoverFailed(true)} />
        ) : (
          <span className="band-initial" aria-hidden>{stop.name.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="tcard-title">
        <h2>{stop.name}</h2>
        <div className="tcard-menu">
          <button className="menu-btn" aria-label={`Options for ${stop.name}`} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <MoreHorizontal size={18} />
          </button>
          {menu && <div className="menu-scrim" onClick={() => setMenu(false)} />}
          {menu && (
            <div className="menu-pop" role="menu">
              <button role="menuitem" onClick={() => { setMenu(false); setEditing(true) }}><Pencil size={16} /> Edit</button>
              <button role="menuitem" disabled={index === 0} onClick={() => { setMenu(false); moveStop(trip.id, stop.id, -1) }}><ArrowUp size={16} /> Move earlier</button>
              <button role="menuitem" disabled={last} onClick={() => { setMenu(false); moveStop(trip.id, stop.id, 1) }}><ArrowDown size={16} /> Move later</button>
              <button role="menuitem" className="danger" onClick={() => { setMenu(false); ask(`Remove the stop “${stop.name}”?`, () => deleteStop(trip.id, stop.id), 'Remove') }}><Trash2 size={16} /> Remove</button>
            </div>
          )}
        </div>
      </div>
      <p className="muted">{fmt(stop.arrival)} → {fmt(stop.departure)}</p>
      <p className="muted">{placeCount} place{placeCount === 1 ? '' : 's'} saved</p>
      <div className="bar" aria-hidden>
        <div style={{ width: dates.length ? (planned / dates.length) * 100 + '%' : '0%' }} />
      </div>
      <p className="muted">{planned} of {dates.length} days planned</p>
      <button className="stay-row" onClick={() => (stopStays.length > 0 ? onStays() : setStaying(true))}>
        <BedDouble size={16} aria-hidden />
        <span>{stayNames.length > 0 ? `${stayNames.join(', ')}${nightCount ? ` · ${nightCount} night${nightCount === 1 ? '' : 's'}` : ''}` : 'Add where you’re staying'}</span>
        <Pencil size={14} aria-hidden />
      </button>
      <div className="row buttons stop-actions">
        <button className="primary wide" onClick={() => setSuggesting(true)}>
          <Sparkles size={16} /> Suggest my days
        </button>
      </div>
      {/* Sheets sit on the page itself: inside the card, its hover lift would pin them to the card. */}
      {suggesting && createPortal(<SuggestSheet trip={trip} stop={stop} onClose={() => setSuggesting(false)} />, document.body)}
      {staying && createPortal(<StaySheet trip={trip} defaults={{ checkIn: stop.arrival, checkOut: stop.departure }} onClose={() => setStaying(false)} />, document.body)}
    </div>
  )
}

// Optional: the address of your own flight-lookup service, for live times when you add a flight.

// A tidy row that opens to show more, so the page stays short.
function Fold({ id, title, badge, open, onToggle, children }: { id: string; title: string; badge?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className={'fold' + (open ? ' open' : '')} id={id}>
      <button className="fold-head" aria-expanded={open} onClick={onToggle}>
        <span className="fold-title">{title}</span>
        {badge && <span className="tag-pill">{badge}</span>}
        <ChevronDown size={20} className="chev" aria-hidden />
      </button>
      {open && <div className="fold-body">{children}</div>}
    </section>
  )
}



export function TripOverview({ trip }: { trip: Trip }) {
  const { days, places, expenses, transfers } = useAppData()
  const [addingStop, setAddingStop] = useState(false)
  const [openFolds, setOpenFolds] = useState<Set<string>>(new Set())
  const toggleFold = (id: string) =>
    setOpenFolds((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const [journey, setJourney] = useState<{ transfer?: Transfer } | null>(null)
  const tripTransfers = useAppData()
    .transfers.filter((t) => t.tripId === trip.id)
    .sort((a, b) => (a.date + (a.departTime ?? '')).localeCompare(b.date + (b.departTime ?? '')))

  const tripDays = useMemo(
    () => days.filter((d) => d.tripId === trip.id).sort((a, b) => a.date.localeCompare(b.date)),
    [days, trip.id],
  )
  const withItems = tripDays.filter((d) => d.items.length > 0)
  const toBook = tripDays.flatMap((day) => day.items.filter((i) => i.reservation === 'todo').map((item) => ({ day, item })))
  const today = toISO(new Date())
  const next = withItems.find((d) => d.date >= today) ?? withItems[0]
  const mine = places.filter((p) => p.tripId === trip.id)
  const placeById = new Map(mine.map((p) => [p.id, p]))
  const dayNumber = next ? tripDays.indexOf(next) + 1 : 0

  const spent = spentOf(trip, expenses, transfers, places)
  const done = trip.checklist.filter((c) => c.done).length

  return (
    <div className="page">
      <BackupNudge />
      <TodayCard trip={trip} />
      <div className="overview-grid single">
        <section className="card panel">
          <header className="panel-head">
            <div>
              <p className="eyebrow">The shape of the journey</p>
              <h2 className="display">Stops along the way</h2>
            </div>
            <button className="primary" onClick={() => setAddingStop(true)}>
              <Plus size={18} /> Add stop
            </button>
          </header>

          {addingStop && (
            <NameDatesForm
              title="Add a stop"
              initial={{ name: '', start: trip.startDate, end: trip.endDate }}
              nameLabel="City or area"
              startLabel="Arrive"
              endLabel="Leave"
              onSave={(v) => {
                addStop(trip.id, { name: v.name, arrival: v.start, departure: v.end })
                setAddingStop(false)
              }}
              onCancel={() => setAddingStop(false)}
            />
          )}

          {trip.stops.length === 0 && !addingStop ? (
            <div className="empty">
              <span className="empty-icon"><Route size={30} /></span>
              <h3 className="display">A journey takes shape one stop at a time.</h3>
              <p className="muted">Add the cities you have in mind. You can adjust their order and dates whenever plans shift.</p>
              <button className="soft-btn" onClick={() => addStop(trip.id, { name: trip.name, arrival: trip.startDate, departure: trip.endDate })}>
                <Plus size={18} /> Use “{trip.name}” as the only stop
              </button>
              <button className="soft-btn" onClick={() => setAddingStop(true)}><Plus size={18} /> Add a different stop</button>
            </div>
          ) : (
            <div className="stop-list">
              {trip.stops.map((s, i) => (
                <StopCard key={s.id} trip={trip} stop={s} index={i} onStays={() => { setOpenFolds((cur) => new Set(cur).add('stays')); setTimeout(() => document.getElementById('stays')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} />
              ))}
            </div>
          )}
        </section>

      </div>

      <div className="grid two">
        <div className="card panel">
          <p className="eyebrow">Coming up</p>
          <h2 className="display">{next ? `Day ${dayNumber}, ${shortDate(next.date)}` : 'Next up'}</h2>
          {next ? (
            <>
              {next.items.slice(0, 5).map((i) => {
                const p = placeById.get(i.placeId)
                return (
                  <div key={i.id} className="line">
                    {p && <PlaceThumb place={p} size={36} />}
                    <span>{p?.name ?? '(place removed)'}</span>
                    {i.time && <span className="muted">{i.time}</span>}
                  </div>
                )
              })}
              {next.items.length > 5 && <p className="muted">…and {next.items.length - 5} more</p>}
              <a className="soft-btn" href={`#/trip/${trip.id}/days/${next.date}`}>Open this day <ArrowRight size={16} /></a>
            </>
          ) : (
            <p className="note">
              Nothing planned yet. Import places, link an area to a stop, then press “Suggest my days” on the stop.
            </p>
          )}
        </div>
        <div className="stack">
          <a className="card summary" href={`#/trip/${trip.id}/budget`}>
            <span className="eyebrow">Budget</span>
            <strong className="display">
              {fmtMoney(spent, trip.currency)}
              {trip.budget !== undefined && <small className="muted"> of {fmtMoney(trip.budget, trip.currency)}</small>}
            </strong>
          </a>
          <a className="card summary" href="#checklists" onClick={(e) => {
            e.preventDefault()
            setOpenFolds((cur) => new Set(cur).add('checklists'))
            setTimeout(() => document.getElementById('checklists')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
          }}>
            <span className="eyebrow">Checklists</span>
            <strong className="display">{done}<small className="muted"> of {trip.checklist.length} done</small></strong>
          </a>
          <a className="card summary" href={`#/trip/${trip.id}/places`}>
            <span className="eyebrow">Places</span>
            <strong className="display">{mine.length}<small className="muted"> saved</small></strong>
          </a>
        </div>
      </div>

      {toBook.length > 0 && (
        <Fold id="tobook" title="Still to book" badge={String(toBook.length)} open={openFolds.has('tobook')} onToggle={() => toggleFold('tobook')}>
          {toBook.map(({ day, item }) => (
            <a key={item.id} className="line link-line" href={`#/trip/${trip.id}/days/${day.date}`}>
              <span style={{ textAlign: 'left' }}>
                <strong>{placeById.get(item.placeId)?.name ?? '(place removed)'}</strong>
                <span className="muted" style={{ display: 'block' }}>{shortDate(day.date)}{item.reservationNote ? ` · ${item.reservationNote}` : ''}</span>
              </span>
              <ArrowRight size={16} aria-hidden />
            </a>
          ))}
        </Fold>
      )}

      <Fold id="stays" title="Where you’re staying" badge={String((trip.stays ?? []).length)} open={openFolds.has('stays')} onToggle={() => toggleFold('stays')}>
        <StaysPanel trip={trip} />
      </Fold>

      <Fold id="transport" title="Flights and transport" badge={String(tripTransfers.length)} open={openFolds.has('transport')} onToggle={() => toggleFold('transport')}>
        {tripTransfers.length === 0 && <p className="muted">Add flights, trains and other journeys, especially between cities.</p>}
        {tripTransfers.map((t) => {
          const { Icon } = KIND_INFO[t.kind]
          return (
            <button key={t.id} className="line link-line" onClick={() => setJourney({ transfer: t })}>
              <span className="stay-tile transfer"><Icon size={18} /></span>
              <span style={{ textAlign: 'left' }}>
                <strong>{t.title}</strong>
                <span className="muted" style={{ display: 'block' }}>
                  {shortDate(t.date)}{t.from && t.to ? ` · ${t.from} → ${t.to}` : ''}{t.departTime ? ` · ${t.departTime}` : ''}{arrivalDate(t) !== t.date ? ` → ${shortDate(arrivalDate(t))}${t.arriveTime ? ' ' + t.arriveTime : ''}` : ''}{t.cost !== undefined ? ` · ${fmtPaid(t.cost, tripCurrency(trip), t.paid)}` : ''}
                </span>
              </span>
            </button>
          )
        })}
        <button className="soft-btn" onClick={() => setJourney({})}><Plus size={16} /> Add a journey</button>
      </Fold>
      {journey && <TransferSheet trip={trip} date={trip.startDate} transfer={journey.transfer} onClose={() => setJourney(null)} />}

      <Fold id="notes" title="Handy notes" badge={String((trip.notes ?? []).length)} open={openFolds.has('notes')} onToggle={() => toggleFold('notes')}>
        <NotesPanel trip={trip} />
      </Fold>

      <Fold id="checklists" title="Checklists" badge={`${done} of ${trip.checklist.length} done`} open={openFolds.has('checklists')} onToggle={() => toggleFold('checklists')}>
        <Checklist trip={trip} />
      </Fold>

      <Fold id="more" title="Share and manage this trip" open={openFolds.has('more')} onToggle={() => toggleFold('more')}>
        <BackupCard trip={trip} />
        <div className="card row buttons">
          <button
            className="danger"
            onClick={() => {
              ask(`Delete “${trip.name}” and all its places? This can’t be undone.`, () => {
                deleteTrip(trip.id)
                go({ page: 'home' })
              }, 'Delete trip')
            }}
          >
            Delete trip
          </button>
        </div>
      </Fold>
    </div>
  )
}
