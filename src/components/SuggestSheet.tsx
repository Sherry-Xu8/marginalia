import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Star, TriangleAlert } from 'lucide-react'
import { checkDay, clockText, improveOrder } from '../lib/daycheck'
import { distanceKm } from '../lib/geo'
import { useEffect, useMemo, useState } from 'react'
import { shortDate } from '../lib/days'
import { stayForStop } from '../lib/stays'
import { DAY_START, clock, describeTransfer, freeWindow } from '../lib/journeys'
import { hoursOn } from '../lib/hours'
import { fromISO } from '../lib/days'
import {
  DEFAULT_PREFS,
  PACE_COUNT,
  stopDays,
  suggestItinerary,
  quotaFor,
  type DayMode,
  type MealName,
  type Pace,
  type Prefs,
  type Suggestion,
} from '../lib/itinerary'
import { applySuggestion, setGroupStop, tagUntagged, useAppData } from '../lib/store'
import type { Place, Stop, Trip } from '../types'
import { tagOf } from './FilterChips'
import { TagIcon } from './TagIcon'

const PACES: { id: Pace; label: string }[] = [
  { id: 'relaxed', label: 'Relaxed' },
  { id: 'standard', label: 'Standard' },
  { id: 'packed', label: 'Packed' },
]
const MEALS: { id: Prefs['meals']; label: string; hint: string }[] = [
  { id: 3, label: 'All three meals', hint: 'breakfast, lunch, dinner' },
  { id: 2, label: 'Lunch and dinner', hint: 'skip breakfast' },
  { id: 0, label: 'I’ll sort my own', hint: 'no meals planned' },
]
const PREFS_KEY = 'plan-prefs'
export function loadPrefs(): Prefs {
  try {
    const o = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
    return { meals: o.meals === 0 || o.meals === 2 || o.meals === 3 ? o.meals : DEFAULT_PREFS.meals, cafe: typeof o.cafe === 'boolean' ? o.cafe : DEFAULT_PREFS.cafe }
  } catch {
    return DEFAULT_PREFS
  }
}
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

const LABELS = ['Breakfast', 'Lunch', 'Dinner', 'Café'] as const

