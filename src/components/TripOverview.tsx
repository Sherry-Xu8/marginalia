import { ArrowDown, ArrowRight, ArrowUp, BedDouble, MapPin, Pencil, Plus, Route, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { shortDate, toISO } from '../lib/days'
import { stopDays } from '../lib/itinerary'
import { fmtMoney } from '../lib/money'
import { go } from '../lib/route'
import { addStop, deleteStop, deleteTrip, moveStop, updateStop, useAppData } from '../lib/store'
import type { Stop, Transfer, Trip } from '../types'
import { BackupCard } from './BackupCard'
import { isAutoLookupOn, setAutoLookup } from '../lib/autolookup'
import { Checklist } from './Checklist'
import { MapImport } from './MapImport'
import { StaySheet } from './StaySheet'
import { SuggestSheet } from './SuggestSheet'
import { KIND_INFO, TransferSheet } from './TransferSheet'
import { PlaceThumb } from './TagIcon'
import { NameDatesForm, fmt } from './TripForm'

const BANDS = [
  'linear-gradient(135deg, #cfe0cf, #a9c4ad)',
  'linear-gradient(135deg, #f0dcc4, #e2bf98)',
  'linear-gradient(135deg, #cfdcf2, #a7bfe6)',
  'linear-gradient(135deg, #efd6e2, #dcaec4)',
]

function StopCard({ trip, stop, index }: { trip: Trip; stop: Stop; index: number }) {
  const { groups, places, days } = useAppData()
  const [editing, setEditing] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [staying, setStaying] = useState(false)
  const stay = places.find((p) => p.id === stop.stayPlaceId)
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
      <div className="band" style={{ background: BANDS[index % BANDS.length] }}>
        {cover && !coverFailed ? (
          <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setCoverFailed(true)} />
        ) : (
          <span className="band-initial" aria-hidden>{stop.name.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <h2>{stop.name}</h2>
      <p className="muted">{fmt(stop.arrival)} → {fmt(stop.departure)}</p>
      <p className="muted">{placeCount} place{placeCount === 1 ? '' : 's'} saved</p>
      <div className="bar" aria-hidden>
        <div style={{ width: dates.length ? (planned / dates.length) * 100 + '%' : '0%' }} />
      </div>
      <p className="muted">{planned} of {dates.length} days planned</p>
      <button className="stay-row" onClick={() => setStaying(true)}>
        <BedDouble size={16} aria-hidden />
        <span>{stay ? stay.name : 'Add where you’re staying'}</span>
        <Pencil size={14} aria-hidden />
      </button>
      <div className="row buttons">
        <button className="primary" onClick={() => setSuggesting(true)}>
          <Sparkles size={16} /> Suggest my days
        </button>
        <a className="btn" href={`#/trip/${trip.id}/days/${dates[0] ?? ''}`}>Open days</a>
      </div>
      <details className="manage-more">
        <summary>Manage stop</summary>
        <div className="row buttons">
          <button aria-label="Move earlier" disabled={index === 0} onClick={() => moveStop(trip.id, stop.id, -1)}><ArrowUp size={16} /></button>
          <button aria-label="Move later" disabled={last} onClick={() => moveStop(trip.id, stop.id, 1)}><ArrowDown size={16} /></button>
          <button onClick={() => setEditing(true)}>Edit</button>
          <button className="danger" onClick={() => confirm(`Remove the stop “${stop.name}”?`) && deleteStop(trip.id, stop.id)}>Remove</button>
        </div>
      </details>
      {suggesting && <SuggestSheet trip={trip} stop={stop} onClose={() => setSuggesting(false)} />}
      {staying && <StaySheet trip={trip} stop={stop} onClose={() => setStaying(false)} />}
    </div>
  )
}

function AutoLookupToggle() {
  const [on, setOn] = useState(isAutoLookupOn)
  return (
    <label className="card inline">
      <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); setAutoLookup(e.target.checked) }} />
      <span>
        Look up photos and details for my places automatically
        <small className="muted" style={{ display: 'block' }}>
          Sends each place’s name and location to OpenStreetMap and Wikipedia. Turn off to keep everything on this device.
        </small>
      </span>
    </label>
  )
}

