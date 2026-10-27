import { X } from 'lucide-react'
import { useState } from 'react'
import { removePlaces, useAppData } from '../lib/store'
import type { Place } from '../types'
import { tagOf } from './FilterChips'
import { PlaceThumb } from './TagIcon'

// After a re-import: places that are no longer in your Google Map. You choose what to remove.
export function ReviewGoneSheet({ gone, onClose }: { gone: Place[]; onClose: () => void }) {
  const { days, trips } = useAppData()
  const stays = new Set(trips.flatMap((t) => (t.stays ?? []).map((s) => s.placeId)))
  const plannedOn = (id: string) => days.filter((d) => d.items.some((i) => i.placeId === id)).length

  // Places you've planned a day around or sleep in start unticked, so nothing disappears by accident.
  const note = (p: Place): string | null =>
    stays.has(p.id) ? 'Your accommodation' : plannedOn(p.id) > 0 ? `Planned on ${plannedOn(p.id)} day${plannedOn(p.id) === 1 ? '' : 's'}` : null
  const [picked, setPicked] = useState<Set<string>>(() => new Set(gone.filter((p) => !note(p)).map((p) => p.id)))
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (!n.delete(id)) n.add(id)
      return n
    })

  return (
    <div className="sheet" role="dialog" aria-label="Places no longer in your map">
      <div className="sheet-head">
        <strong className="serif">No longer in your Google Map</strong>
        <button onClick={onClose}><X size={16} /> Close</button>
      </div>
      <div className="sheet-body">
        <p className="muted">
          These {gone.length} place{gone.length === 1 ? ' is' : 's are'} in Marginalia but not in the file you just imported. If you
          deleted them in Google, remove them here. Anything you moved or renamed in Google will appear as a new place, so the
          old copy shows up here too. Places you added yourself are never listed.
        </p>
        <div className="row buttons">
          <button onClick={() => setPicked(new Set(gone.map((p) => p.id)))}>Tick all</button>
          <button onClick={() => setPicked(new Set())}>Untick all</button>
        </div>
        {gone.map((p) => (
          <label key={p.id} className="place-card select-row">
            <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
            <PlaceThumb place={p} size={44} />
            <span className="place-text">
              <span className="place-name">{p.name}</span>
              <small className="muted">{tagOf(p)}{note(p) ? ` · ${note(p)}` : ''}</small>
            </span>
          </label>
        ))}
        <div className="row buttons">
          <button
            className="primary"
            disabled={picked.size === 0}
            onClick={() => {
              removePlaces([...picked])
              onClose()
            }}
          >
            Remove {picked.size} selected
          </button>
          <button onClick={onClose}>Keep them all</button>
        </div>
      </div>
    </div>
  )
}
