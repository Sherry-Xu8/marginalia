import { useState } from 'react'
import { addCheckItem, removeCheckItem, toggleCheckItem } from '../lib/store'
import type { ChecklistItem, Trip } from '../types'

function Section({ trip, section, title }: { trip: Trip; section: ChecklistItem['section']; title: string }) {
  const [text, setText] = useState('')
  const items = trip.checklist.filter((i) => i.section === section)
  const done = items.filter((i) => i.done).length

  function add() {
    if (!text.trim()) return
    addCheckItem(trip.id, section, text.trim())
    setText('')
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title} <span className="muted">{done}/{items.length}</span></h3>
      {items.map((i) => (
        <div key={i.id} className={'check' + (i.done ? ' done' : '')}>
          <label>
            <input type="checkbox" checked={i.done} onChange={() => toggleCheckItem(trip.id, i.id)} />
            <span>{i.text}</span>
          </label>
          <button aria-label={`Remove ${i.text}`} onClick={() => removeCheckItem(trip.id, i.id)}>×</button>
        </div>
      ))}
      <div className="row">
        <input
          placeholder="Add an item…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button onClick={add}>Add</button>
      </div>
    </div>
  )
}

export function Checklist({ trip }: { trip: Trip }) {
  return (
    <>
      <h3>Checklists</h3>
      <Section trip={trip} section="pre" title="Before you go" />
      <Section trip={trip} section="packing" title="Packing" />
    </>
  )
}
