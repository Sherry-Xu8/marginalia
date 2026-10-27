import { ArrowDown, ArrowUp, Plus, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { daysUntil, shortDate, toISO } from '../lib/days'
import { stopDays } from '../lib/itinerary'
import { fmtMoney } from '../lib/money'
import { go } from '../lib/route'
import { addStop, deleteStop, deleteTrip, moveStop, updateStop, updateTrip, useAppData } from '../lib/store'
import type { Stop, Trip } from '../types'
import { BackupCard } from './BackupCard'
import { Checklist } from './Checklist'
import { SuggestSheet } from './SuggestSheet'
import { TagIcon, tagName } from './TagIcon'
import { NameDatesForm, fmt } from './TripForm'

const BANDS = ['#DCE5D8', '#EAD9C4', '#DCE6F5', '#EBDCE3']

function StopCard({ trip, stop, index }: { trip: Trip; stop: Stop; index: number }) {
  const { groups, places, days } = useAppData()
  const [editing, setEditing] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const areaIds = groups.filter((g) => g.stopId === stop.id).map((g) => g.id)
  const placeCount = places.filter((p) => p.groupId && areaIds.includes(p.groupId)).length
  const dates = stopDays(trip, stop).map((d) => d.date)
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
      <div className="band" style={{ background: BANDS[index % BANDS.length] }} />
      <h2>{stop.name}</h2>
      <p className="muted">{fmt(stop.arrival)} → {fmt(stop.departure)}</p>
      <p className="muted">{placeCount} place{placeCount === 1 ? '' : 's'} saved</p>
      <div className="bar" aria-hidden>
        <div style={{ width: dates.length ? (planned / dates.length) * 100 + '%' : '0%' }} />
      </div>
      <p className="muted">{planned} of {dates.length} days planned</p>
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
    </div>
  )
}

export function TripOverview({ trip }: { trip: Trip }) {
  const { days, places, expenses } = useAppData()
  const [addingStop, setAddingStop] = useState(false)
  const [editingTrip, setEditingTrip] = useState(false)

  const toStart = daysUntil(trip.startDate)
  const toEnd = daysUntil(trip.endDate)
  const big = toStart > 0 ? String(toStart) : toEnd >= 0 ? `Day ${-toStart + 1}` : '—'
  const small = toStart > 0 ? (toStart === 1 ? 'day to go' : 'days to go') : toEnd >= 0 ? 'enjoy the trip' : 'trip finished'

  const tripDays = useMemo(
    () => days.filter((d) => d.tripId === trip.id).sort((a, b) => a.date.localeCompare(b.date)),
    [days, trip.id],
  )
  const withItems = tripDays.filter((d) => d.items.length > 0)
  const today = toISO(new Date())
  const next = withItems.find((d) => d.date >= today) ?? withItems[0]
  const placeById = new Map(places.filter((p) => p.tripId === trip.id).map((p) => [p.id, p]))
  const dayNumber = next ? tripDays.indexOf(next) + 1 : 0

  const spent = expenses.filter((e) => e.tripId === trip.id).reduce((s, e) => s + e.amount, 0)
  const done = trip.checklist.filter((c) => c.done).length
  const placeCount = places.filter((p) => p.tripId === trip.id).length

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="kicker">{fmt(trip.startDate)} – {fmt(trip.endDate)}</p>
          <h1>{trip.name}</h1>
        </div>
        <div className="countdown-big">
          <strong>{big}</strong>
          <span>{small}</span>
        </div>
      </header>

      <div className="grid stops">
        {trip.stops.map((s, i) => (
          <StopCard key={s.id} trip={trip} stop={s} index={i} />
        ))}
        {addingStop ? (
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
        ) : (
          <button className="card add-card" onClick={() => setAddingStop(true)}>
            <Plus size={24} />
            Add a stop
          </button>
        )}
      </div>

      <div className="grid two">
        <div className="card">
          <h3 className="serif">{next ? `Next up · Day ${dayNumber}, ${shortDate(next.date)}` : 'Next up'}</h3>
          {next ? (
            <>
              {next.items.slice(0, 5).map((i) => {
                const p = placeById.get(i.placeId)
                return (
                  <div key={i.id} className="line">
                    {p && <TagIcon tag={tagName(p)} size={28} />}
                    <span>{p?.name ?? '(place removed)'}</span>
                    {i.time && <span className="muted">{i.time}</span>}
                  </div>
                )
              })}
              {next.items.length > 5 && <p className="muted">…and {next.items.length - 5} more</p>}
              <a className="btn" href={`#/trip/${trip.id}/days/${next.date}`}>Open this day</a>
            </>
          ) : (
            <p className="muted">
              Nothing planned yet. Import places, link an area to a stop, then press “Suggest my days” on the stop.
            </p>
          )}
        </div>
        <div className="stack">
          <a className="card summary" href={`#/trip/${trip.id}/budget`}>
            <span className="muted">Budget</span>
            <strong className="serif">
              {fmtMoney(spent, trip.currency)}
              {trip.budget !== undefined && <small className="muted"> of {fmtMoney(trip.budget, trip.currency)}</small>}
            </strong>
          </a>
          <a className="card summary" href="#checklists" onClick={(e) => { e.preventDefault(); document.getElementById('checklists')?.scrollIntoView({ behavior: 'smooth' }) }}>
            <span className="muted">Checklists</span>
            <strong className="serif">{done}<small className="muted"> of {trip.checklist.length} done</small></strong>
          </a>
          <a className="card summary" href={`#/trip/${trip.id}/places`}>
            <span className="muted">Places</span>
            <strong className="serif">{placeCount}<small className="muted"> saved</small></strong>
          </a>
        </div>
      </div>

      <div id="checklists"><Checklist trip={trip} /></div>
      <BackupCard trip={trip} />

      <h3>Trip settings</h3>
      {editingTrip ? (
        <NameDatesForm
          title="Edit trip"
          initial={{ name: trip.name, start: trip.startDate, end: trip.endDate }}
          nameLabel="Trip name"
          startLabel="Start date"
          endLabel="End date"
          onSave={(v) => {
            updateTrip(trip.id, { name: v.name, startDate: v.start, endDate: v.end })
            setEditingTrip(false)
          }}
          onCancel={() => setEditingTrip(false)}
        />
      ) : (
        <div className="card row buttons">
          <button onClick={() => setEditingTrip(true)}>Edit name and dates</button>
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
      )}
    </div>
  )
}