export function TripOverview({ trip }: { trip: Trip }) {
  const { days, places, expenses } = useAppData()
  const [addingStop, setAddingStop] = useState(false)
  const [journey, setJourney] = useState<{ transfer?: Transfer } | null>(null)
  const tripTransfers = useAppData()
    .transfers.filter((t) => t.tripId === trip.id)
    .sort((a, b) => (a.date + (a.departTime ?? '')).localeCompare(b.date + (b.departTime ?? '')))

  const tripDays = useMemo(
    () => days.filter((d) => d.tripId === trip.id).sort((a, b) => a.date.localeCompare(b.date)),
    [days, trip.id],
  )
  const withItems = tripDays.filter((d) => d.items.length > 0)
  const today = toISO(new Date())
  const next = withItems.find((d) => d.date >= today) ?? withItems[0]
  const mine = places.filter((p) => p.tripId === trip.id)
  const placeById = new Map(mine.map((p) => [p.id, p]))
  const dayNumber = next ? tripDays.indexOf(next) + 1 : 0

  const layers = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of mine) m.set(p.layer, (m.get(p.layer) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1])
  }, [mine])

  const spent = expenses.filter((e) => e.tripId === trip.id).reduce((s, e) => s + e.amount, 0)
  const done = trip.checklist.filter((c) => c.done).length

  return (
    <div className="page">
      <div className="overview-grid">
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
              <button className="soft-btn" onClick={() => setAddingStop(true)}><Plus size={18} /> Add your first stop</button>
            </div>
          ) : (
            <div className="stop-list">
              {trip.stops.map((s, i) => (
                <StopCard key={s.id} trip={trip} stop={s} index={i} />
              ))}
            </div>
          )}
        </section>

        <aside className="stack">
          <section className="card panel">
            <header className="panel-head">
              <h2 className="display">Places by layer</h2>
              <a className="link" href={`#/trip/${trip.id}/map`}>View map <ArrowRight size={16} /></a>
            </header>
            {layers.length === 0 ? (
              <p className="note">Import a map to bring your saved places and layers into this trip.</p>
            ) : (
              <div className="layer-list">
                {layers.map(([name, n]) => (
                  <a key={name} href={`#/trip/${trip.id}/places`} className="layer-row">
                    <span>{name}</span>
                    <strong>{n}</strong>
                  </a>
                ))}
              </div>
            )}
            <hr />
            <header className="panel-head">
              <h2 className="display">Map import</h2>
              <MapPin size={20} aria-hidden />
            </header>
            <MapImport tripId={trip.id} />
          </section>
        </aside>
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
          <a className="card summary" href="#checklists" onClick={(e) => { e.preventDefault(); document.getElementById('checklists')?.scrollIntoView({ behavior: 'smooth' }) }}>
            <span className="eyebrow">Checklists</span>
            <strong className="display">{done}<small className="muted"> of {trip.checklist.length} done</small></strong>
          </a>
          <a className="card summary" href={`#/trip/${trip.id}/places`}>
            <span className="eyebrow">Places</span>
            <strong className="display">{mine.length}<small className="muted"> saved</small></strong>
          </a>
        </div>
      </div>

      <h3 className="section-title">Flights and transport</h3>
      <div className="card">
        {tripTransfers.length === 0 && <p className="muted">Add flights, trains and other journeys, especially between cities.</p>}
        {tripTransfers.map((t) => {
          const { Icon } = KIND_INFO[t.kind]
          return (
            <button key={t.id} className="line link-line" onClick={() => setJourney({ transfer: t })}>
              <span className="stay-tile transfer"><Icon size={18} /></span>
              <span style={{ textAlign: 'left' }}>
                <strong>{t.title}</strong>
                <span className="muted" style={{ display: 'block' }}>
                  {shortDate(t.date)}{t.from && t.to ? ` · ${t.from} → ${t.to}` : ''}{t.departTime ? ` · ${t.departTime}` : ''}
                </span>
              </span>
            </button>
          )
        })}
        <button className="soft-btn" onClick={() => setJourney({})}><Plus size={16} /> Add a journey</button>
      </div>
      {journey && <TransferSheet trip={trip} date={trip.startDate} transfer={journey.transfer} onClose={() => setJourney(null)} />}

      <div id="checklists"><Checklist trip={trip} /></div>
      <BackupCard trip={trip} />

      <h3 className="section-title">Trip settings</h3>
      <AutoLookupToggle />
      <div className="card row buttons">
        <button
          className="danger"
          onClick={() => {
            if (confirm(`Delete “${trip.name}” and all its places? This can’t be undone.`)) {
              deleteTrip(trip.id)
              go({ page: 'home' })
            }
          }}
        >
          Delete trip
        </button>
      </div>
    </div>
  )
}
