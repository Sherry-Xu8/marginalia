import { Bus, CarFront, Plane, Route, Ship, TrainFront, X } from 'lucide-react'
import { useEffect, useState, type ComponentType } from 'react'
import { stopsOn } from '../lib/days'
import { expandAirport, flightLinks, flightTitle, getFlightService, lookupFlight, parseFlightNumber } from '../lib/flights'
import { addTransfer, deleteTransfer, updateTransfer } from '../lib/store'
import { TRANSFER_KINDS, type Transfer, type TransferKind, type Trip } from '../types'
import { ask } from '../lib/confirm'
import { shortDate, fromISO, toISO } from '../lib/days'
import { toMinutes } from '../lib/journeys'

export const KIND_INFO: Record<TransferKind, { label: string; Icon: ComponentType<{ size?: number }> }> = {
  flight: { label: 'Flight', Icon: Plane },
  train: { label: 'Train', Icon: TrainFront },
  bus: { label: 'Bus', Icon: Bus },
  ferry: { label: 'Ferry', Icon: Ship },
  car: { label: 'Car or taxi', Icon: CarFront },
  other: { label: 'Other', Icon: Route },
}

const nextDay = (iso: string) => {
  const d = fromISO(iso)
  d.setDate(d.getDate() + 1)
  return toISO(d)
}

// "Korean Air KE 123" → "KE 123", so editing a saved flight can look it up again.
const flightNoFrom = (title: string) => title.match(/\b([A-Z0-9]{2})\s?(\d{1,4}[A-Z]?)\s*$/)?.[0] ?? ''

