import { useState } from 'react'

export function fmt(date: string): string {
  if (!date) return '—'
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

type FormProps = {
  title: string
  initial: { name: string; start: string; end: string }
  nameLabel: string
  startLabel: string
  endLabel: string
  onSave: (v: { name: string; start: string; end: string }) => void
  onCancel?: () => void
}

// One form used for both trips and stops (they have the same three fields).
export function NameDatesForm({ title, initial, nameLabel, startLabel, endLabel, onSave, onCancel }: FormProps) {
  const [name, setName] = useState(initial.name)
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const [error, setError] = useState('')

  function save() {
    if (!name.trim()) return setError('Please give it a name.')
    if (!start || !end) return setError('Please choose both dates.')
    if (end < start) return setError('The end date can’t be before the start date.')
    onSave({ name: name.trim(), start, end })
  }

  return (
    <div className="card form">
      <h3>{title}</h3>
      <label>
        {nameLabel}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="row">
        <label>
          {startLabel}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          {endLabel}
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row buttons">
        <button className="primary" onClick={save}>Save</button>
        {onCancel && <button onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}
