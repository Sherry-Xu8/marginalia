import { useMemo, useState } from 'react'
import { shortDate } from '../lib/days'
import {
  PACE_COUNT,
  stopDays,
  suggestItinerary,
  type DayMode,
  type Pace,
  type Suggestion,
} from '../lib/itinerary'
import { applySuggestion, setGroupStop, useAppData } from '../lib/store'
import type { Place, Stop, Trip } from '../types'
import { tagOf } from './FilterChips'
import { TagIcon } from './TagIcon'

const PACES: { id: Pace; label: string }[] = [
  { id: 'relaxed', label: 'Relaxed' },
  { id: 'standard', label: 'Standard' },
  { id: 'packed', label: 'Packed' },
]
const MODE_LABEL: Record<DayMode, string> = { full: 'Full day', half: 'Half day', off: 'Day off' }

// Choose which location groups ("areas") belong to this stop, right here.
function AreaPicker({ trip, stop }: { trip: Trip; stop: Stop }) {
  const { groups, places } = useAppData()
  const mine = groups.filter((g) => g.tripId === trip.id)
  if (mine.length === 0) {
    return <p className="muted">There are no places yet. Import a map file on the Places tab first.</p>
  }
  return (
    <>
      {mine.map((g) => {
        const other = trip.stops.find((s) => s.id === g.stopId && s.id !== stop.id)
        const count = places.filter((p) => p.groupId === g.id).length
        return (
          <label key={g.id} className="check area-row">
            <input
              type="checkbox"
              checked={g.stopId === stop.id}
              onChange={(e) => setGroupStop(g.id, e.target.checked ? stop.id : undefined)}
            />
            <span>
              {g.name} <small className="muted">· {count} place{count === 1 ? '' : 's'}</small>
              {other && <small className="muted"> · currently in {other.name}</small>}
            </span>
          </label>
        )
      })}
    </>
  )
}