// One place in a drafted day: drag the handle to reorder, pick which meal it is, or set it aside.
function DraftRow({
  id, index, time, label, problem, canLabel, onLabel, onRemove, children,
}: {
  id: string; index: number; time?: number; label?: string; problem?: string; canLabel: boolean
  onLabel: (label: string) => void; onRemove: () => void; children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }} className="draft-row">
      <button className="handle" aria-label="Drag to reorder" {...attributes} {...listeners}>
        <GripVertical size={18} />
      </button>
      <span className="draft-main">
        <span>{index + 1}. {children}</span>
        <span className="draft-sub">
          {time !== undefined && <small className="muted">about {clockText(time)}</small>}
          {canLabel && (
            <select className="meal-select" aria-label="Which meal is this?" value={label ?? ''} onChange={(e) => onLabel(e.target.value)}>
              <option value="">Not a set meal</option>
              {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
        </span>
        {problem && <span className="rsv warn"><TriangleAlert size={13} aria-hidden /> {problem}</span>}
      </span>
      <button aria-label="Set aside" onClick={onRemove}>×</button>
    </div>
  )
}

export function SuggestSheet({ trip, stop, onClose }: { trip: Trip; stop: Stop; onClose: () => void }) {
  const { days, places, groups, transfers } = useAppData()
  const [pace, setPace] = useState<Pace>('standard')
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs)
  const setPrefs = (p: Prefs) => {
    setPrefsState(p)
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p))
    } catch {
      // not remembered — fine
    }
  }
  const dates = useMemo(() => stopDays(trip, stop, transfers), [trip, stop, transfers])
  const tripDays = days.filter((d) => d.tripId === trip.id)
  const dayFor = (date: string) => tripDays.find((d) => d.date === date)
  const tripTransfers = useMemo(() => transfers.filter((t) => t.tripId === trip.id), [transfers, trip.id])
  // A day with a journey on it: how much of it is left for plans, and what that journey is.
  const si = trip.stops.findIndex((s) => s.id === stop.id)
  const windowOf = (date: string) => {
    const side =
      date === stop.arrival && trip.stops[si - 1]?.departure === date ? ('arriving' as const) : date === stop.departure && trip.stops[si + 1]?.arrival === date ? ('departing' as const) : undefined
    const w = freeWindow(tripTransfers, date, side)
    return w.busy.length > 0 ? w : undefined
  }
  const [modes, setModes] = useState<Record<string, DayMode>>(() =>
    Object.fromEntries(
      dates.map((d) => {
        const w = windowOf(d.date)
        const len = w ? w.end - w.start : undefined
        return [d.date, len === undefined ? d.mode : len >= 480 ? 'full' : len >= 150 ? 'half' : 'off']
      }),
    ),
  )
  const [replace, setReplace] = useState<Record<string, boolean>>({})
  const [variant, setVariant] = useState(0)
  const [plan, setPlan] = useState<Suggestion | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const setDayIds = (dayId: string, placeIds: string[]) =>
    setPlan((p) => p && { ...p, days: p.days.map((d) => (d.dayId === dayId ? { ...d, placeIds } : d)) })
  const setLabel = (dayId: string, placeId: string, label: string) =>
    setPlan((p) => {
      if (!p) return p
      return {
        ...p,
        days: p.days.map((d) => {
          if (d.dayId !== dayId) return d
          const { [placeId]: _old, ...rest } = d.labels ?? {}
          return { ...d, labels: label ? { ...rest, [placeId]: label } : rest }
        }),
      }
    })

  const areaIds = new Set(groups.filter((g) => g.stopId === stop.id).map((g) => g.id))
  const stopPlaces = places.filter((p) => p.tripId === trip.id && p.groupId && areaIds.has(p.groupId))
  const placeById = new Map(places.map((p) => [p.id, p]))

  // Places the app couldn't categorise earlier get another go (it now knows more), so a restaurant isn't planned as a sight.
  useEffect(() => { void tagUntagged() }, [])

  // The meals a day should have (by your meals-a-day choice and any journey) that the draft doesn't cover yet.
  function missingMeals(d: Suggestion['days'][number]): MealName[] {
    if (d.mode === 'off') return []
    const w = windowOf(d.date)
    const q = quotaFor(pace, d.mode, prefs, w ? { start: w.start, end: w.end } : undefined)
    const all: MealName[] = ['Breakfast', 'Lunch', 'Dinner']
    const names: MealName[] = q.mealNames ?? (prefs.meals === 3 ? all : prefs.meals === 2 ? (['Lunch', 'Dinner'] as MealName[]) : ([] as MealName[])).slice(q.meals ? -q.meals : 99)
    const have = new Set<string>(Object.values(d.labels ?? {}))
    return names.filter((n) => !have.has(n))
  }
  // The nearest restaurant still left over for this day (not closed that date).
  function mealFor(d: Suggestion['days'][number]): { place: Place; km: number } | undefined {
    const near = d.placeIds.map((id) => placeById.get(id)).filter((x): x is Place => !!x)
    return (plan?.unscheduled ?? [])
      .map((id) => placeById.get(id))
      .filter((p): p is Place => !!p && p.tag === 'Food' && hoursOn(p.details?.hours, d.date).status !== 'closed')
      .map((place) => ({ place, km: near.length ? Math.min(...near.map((x) => distanceKm(place, x))) : 0 }))
      .sort((a, b) => a.km - b.km)[0]
  }
  function addMeal(d: Suggestion['days'][number], name: MealName, id: string) {
    setPlan((p) => {
      if (!p) return p
      return {
        ...p,
        unscheduled: p.unscheduled.filter((x) => x !== id),
        days: p.days.map((x) => {
          if (x.dayId !== d.dayId) return x
          const at = name === 'Breakfast' ? 0 : name === 'Dinner' ? x.placeIds.length : Math.floor(x.placeIds.length / 2)
          const placeIds = [...x.placeIds.slice(0, at), id, ...x.placeIds.slice(at)]
          return { ...x, placeIds, labels: { ...x.labels, [id]: name } }
        }),
      }
    })
  }

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
      slots: usable.map((u) => {
        const w = windowOf(u.date)
        return { dayId: dayFor(u.date)!.id, date: u.date, mode: modes[u.date] ?? u.mode, free: w ? { start: w.start, end: w.end } : undefined }
      }),
      pace,
      prefs,
      variant: v,
      closedOn: (p, date) =>
        hoursOn(p.details?.hours, date).status === 'closed' ? `Closed on ${fromISO(date).toLocaleDateString(undefined, { weekday: 'long' })}s` : null,
      stay: places.find((p) => p.id === stayForStop(trip, stop)?.placeId),
    })
    setVariant(v)
    setPlan(result)
  }

  const removeFromDay = (dayId: string, placeId: string) =>
    setPlan((p) =>
      p && {
        ...p,
        days: p.days.map((d) => (d.dayId === dayId ? { ...d, placeIds: d.placeIds.filter((x) => x !== placeId) } : d)),
        unscheduled: [...p.unscheduled, placeId],
      },
    )
  const addToPlanDay = (dayId: string, placeId: string) =>
    setPlan((p) =>
      p && {
        ...p,
        days: p.days.map((d) => (d.dayId === dayId ? { ...d, placeIds: [...d.placeIds, placeId] } : d)),
        unscheduled: p.unscheduled.filter((x) => x !== placeId),
      },
    )

  // For a place that didn't fit: the days it would suit best, nearest first. A day's distance is how far the place is
  // from the closest thing already planned that day (or from the hotel on an empty day). Days it's closed on are left out.
  function rankDays(placeId: string) {
    const p = placeById.get(placeId)
    if (!p || !plan) return []
    const hotel = places.find((x) => x.id === stayForStop(trip, stop)?.placeId)
    return plan.days
      .filter((d) => d.mode !== 'off' && hoursOn(p.details?.hours, d.date).status !== 'closed')
      .map((d) => {
        const near = [...d.placeIds.map((id) => placeById.get(id)), ...(d.placeIds.length === 0 && hotel ? [hotel] : [])]
          .filter((x): x is Place => !!x)
          .map((x) => ({ x, km: distanceKm(p, x) }))
          .sort((a, b) => a.km - b.km)[0]
        return { day: d, km: near?.km ?? Infinity, near: near?.x, count: d.placeIds.length }
      })
      .sort((a, b) => a.km - b.km || a.count - b.count)
  }
  const kmText = (km: number) => (km < 1 ? `${Math.max(50, Math.round(km * 10) * 100)} m` : `${km.toFixed(1)} km`)

  const row = (p: Place | undefined) =>
    p ? (
      <>
        <TagIcon tag={tagOf(p)} size={26} /> {p.name}{p.must && <Star size={14} fill="currentColor" aria-label="Must-do" style={{ marginLeft: 6, color: '#c9993a' }} />}
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
            {tripTransfers.length === 0 && !stayForStop(trip, stop) && (
              <p className="note">Tip: add your hotels and journeys first. The days are then planned around when you arrive and leave.</p>
            )}
            <h3>How busy should the days be?</h3>
            <div className="tag-grid three">
              {PACES.map((p) => (
                <button key={p.id} className={pace === p.id ? 'chip on' : 'chip'} onClick={() => setPace(p.id)}>
                  {p.label}
                  <small>~{PACE_COUNT[p.id]} sights a day</small>
                </button>
              ))}
            </div>

            <h3>How do you like to travel?</h3>
            <p className="muted">Meals and café stops are added around your sights, so days don’t turn into back-to-back restaurants.</p>
            <div className="tag-grid three">
              {MEALS.map((o) => (
                <button key={o.id} className={prefs.meals === o.id ? 'chip on' : 'chip'} onClick={() => setPrefs({ ...prefs, meals: o.id })}>
                  {o.label}
                  <small>{o.hint}</small>
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={prefs.cafe} onChange={(e) => setPrefs({ ...prefs, cafe: e.target.checked })} />
              <span>A café stop every day <small className="muted">· coffee, tea or dessert (uses places tagged Cafes)</small></span>
            </label>
            {stopPlaces.length > 0 && !stopPlaces.some((p) => p.tag !== 'Food' && p.tag !== 'Cafes' && p.tag !== 'Accommodation' && p.tag !== 'Transport') && (
              <p className="muted">Heads up: these places are all food and cafés, so days will be mostly meals. Add sights to the map for a fuller mix.</p>
            )}

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
                  {windowOf(d.date) && (
                    <p className="note journey-note">
                      {windowOf(d.date)!.busy.map((b) => describeTransfer(b.transfer)).join(' · ')}
                      {' — '}
                      {(() => {
                        const w = windowOf(d.date)!
                        return w.end - w.start < 90 ? 'no time left for plans' : `free ${clock(w.start)}–${clock(w.end)}`
                      })()}
                    </p>
                  )}
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
              Here’s a draft. Nothing is saved until you press Accept. Drag the handle to reorder, choose which meal a place is, or tap × to set one aside. Times are rough estimates.
            </p>
            {plan.days.map((d) => {
              const anchor = d.anchorId ? placeById.get(d.anchorId) : undefined
              const ordered = d.placeIds.map((id) => placeById.get(id)).filter((x): x is Place => !!x)
              const timing = { places: ordered, labels: d.labels, date: d.date, start: windowOf(d.date)?.start ?? DAY_START, anchor }
              const check = d.mode !== 'off' && ordered.length > 0 ? checkDay(timing) : undefined
              const better = check ? improveOrder(timing) : null
              return (
                <div key={d.dayId} className="card">
                  <strong>{shortDate(d.date)}</strong>
                  <span className="muted"> · {MODE_LABEL[d.mode]}</span>
                  {anchor && <p className="muted">Starts and ends at {anchor.name}</p>}
                  {d.mode === 'off' && <p className="muted">Day off</p>}
                  {d.mode !== 'off' && d.placeIds.length === 0 && <p className="muted">Nothing scheduled</p>}
                  {missingMeals(d).length > 0 && (
                    <div className="meal-gaps">
                      {missingMeals(d).map((name) => {
                        const m = mealFor(d)
                        return m ? (
                          <button key={name} className="soft-btn" onClick={() => addMeal(d, name, m.place.id)}>
                            + Add {name.toLowerCase()} · {m.place.name}{m.km > 0 ? ` (${kmText(m.km)})` : ''}
                          </button>
                        ) : (
                          <span key={name} className="muted">No {name.toLowerCase()} planned, and no restaurants left to add.</span>
                        )
                      })}
                    </div>
                  )}
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e: DragEndEvent) => {
                      if (!e.over || e.active.id === e.over.id) return
                      const from = d.placeIds.indexOf(String(e.active.id))
                      const to = d.placeIds.indexOf(String(e.over.id))
                      if (from >= 0 && to >= 0) setDayIds(d.dayId, arrayMove(d.placeIds, from, to))
                    }}
                  >
                    <SortableContext items={d.placeIds} strategy={verticalListSortingStrategy}>
                      {d.placeIds.map((id, n) => {
                        const pl = placeById.get(id)
                        return (
                          <DraftRow
                            key={id}
                            id={id}
                            index={n}
                            time={check?.arrive[id]}
                            label={d.labels?.[id]}
                            problem={check?.problems.find((x) => x.id === id)?.text}
                            canLabel={pl?.tag === 'Food' || pl?.tag === 'Cafes'}
                            onLabel={(l) => setLabel(d.dayId, id, l)}
                            onRemove={() => removeFromDay(d.dayId, id)}
                          >
                            {row(pl)}
                          </DraftRow>
                        )
                      })}
                    </SortableContext>
                  </DndContext>
                  {better && (
                    <div className="fit-tip">
                      <span>
                        <b>A better order:</b>{' '}
                        {[better.fixed > 0 ? `fits the opening hours of ${better.fixed} place${better.fixed === 1 ? '' : 's'}` : '', better.savedKm >= 0.5 ? `saves about ${better.savedKm.toFixed(1)} km of travel` : ''].filter(Boolean).join(' and ')}.
                      </span>
                      <button className="soft-btn" onClick={() => setDayIds(d.dayId, better.order)}>Use it</button>
                    </div>
                  )}
                  {check && check.problems.length > 0 && !better && (
                    <p className="muted">Reordering won’t fix {check.problems.length === 1 ? 'that' : 'those'}. Consider setting {check.problems.length === 1 ? 'it' : 'them'} aside and adding {check.problems.length === 1 ? 'it' : 'them'} to another day.</p>
                  )}
                </div>
              )
            })}
            <div className="card">
              <strong>Unscheduled ({plan.unscheduled.length})</strong>
              <p className="muted">Places that didn’t fit, with the day each would suit best (nearest to what’s already planned).</p>
              {plan.unscheduled.slice(0, 60).map((id) => {
                const ranked = rankDays(id)
                const best = ranked[0]
                return (
                <div key={id} className="check">
                  <span style={{ flex: 1 }}>
                    {row(placeById.get(id))}
                    {plan.reasons?.[id] && <small className="muted"> · {plan.reasons[id]}</small>}
                    {best && (
                      <button className="fit-btn" onClick={() => addToPlanDay(best.day.dayId, id)}>
                        <b>Best fit: {shortDate(best.day.date)}</b>
                        {best.near ? ` · ${kmText(best.km)} from ${best.near.name}` : ` · quietest day (${best.count})`}
                      </button>
                    )}
                  </span>
                  <select
                    aria-label="Add to day"
                    value=""
                    style={{ width: 'auto' }}
                    onChange={(e) => e.target.value && addToPlanDay(e.target.value, id)}
                  >
                    <option value="">Add to…</option>
                    {ranked.map((r) => (
                      <option key={r.day.dayId} value={r.day.dayId}>{shortDate(r.day.date)}{r.near ? ` · ${kmText(r.km)}` : ''}</option>
                    ))}
                  </select>
                </div>
                )
              })}
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
