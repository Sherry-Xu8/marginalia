import { Copy, Maximize2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { addNote, deleteNote, updateNote, useAppData } from '../lib/store'
import type { Note, Trip } from '../types'
import { ask } from '../lib/confirm'

const IDEAS = ['Hotel address (to show a taxi driver)', 'Wi-Fi', 'Emergency numbers', 'Useful phrases', 'Insurance and passport details']

// Short notes you'll want in a hurry. "Show large" fills the screen with the text, handy for
// showing a taxi driver an address.
export function NotesPanel({ trip }: { trip: Trip }) {
  const { places } = useAppData()
  const [editing, setEditing] = useState<{ note?: Note; title: string } | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [big, setBig] = useState<Note | null>(null)
  const [copied, setCopied] = useState('')
  const notes = trip.notes ?? []

  function open(n?: Note, preset = '') {
    setEditing({ note: n, title: n?.title ?? preset })
    setTitle(n?.title ?? preset)
    // For a hotel address, start with the name of the first stay, since that's what you'll show.
    const stay = preset.startsWith('Hotel') ? places.find((p) => p.id === trip.stays?.[0]?.placeId) : undefined
    setText(n?.text ?? (stay ? stay.name + '\n' : ''))
  }
  function save() {
    if (!title.trim()) return
    if (editing?.note) updateNote(trip.id, editing.note.id, { title: title.trim(), text })
    else addNote(trip.id, { title: title.trim(), text })
    setEditing(null)
  }
  async function copy(n: Note) {
    try {
      await navigator.clipboard.writeText(n.text)
      setCopied(n.id)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      // clipboard not available — fine
    }
  }

  return (
    <>
      {notes.length === 0 && !editing && <p className="muted">Keep the things you’ll need in a hurry: an address to show a taxi driver, the Wi-Fi code, emergency numbers.</p>}
      {notes.map((n) => (
        <div key={n.id} className="note-card">
          <div className="row between">
            <strong>{n.title}</strong>
            <span className="stay-actions">
              <button className="icon-btn" aria-label={`Show ${n.title} large`} onClick={() => setBig(n)}><Maximize2 size={17} /></button>
              <button className="icon-btn" aria-label={`Copy ${n.title}`} onClick={() => copy(n)}><Copy size={17} /></button>
              <button className="icon-btn" aria-label={`Edit ${n.title}`} onClick={() => open(n)}><Pencil size={17} /></button>
              <button className="icon-btn" aria-label={`Delete ${n.title}`} onClick={() => ask(`Delete “${n.title}”?`, () => deleteNote(trip.id, n.id))}><Trash2 size={17} /></button>
            </span>
          </div>
          {n.text && <p className="note-text">{n.text}</p>}
          {copied === n.id && <small className="muted" role="status">Copied</small>}
        </div>
      ))}
      {editing ? (
        <div className="card note-edit">
          <label>
            Title
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Note
            <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="row buttons">
            <button className="primary" disabled={!title.trim()} onClick={save}>Save</button>
            <button onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="chips">
            {IDEAS.filter((i) => !notes.some((n) => n.title === i)).map((i) => (
              <button key={i} onClick={() => open(undefined, i)}><Plus size={14} /> {i}</button>
            ))}
          </div>
          <button className="soft-btn" onClick={() => open()}><Plus size={16} /> Add a note</button>
        </>
      )}
      {big && (
        <div className="big-note" role="dialog" aria-label={big.title} onClick={() => setBig(null)}>
          <button className="big-close" aria-label="Close" onClick={() => setBig(null)}><X size={22} /></button>
          <small>{big.title}</small>
          <p>{big.text}</p>
        </div>
      )}
    </>
  )
}
