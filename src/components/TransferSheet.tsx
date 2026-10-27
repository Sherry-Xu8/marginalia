import { Bus, CarFront, Plane, Route, Ship, TrainFront, X } from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { stopsOn } from '../lib/days'
import { addTransfer, deleteTransfer, updateTransfer } from '../lib/store'
import { TRANSFER_KINDS, type Transfer, type TransferKind, type Trip } from '../types'

export const KIND_INFO: Record<TransferKind, { label: string; Icon: ComponentType<{ size?: number }> }> = {
  flight: { label: 'Flight', Icon: Plane },
  train: { label: 'Train', Icon: TrainFront },
  bus: { label: 'Bus', Icon: Bus },
  ferry: { label: 'Ferry', Icon: Ship },
  car: { label: 'Car or taxi', Icon: CarFront },
  other: { label: 'Other', Icon: Route },
}

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
  const [reference, setReference] = useState(transfer?.reference ?? '')
  const [cost, setCost] = useState(transfer?.cost !== undefined ? String(transfer.cost) : '')
  const [note, setNote] = useState(transfer?.note ?? '')
  const [error, setError] = useState('')

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
        <label>Title (optional)<input value={title} placeholder="e.g. KTX 015 or KE 123" onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="row">
          <label>From<input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Seoul Station" /></label>
          <label>To<input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Busan Station" /></label>
        </div>
        <label>Date<input type="date" value={when} min={trip.startDate} onChange={(e) => setWhen(e.target.value)} /></label>
        <div className="row">
          <label>Departs<input type="time" value={depart} onChange={(e) => setDepart(e.target.value)} /></label>
          <label>Arrives<input type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} /></label>
        </div>
        <div className="row">
          <label>Booking reference<input value={reference} onChange={(e) => setReference(e.target.value)} /></label>
          <label>Cost<input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
        </div>
        <label>Notes<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Platform, seat, terminal…" /></label>
        {error && <p className="error">{error}</p>}
        <div className="row buttons">
          <button className="primary" onClick={save}>Save</button>
          {transfer && (
            <button className="danger" onClick={() => confirm('Delete this journey?') && (deleteTransfer(transfer.id), onClose())}>Delete</button>
          )}
        </div>
      </div>
    </div>
  )
}
