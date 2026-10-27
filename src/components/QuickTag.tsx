import { useState } from 'react'
import { TAGS, TAG_STYLE } from '../lib/tagging'
import { setPlaceTag } from '../lib/store'
import type { Group, Place } from '../types'
import { TagIcon } from './TagIcon'

// One place at a time, one tap to tag it.
export function QuickTag({
  places,
  groups,
  onDone,
}: {
  places: Place[] // the places in this trip that have no tag
  groups: Group[]
  onDone: () => void
}) {
  const [skipped, setSkipped] = useState<string[]>([])
  const queue = places.filter((p) => !skipped.includes(p.id))
  const current = queue[0]
  const area = groups.find((g) => g.id === current?.groupId)?.name

  if (!current) {
    return (
      <section>
        <h2>All done 🎉</h2>
        <p className="muted">
          {places.length > 0 ? `${places.length} skipped — they stay Untagged.` : 'Every place has a category.'}
        </p>
        <button className="primary wide" onClick={onDone}>Back to places</button>
      </section>
    )
  }

  return (
    <section>
      <div className="row between">
        <h2>Quick tag</h2>
        <button onClick={onDone}>Done</button>
      </div>
      <p className="muted">{queue.length} left to tag</p>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{current.name}</h3>
        {area && <p className="muted">{area} · {current.layer}</p>}
        {current.description && (
          <p className="desc">
            {current.description.length > 300 ? current.description.slice(0, 300) + '…' : current.description}
          </p>
        )}
      </div>
      <div className="tag-grid">
        {TAGS.map((t) => (
          <button key={t} onClick={() => setPlaceTag(current.id, t)} style={{ borderColor: TAG_STYLE[t].colour }}>
            <TagIcon tag={t} size={32} /> {t}
          </button>
        ))}
      </div>
      <button className="wide" onClick={() => setSkipped([...skipped, current.id])}>Skip this one</button>
    </section>
  )
}
