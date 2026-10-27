import { TAGS, TAG_STYLE } from '../lib/tagging'
import type { Place } from '../types'

export const UNTAGGED = 'Untagged'

export function tagOf(p: Place): string {
  return p.tag ?? UNTAGGED
}

// Tap a chip to show only that category; tap several to combine; "Show all" clears.
export function FilterChips({
  places,
  value,
  onChange,
}: {
  places: Place[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  const counts = new Map<string, number>()
  for (const p of places) counts.set(tagOf(p), (counts.get(tagOf(p)) ?? 0) + 1)
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])

  return (
    <div className="chips" role="group" aria-label="Filter by category">
      {[...TAGS, UNTAGGED].map((t) => {
        const style = TAG_STYLE[t as keyof typeof TAG_STYLE]
        const n = counts.get(t) ?? 0
        if (n === 0 && !value.includes(t)) return null // categories with no places stay out of the way
        return (
          <button
            key={t}
            className={'chip' + (value.includes(t) ? ' on' : '')}
            aria-pressed={value.includes(t)}
            disabled={n === 0 && !value.includes(t)}
            onClick={() => toggle(t)}
          >
            <i style={{ background: style.colour }} />
            {t} <span className="muted">{n}</span>
          </button>
        )
      })}
      {value.length > 0 && (
        <button className="chip clear" onClick={() => onChange([])}>
          Show all
        </button>
      )}
    </div>
  )
}