// Add or edit a flight, train or other journey.
export function TransferSheet({
  trip,
  date,
  transfer,
  onClose,
}: {
  trip: Trip
  date: string
  transfer?: Transfer
  onClose: () => void
}) {
  const between = stopsOn(trip, date)
  const [kind, setKind] = useState<TransferKind>(transfer?.kind ?? 'train')
  const [title, setTitle] = useState(transfer?.title ?? '')
  const [from, setFrom] = useState(transfer?.from ?? (between.length > 1 ? between[0].name : ''))
  const [to, setTo] = useState(transfer?.to ?? (between.length > 1 ? between[between.length - 1].name : ''))
  const [when, setWhen] = useState(transfer?.date ?? date)
  const [depart, setDepart] = useState(transfer?.departTime ?? '')
  const [arrive, setArrive] = useState(transfer?.arriveTime ?? '')
  const [arriveOn, setArriveOn] = useState(transfer?.arriveDate ?? '')
  const [reference, setReference] = useState(transfer?.reference ?? '')
  const [cost, setCost] = useState(transfer?.cost !== undefined ? String(transfer.cost) : '')
  const [note, setNote] = useState(transfer?.note ?? '')
  const [error, setError] = useState('')
  const [flightNo, setFlightNo] = useState(transfer?.kind === 'flight' ? flightNoFrom(transfer.title) : '')
  const [flightMsg, setFlightMsg] = useState('')
  const [flightBusy, setFlightBusy] = useState(false)
  const parsedFlight = parseFlightNumber(flightNo)
  const [autoKey, setAutoKey] = useState(transfer ? `${flightNoFrom(transfer.title)}|${transfer.date}` : '')

  // The day it ends: the date picked, or the next day when it arrives earlier than it leaves (a night journey).
  const endDate = (() => {
    if (arriveOn && arriveOn > when) return arriveOn
    const d = toMinutes(depart)
    const a = toMinutes(arrive)
    return d !== undefined && a !== undefined && a < d ? nextDay(when) : when
  })()

  // Once a flight number and date are in, look the flight up without needing a button press.
  useEffect(() => {
    if (kind !== 'flight' || !parsedFlight || !getFlightService() || !when) return
    const key = `${parsedFlight.pretty}|${when}`
    if (key === autoKey) return
    const timer = setTimeout(() => {
      setAutoKey(key)
      void fillFromFlight()
    }, 700)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, flightNo, when])

  // Fill in what can be worked out from a flight number: the airline, the airport names, and
  // (if a flight-data service is connected) the route and times for that date.
  async function fillFromFlight() {
    const f = parseFlightNumber(flightNo)
    if (!f) return setFlightMsg('Enter a flight number such as KE 123 or SQ 612.')
    setTitle(flightTitle(f))
    setFlightBusy(true)
    const info = await lookupFlight(f, when)
    setFlightBusy(false)
    if (info) {
      if (info.from) setFrom(expandAirport(info.from))
      if (info.to) setTo(expandAirport(info.to))
      if (info.departTime) setDepart(info.departTime)
      if (info.arriveTime) setArrive(info.arriveTime)
      setArriveOn(info.arriveDate && info.arriveDate > when ? info.arriveDate : '')
      if (info.note) setNote(info.note)
      setFlightMsg('Filled in from the flight-data service. Check the times against your booking.')
    } else if (getFlightService()) {
      setFlightMsg('The flight service couldn’t find that flight on that date. Check the number and the date, or use the links below.')
    } else {
      setFlightMsg(
        f.airline
          ? `${f.airline}. Times and airports change by date, so check them with the links below. You can type airport codes like ICN or PUS and they’ll be filled out for you.`
          : 'I don’t know that airline code, but I’ve used the number as the title. Check the details with the links below.',
      )
    }
  }

  function save() {
    if (!title.trim() && !(from.trim() && to.trim())) return setError('Add a title, or where it goes from and to.')
    const n = parseFloat(cost)
    const data = {
      date: when,
      kind,
      title: title.trim() || `${KIND_INFO[kind].label} to ${to.trim()}`,
      from: from.trim(),
      to: to.trim(),
      departTime: depart || undefined,
      arriveTime: arrive || undefined,
      arriveDate: endDate > when ? endDate : undefined,
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
      cost: Number.isFinite(n) && n >= 0 && cost.trim() !== '' ? n : undefined,
    }
    if (transfer) updateTransfer(transfer.id, data)
    else addTransfer({ tripId: trip.id, ...data })
    onClose()
  }

  return (
    <div className="sheet" role="dialog" aria-label="Flight, train or transport">
      <div className="sheet-head">
        <strong className="serif">{transfer ? 'Edit journey' : 'Add a journey'}</strong>
        <button onClick={onClose}><X size={16} /> Close</button>
      </div>
      <div className="sheet-body">
        <div className="kind-grid" role="group" aria-label="Type">
          {TRANSFER_KINDS.map((k) => {
            const { Icon, label } = KIND_INFO[k]
            return (
              <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                <Icon size={20} /> {label}
              </button>
            )
          })}
        </div>
        {kind === 'flight' && (
          <div className="card">
            <label>
              Flight number
              <input
                value={flightNo}
                placeholder="e.g. KE 123"
                onChange={(e) => { setFlightNo(e.target.value); setFlightMsg('') }}
                onKeyDown={(e) => e.key === 'Enter' && fillFromFlight()}
              />
            </label>
            <button className="primary wide" disabled={flightBusy || !parsedFlight} onClick={fillFromFlight}>
              {flightBusy ? 'Looking up…' : 'Fill in the details'}
            </button>
            {parsedFlight && (
              <p className="muted">
                {parsedFlight.airline ?? 'Unknown airline'} · {parsedFlight.pretty}
              </p>
            )}
            {flightMsg && <p className="muted" role="status">{flightMsg}</p>}
            {parsedFlight && (
              <div className="row buttons">
                {flightLinks(parsedFlight, when).map((l) => (
                  <a key={l.label} className="btn" href={l.href} target="_blank" rel="noopener noreferrer">
                    Check on {l.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
        <label>Title (optional)<input value={title} placeholder="e.g. KTX 015 or KE 123" onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="row">
          <label>From<input value={from} onChange={(e) => setFrom(e.target.value)} onBlur={() => kind === 'flight' && setFrom(expandAirport(from))} placeholder={kind === 'flight' ? 'e.g. ICN' : 'Seoul Station'} /></label>
          <label>To<input value={to} onChange={(e) => setTo(e.target.value)} onBlur={() => kind === 'flight' && setTo(expandAirport(to))} placeholder={kind === 'flight' ? 'e.g. PUS' : 'Busan Station'} /></label>
        </div>
        <div className="row">
          <label>Leaves on<input type="date" value={when} min={trip.startDate} onChange={(e) => setWhen(e.target.value)} /></label>
          <label>Departs<input type="time" value={depart} onChange={(e) => setDepart(e.target.value)} /></label>
        </div>
        <div className="row">
          <label>Arrives on<input type="date" value={endDate} min={when} onChange={(e) => setArriveOn(e.target.value)} /></label>
          <label>Arrives<input type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} /></label>
        </div>
        {endDate > when && <p className="muted" role="status">Lands on {shortDate(endDate)}, so the day you leave and the day you arrive both plan around it.</p>}
        <p className="muted">Add the times and “Suggest my days” will plan around them: no sightseeing while you’re travelling, and only the meals that fit before or after.</p>
        <div className="row">
          <label>Booking reference<input value={reference} onChange={(e) => setReference(e.target.value)} /></label>
          <label>Cost<input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
        </div>
        <label>Notes<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Platform, seat, terminal…" /></label>
        {error && <p className="error">{error}</p>}
        <div className="row buttons">
          <button className="primary" onClick={save}>Save</button>
          {transfer && (
            <button className="danger" onClick={() => ask('Delete this journey?', () => { deleteTransfer(transfer.id); onClose() })}>Delete</button>
          )}
        </div>
      </div>
    </div>
  )
}