export function SuggestSheet({ trip, stop, onClose }: { trip: Trip; stop: Stop; onClose: () => void }) {
  const { days, places, groups } = useAppData()
  const [pace, setPace] = useState<Pace>('standard')
  const dates = useMemo(() => stopDays(trip, stop), [trip, stop])
  const tripDays = days.filter((d) => d.tripId === trip.id)
  const dayFor = (date: string) => tripDays.find((d) => d.date === date)
  const [modes, setModes] = useState<Record<string, DayMode>>(() =>
    Object.fromEntries(dates.map((d) => [d.date, d.mode])),
  )
  const [replace, setReplace] = useState<Record<string, boolean>>({})
  const [variant, setVariant] = useState(0)
  const [plan, setPlan] = useState<Suggestion | null>(null)

  const areaIds = new Set(groups.filter((g) => g.stopId === stop.id).map((g) => g.id))
  const stopPlaces = places.filter((p) => p.tripId === trip.id && p.groupId && areaIds.has(p.groupId))
  const placeById = new Map(places.map((p) => [p.id, p]))

  // Days that already have a plan are left alone unless you tick "replace".
  const locked = (date: string) => {
    const d = dayFor(date)
    return !!d && d.items.length > 0 && !replace[date]
  }
  const usable = dates.filter((d) => dayFor(d.date) && !locked(d.date))

  function generate(v: number) {
    // Places already planned on days we're keeping are not suggested again.
    const taken = new Set(
      tripDays.filter((d) => !usable.some((u) => u.date === d.date)).flatMap((d) => d.items.map((i) => i.placeId)),
    )
    const result = suggestItinerary({
      places: stopPlaces.filter((p) => !taken.has(p.id)),
      slots: usable.map((u) => ({ dayId: dayFor(u.date)!.id, date: u.date, mode: modes[u.date] ?? u.mode })),
      pace,
      variant: v,
      stay: places.find((p) => p.id === stop.stayPlaceId),
    })
    setVariant(v)
    setPlan(result)
  }

  const removeFromDay = (dayId: string, placeId: string) =>
    setPlan((p) =>
      p && {
        days: p.days.map((d) => (d.dayId === dayId ? { ...d, placeIds: d.placeIds.filter((x) => x !== placeId) } : d)),
        unscheduled: [...p.unscheduled, placeId],
      },
    )
  const addToPlanDay = (dayId: string, placeId: string) =>
    setPlan((p) =>
      p && {
        days: p.days.map((d) => (d.dayId === dayId ? { ...d, placeIds: [...d.placeIds, placeId] } : d)),
        unscheduled: p.unscheduled.filter((x) => x !== placeId),
      },
    )

  const row = (p: Place | undefined) =>
    p ? (
      <>
        <TagIcon tag={tagOf(p)} size={26} /> {p.name}
      </>
    ) : (
      '(removed)'
    )

  return (
    <div className="sheet" role="dialog" aria-label={`Suggest days for ${stop.name}`}>
      <div className="sheet-head">
        <strong>Suggest days · {stop.name}</strong>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="sheet-body">
        {stopPlaces.length === 0 ? (
          <div className="card">
            <h3>Which areas are in {stop.name}?</h3>
            <p className="muted">
              Your places are sorted into areas by location. Tick the ones you’ll visit in {stop.name}, and the
              suggestions will use only those.
            </p>
            <AreaPicker trip={trip} stop={stop} />
          </div>
        ) : !plan ? (
          <>
            <details className="card">
              <summary>
                Using {stopPlaces.length} place{stopPlaces.length === 1 ? '' : 's'} from{' '}
                {groups.filter((g) => g.stopId === stop.id).map((g) => g.name).join(', ')} — change
              </summary>
              <AreaPicker trip={trip} stop={stop} />
            </details>
            <h3>How busy should the days be?</h3>
            <div className="tag-grid three">
              {PACES.map((p) => (
                <button key={p.id} className={pace === p.id ? 'chip on' : 'chip'} onClick={() => setPace(p.id)}>
                  {p.label}
                  <small>~{PACE_COUNT[p.id]} a day</small>
                </button>
              ))}
            </div>

            <h3>Your days in {stop.name}</h3>
            <p className="muted">Arrival and departure days start as half days. Change any day below.</p>
            {dates.map((d, i) => {
              const day = dayFor(d.date)
              const planned = day?.items.length ?? 0
              return (
                <div key={d.date} className="card">
                  <div className="row between">
                    <span>
                      <strong>{shortDate(d.date)}</strong>
                      <span className="muted"> · day {i + 1}</span>
                    </span>
                    <select
                      aria-label={`Day type for ${shortDate(d.date)}`}
                      value={modes[d.date]}
                      onChange={(e) => setModes({ ...modes, [d.date]: e.target.value as DayMode })}
                      style={{ width: 'auto' }}
                    >
                      {(Object.keys(MODE_LABEL) as DayMode[]).map((m) => (
                        <option key={m} value={m}>{MODE_LABEL[m]}</option>
                      ))}
                    </select>
                  </div>
                  {planned > 0 && (
                    <label className="inline">
                      <input
                        type="checkbox"
                        checked={!!replace[d.date]}
                        onChange={(e) => setReplace({ ...replace, [d.date]: e.target.checked })}
                      />
                      Already has {planned} planned — replace it
                    </label>
                  )}
                </div>
              )
            })}
            <button className="primary wide" disabled={usable.length === 0} onClick={() => generate(0)}>
              Suggest my days
            </button>
            {usable.length === 0 && <p className="muted">Every day here already has a plan. Tick “replace” on one to continue.</p>}
          </>
        ) : (
          <>
            <p className="muted">
              Here’s a draft. Nothing is saved until you press Accept. Tap × to set a place aside.
            </p>
            {plan.days.map((d) => {
              const anchor = d.anchorId ? placeById.get(d.anchorId) : undefined
              return (
                <div key={d.dayId} className="card">
                  <strong>{shortDate(d.date)}</strong>
                  <span className="muted"> · {MODE_LABEL[d.mode]}</span>
                  {anchor && <p className="muted">Starts and ends at {anchor.name}</p>}
                  {d.mode === 'off' && <p className="muted">Day off</p>}
                  {d.mode !== 'off' && d.placeIds.length === 0 && <p className="muted">Nothing scheduled</p>}
                  {d.placeIds.map((id, n) => (
                    <div key={id} className="check">
                      <span style={{ flex: 1 }}>{n + 1}. {row(placeById.get(id))}</span>
                      <button aria-label="Set aside" onClick={() => removeFromDay(d.dayId, id)}>×</button>
                    </div>
                  ))}
                </div>
              )
            })}
            <div className="card">
              <strong>Unscheduled ({plan.unscheduled.length})</strong>
              <p className="muted">Places that didn’t fit. Add one to a day if you like.</p>
              {plan.unscheduled.slice(0, 60).map((id) => (
                <div key={id} className="check">
                  <span style={{ flex: 1 }}>{row(placeById.get(id))}</span>
                  <select
                    aria-label="Add to day"
                    value=""
                    style={{ width: 'auto' }}
                    onChange={(e) => e.target.value && addToPlanDay(e.target.value, id)}
                  >
                    <option value="">Add to…</option>
                    {plan.days.filter((d) => d.mode !== 'off').map((d) => (
                      <option key={d.dayId} value={d.dayId}>{shortDate(d.date)}</option>
                    ))}
                  </select>
                </div>
              ))}
              {plan.unscheduled.length > 60 && <p className="muted">…and {plan.unscheduled.length - 60} more.</p>}
            </div>
            <div className="row buttons">
              <button
                className="primary"
                onClick={() => {
                  applySuggestion(plan.days.filter((d) => d.mode !== 'off').map((d) => ({ dayId: d.dayId, placeIds: d.placeIds })))
                  onClose()
                }}
              >
                Accept
              </button>
              <button onClick={() => generate(variant + 1)}>Regenerate</button>
              <button onClick={() => setPlan(null)}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
