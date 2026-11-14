import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Clock, GripVertical, Pin, Star, TriangleAlert, X } from 'lucide-react'
import { checkDay, clockText, improveOrder } from '../lib/daycheck'
import { fmtKm, fmtMinutes, LONG_TRAVEL_MINUTES, WALK_BELOW_KM } from '../lib/commute'
import { WeatherChip } from './WeatherChip'
import { DraftMap, dayColour } from './DraftMap'
import { AddPlaceSheet } from './AddPlaceSheet'
import { createPortal } from 'react-dom'
import { replanAll, replanDay, type ReplanCtx } from '../lib/replan'
import { distanceKm } from '../lib/geo'
import { useEffect, useMemo, useState } from 'react'
import { shortDate } from '../lib/days'
import { stayForStop } from '../lib/stays'
import { DAY_START, arrivalDate, clock, describeTransfer, freeWindow } from '../lib/journeys'
import { KIND_INFO } from './TransferSheet'
import { travelAround } from '../lib/travelAround'
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
import type { Place, Stop, Transfer, Trip } from '../types'
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

// A flight, train or bus on a drafted day, with the part of the day it leaves free.
function DraftJourney({ transfer, free }: { transfer: Transfer; free?: { start: number; end: number } }) {
  const { Icon, label } = KIND_INFO[transfer.kind]
  const where = transfer.from && transfer.to ? `${transfer.from} → ${transfer.to}` : ''
  return (
    <div className="draft-journey">
      <span className="stay-tile transfer"><Icon size={18} /></span>
      <span>
        <strong>{describeTransfer(transfer)}</strong>
        <small className="muted">{[label, where].filter(Boolean).join(' · ')}</small>
        {free && free.end > free.start && <small className="muted">Leaves you {clock(free.start)}–{clock(free.end)} for plans</small>}
      </span>
    </div>
  )
}

// One place in a drafted day: drag the handle to reorder, pick which meal it is, or set it aside.
function DraftRow({
  id, index, time, leg, fixed, label, problem, canLabel, pinned, moveTo, onPin, onFix, onLabel, onMove, onRemove, children,
}: {
  id: string; index: number; time?: number; leg?: { km: number; minutes: number }; fixed?: string; label?: string; problem?: string; canLabel: boolean; pinned: boolean
  moveTo: { dayId: string; label: string }[]
  onPin: () => void; onFix: (time: string) => void; onLabel: (label: string) => void; onMove: (dayId: string) => void; onRemove: () => void; children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }} className="draft-row">
      {leg && (
        <span
          className="leg-hint muted"
          title="A rough estimate: walking for short hops, otherwise a bus or train. The distance is as the crow flies, so the real route is a little longer."
        >
          ↓ {fmtMinutes(leg.minutes)} {leg.km < WALK_BELOW_KM ? 'walk' : 'by bus or train'} · {fmtKm(leg.km)}
        </span>
      )}
      <button className="handle" aria-label="Drag to reorder" {...attributes} {...listeners}>
        <GripVertical size={18} />
      </button>
      <span className="draft-main">
        <span>{index + 1}. {children}</span>
        <span className="draft-sub">
          {fixed ? (
            <span className="fixed-time" title="A time you've fixed — a booking, a tour, a train">
              <Clock size={12} aria-hidden />
              <input
                type="time"
                value={fixed}
                aria-label="Booked time"
                onChange={(e) => onFix(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget as HTMLInputElement).blur()}
              />
              <button aria-label="Clear the fixed time, back to an estimate" title="Back to an estimated time" onClick={() => onFix('')}>×</button>
            </span>
          ) : (
            time !== undefined && (
              <button className="time-btn" title="Tap to fix this time (a booking, a tour, a train)" onClick={() => onFix(clockText(time))}>
                about {clockText(time)}
              </button>
            )
          )}
          {canLabel && (
            <select className="meal-select" aria-label="Which meal is this?" value={label ?? ''} onChange={(e) => onLabel(e.target.value)}>
              <option value="">Not a set meal</option>
              {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          {moveTo.length > 0 && (
            <select
              className="move-select"
              aria-label="Move to another day"
              value=""
              onChange={(e) => e.target.value && onMove(e.target.value)}
            >
              <option value="">Move…</option>
              {moveTo.map((d) => (
                <option key={d.dayId} value={d.dayId}>{d.label}</option>
              ))}
              <option value="__unscheduled">Set aside</option>
            </select>
          )}
          <button className={'pin-btn' + (pinned ? ' on' : '')} aria-pressed={pinned} aria-label={pinned ? 'Unpin' : 'Pin to this day'} title={pinned ? 'Pinned: re-planning keeps it on this day' : 'Pin so re-planning keeps it on this day'} onClick={onPin}>
            <Pin size={14} fill={pinned ? 'currentColor' : 'none'} /> {pinned ? 'Pinned' : 'Pin'}
          </button>
        </span>
        {problem && <span className="rsv warn"><TriangleAlert size={13} aria-hidden /> {problem}</span>}
      </span>
      <button aria-label="Set aside" onClick={onRemove}>×</button>
    </div>
  )
}

// All the places for this stop in one list, showing which day each is on, so you can pull any of them onto
// the day you're working on without hunting through Unscheduled.
function DraftPicker({
  places,
  dayLabel,
  whereIs,
  onPick,
  onClose,
}: {
  places: Place[]
  dayLabel: string
  whereIs: (placeId: string) => string | undefined // the day it's on now, if any
  onPick: (placeId: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'free'>('all')
  const text = q.trim().toLowerCase()
  const shown = places.filter((p) => (!text || p.name.toLowerCase().includes(text)) && (only === 'all' || !whereIs(p.id)))
  return (
    <div className="sheet" role="dialog" aria-label={`Add a place to ${dayLabel}`}>
      <div className="sheet-head">
        <strong>Add to {dayLabel}</strong>
        <button onClick={onClose}><X size={16} /> Close</button>
      </div>
      <div className="sheet-body">
        <label>
          Search your places
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name of a place" />
        </label>
        <div className="row buttons">
          <button className={only === 'all' ? 'chip on' : 'chip'} onClick={() => setOnly('all')}>All {places.length}</button>
          <button className={only === 'free' ? 'chip on' : 'chip'} onClick={() => setOnly('free')}>Not on a day yet</button>
        </div>
        {shown.length === 0 && <p className="muted">Nothing matches.</p>}
        {shown.map((p) => {
          const on = whereIs(p.id)
          return (
            <button key={p.id} className={'pick' + (on ? ' planned' : '')} onClick={() => onPick(p.id)}>
              <TagIcon tag={tagOf(p)} size={26} />
              <span className="pick-head">
                {p.name}
                {on && <small className="muted">on {on} — tap to move it here</small>}
              </span>
            </button>
          )
        })}
      </div>
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
  const extraTravel = useMemo(() => travelAround(trip, tripTransfers, places), [trip, tripTransfers, places]) // getting to and from linked airports and stations
  const si = trip.stops.findIndex((s) => s.id === stop.id)
  const windowOf = (date: string) => {
    const side =
      date === stop.arrival && trip.stops[si - 1]?.departure === date ? ('arriving' as const) : date === stop.departure && trip.stops[si + 1]?.arrival === date ? ('departing' as const) : undefined
    const w = freeWindow(tripTransfers, date, side, extraTravel)
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
  const [pins, setPins] = useState<Set<string>>(new Set())
  const [undoPlan, setUndoPlan] = useState<Suggestion | null>(null)
  const [notice, setNotice] = useState('')
  const [fitAll, setFitAll] = useState(false)
  const [mapDayId, setMapDayId] = useState('')
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [pickFor, setPickFor] = useState<string | null>(null)
  const togglePin = (id: string) =>
    setPins((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const setDayIds = (dayId: string, placeIds: string[]) =>
    setPlan((p) => p && { ...p, days: p.days.map((d) => (d.dayId === dayId ? { ...d, placeIds } : d)) })
  // A time you fix yourself (a booking, a tour, a train). It is kept when you accept the draft.
  const setFixedTime = (dayId: string, placeId: string, time: string) => {
    if (time) setPins((cur) => new Set(cur).add(placeId)) // a booking is a decision, so it stays on this day
    setPlan((p) => {
      if (!p) return p
      return {
        ...p,
        days: p.days.map((x) => {
          if (x.dayId !== dayId) return x
          const { [placeId]: _old, ...rest } = x.times ?? {}
          return { ...x, times: time ? { ...rest, [placeId]: time } : rest }
        }),
      }
    })
  }

  // Where a day begins and ends. Picking one of the day's own places (the airport you land at) takes it out of
  // the list and makes it the day's end point; the one it replaces goes back into the list.
  const endpointOf = (d: Suggestion['days'][number], which: 'start' | 'end') => {
    const set = which === 'start' ? d.startId : d.endId
    return set === undefined ? d.anchorId ?? null : set
  }
  const setEndpoint = (dayId: string, which: 'start' | 'end', value: string | null) =>
    setPlan((p) => {
      if (!p) return p
      return {
        ...p,
        days: p.days.map((d) => {
          if (d.dayId !== dayId) return d
          const was = endpointOf(d, which)
          const other = endpointOf(d, which === 'start' ? 'end' : 'start')
          let placeIds = d.placeIds
          if (was && was !== d.anchorId && was !== other && was !== value && !placeIds.includes(was)) {
            placeIds = which === 'start' ? [was, ...placeIds] : [...placeIds, was]
          }
          if (value) placeIds = placeIds.filter((x) => x !== value)
          return { ...d, placeIds, ...(which === 'start' ? { startId: value } : { endId: value }) }
        }),
      }
    })

  // Move a place straight to another day (or set it aside), keeping its meal label and any time you fixed.
  const moveToDay = (fromDayId: string, placeId: string, toDayId: string) =>
    setPlan((p) => {
      if (!p) return p
      const from = p.days.find((d) => d.dayId === fromDayId)
      const label = from?.labels?.[placeId]
      const time = from?.times?.[placeId]
      const strip = (d: Suggestion['days'][number]) => {
        const { [placeId]: _l, ...labels } = d.labels ?? {}
        const { [placeId]: _t, ...times } = d.times ?? {}
        return { ...d, placeIds: d.placeIds.filter((x) => x !== placeId), labels, times }
      }
      const aside = toDayId === '__unscheduled'
      return {
        ...p,
        days: p.days.map((d) => {
          if (d.dayId === fromDayId) return strip(d)
          if (!aside && d.dayId === toDayId) {
            return {
              ...d,
              placeIds: [...d.placeIds, placeId],
              labels: label ? { ...(d.labels ?? {}), [placeId]: label } : d.labels,
              times: time ? { ...(d.times ?? {}), [placeId]: time } : d.times,
            }
          }
          return d
        }),
        unscheduled: aside ? [...p.unscheduled, placeId] : p.unscheduled.filter((x) => x !== placeId),
      }
    })

  const setLabel = (dayId: string, placeId: string, label: string) => {
    if (label) setPins((cur) => new Set(cur).add(placeId)) // choosing a meal for a place is a decision to keep
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
  }

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
      fitAll,
      closedOn: (p, date) =>
        hoursOn(p.details?.hours, date).status === 'closed' ? `Closed on ${fromISO(date).toLocaleDateString(undefined, { weekday: 'long' })}s` : null,
      stay: places.find((p) => p.id === stayForStop(trip, stop)?.placeId),
    })
    setVariant(v)
    // Keep what the Days tab already knows about each day: where it starts and ends (the airport you land at,
    // a hotel you check into later), so the draft doesn't quietly undo it.
    setPlan({
      ...result,
      days: result.days.map((d) => {
        const saved = tripDays.find((x) => x.id === d.dayId)
        return { ...d, startId: saved?.startPlaceId, endId: saved?.endPlaceId }
      }),
    })
    setPins(new Set())
    setUndoPlan(null)
    setNotice('')
  }

  // Re-plan around the places you've pinned (one day, or every day that has a pin).
  const replanCtx = (): ReplanCtx => ({
    placeById,
    pins,
    pace,
    prefs,
    variant,
    fitAll,
    windowOf: (date) => {
      const w = windowOf(date)
      return w ? { start: w.start, end: w.end } : undefined
    },
    closedOn: (p, date) =>
      hoursOn(p.details?.hours, date).status === 'closed' ? `Closed on ${fromISO(date).toLocaleDateString(undefined, { weekday: 'long' })}s` : null,
    stay: places.find((p) => p.id === stayForStop(trip, stop)?.placeId),
  })
  function replanOneDay(dayId: string) {
    if (!plan) return
    const day = plan.days.find((d) => d.dayId === dayId)
    const r = replanDay(plan, dayId, replanCtx())
    setUndoPlan(plan)
    setPlan(r.plan)
    setNotice(`Re-planned ${day ? shortDate(day.date) : 'the day'} around your pinned places${r.pulled ? `, brought in ${r.pulled} nearby` : ''}${r.setAside ? `, set ${r.setAside} aside (see Unscheduled)` : ''}.`)
  }
  function replanEverything() {
    if (!plan) return
    const r = replanAll(plan, replanCtx())
    setUndoPlan(plan)
    setPlan(r.plan)
    setNotice(
      r.days
        ? `Re-planned every day around your pinned places${r.setAside ? `, with ${r.setAside} set aside` : ''}. Pinned places stayed where you put them.`
        : 'Nothing to re-plan — pin a place on a day first.',
    )
  }

  const removeFromDay = (dayId: string, placeId: string) => {
    setPins((cur) => {
      const next = new Set(cur)
      next.delete(placeId)
      return next
    })
    setPlan((p) =>
      p && {
        ...p,
        days: p.days.map((d) => (d.dayId === dayId ? { ...d, placeIds: d.placeIds.filter((x) => x !== placeId) } : d)),
        unscheduled: [...p.unscheduled, placeId],
      },
    )
  }
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
  // The day shown on the map: the one you last tapped, else the first with something on it.
  const activeDay =
    plan?.days.find((d) => d.dayId === mapDayId && d.mode !== 'off') ??
    plan?.days.find((d) => d.mode !== 'off' && d.placeIds.length > 0) ??
    plan?.days.find((d) => d.mode !== 'off')

  // Every planned day, in order, for the map and its colour key.
  const mapDays = (plan?.days ?? [])
    .filter((d) => d.mode !== 'off')
    .map((d) => ({
      dayId: d.dayId,
      label: shortDate(d.date),
      places: d.placeIds.map((id) => placeById.get(id)).filter((x): x is Place => !!x),
    }))

  // The journeys that land on a date, and the ones that set off from it.
  const dayJourneys = (date: string) => ({
    arriving: tripTransfers.filter((t) => arrivalDate(t) === date && t.date !== date),
    leaving: tripTransfers.filter((t) => t.date === date),
  })

  // The places that didn't fit, nearest to what this day already has (or to the hotel on an empty day), closest first.
  function spareFor(d: Suggestion['days'][number], limit: number) {
    if (!plan) return []
    const hotel = places.find((x) => x.id === stayForStop(trip, stop)?.placeId)
    const anchors = [...d.placeIds.map((id) => placeById.get(id)), ...(d.placeIds.length === 0 && hotel ? [hotel] : [])].filter((x): x is Place => !!x)
    return plan.unscheduled
      .map((id) => placeById.get(id))
      .filter((x): x is Place => !!x && hoursOn(x.details?.hours, d.date).status !== 'closed')
      .map((x) => {
        const nearest = anchors.length ? anchors.map((a) => ({ a, km: distanceKm(x, a) })).sort((p, q) => p.km - q.km)[0] : undefined
        return { place: x, km: nearest?.km ?? 0, from: nearest?.a, fromHotel: d.placeIds.length === 0 }
      })
      .sort((a, b) => a.km - b.km)
      .slice(0, limit)
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
      <div className={'sheet-body' + (plan ? ' wide' : '')}>
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
                  <small>~{PACE_COUNT[p.id]} sights, {PACE_COUNT[p.id] + prefs.meals + (prefs.cafe ? 1 : 0)} stops a day</small>
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
            <label className="check">
              <input type="checkbox" checked={fitAll} onChange={(e) => setFitAll(e.target.checked)} />
              <span>
                Fit every place in
                <small className="muted">
                  {' '}· all {stopPlaces.filter((p) => p.tag !== 'Accommodation' && p.tag !== 'Transport').length} places go on a day, so days will be full. Go through them and tap × on the ones you don’t want.
                </small>
              </span>
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
              {fitAll && ' Every place is on a day, so they’re full — work through them and set aside what you don’t want.'}
            </p>
            {pins.size > 0 && (
              <div className="card replan-card">
                <strong>{pins.size} pinned</strong>
                <p className="muted">Pinned places stay on their day. Re-plan to rebuild the rest of a day around them, so you’re not travelling off track for one meal.</p>
                <button className="primary wide" onClick={replanEverything}>Re-plan the whole trip around my pins</button>
              </div>
            )}
            {notice && (
              <p className="note" role="status">
                {notice}{' '}
                {undoPlan && (
                  <button
                    className="link-btn"
                    onClick={() => {
                      setPlan(undoPlan)
                      setUndoPlan(null)
                      setNotice('Back to how it was.')
                    }}
                  >
                    Undo
                  </button>
                )}
              </p>
            )}
            <div className="draft-grid">
              <div className="draft-days">
            {plan.days.map((d) => {
              const anchor = d.anchorId ? placeById.get(d.anchorId) : undefined
              const ordered = d.placeIds.map((id) => placeById.get(id)).filter((x): x is Place => !!x)
              const startId = endpointOf(d, 'start')
              const endId = endpointOf(d, 'end')
              const startAt = startId ? placeById.get(startId) : undefined
              const endAt = endId ? placeById.get(endId) : undefined
              const endpoints = [...new Map([anchor, startAt, endAt, ...ordered].filter((x): x is Place => !!x).map((x) => [x.id, x])).values()]
              const timing = {
                places: ordered,
                labels: d.labels,
                times: d.times,
                date: d.date,
                start: windowOf(d.date)?.start ?? DAY_START,
                anchor: startAt,
                anchorEnd: endAt,
              }
              const check = d.mode !== 'off' && ordered.length > 0 ? checkDay(timing) : undefined
              const better = check ? improveOrder(timing) : null
              return (
                <div key={d.dayId} className={'card' + (d.dayId === activeDay?.dayId ? ' on-map' : '')} onClick={() => setMapDayId(d.dayId)}>
                  {mapDays.findIndex((m) => m.dayId === d.dayId) >= 0 && (
                    <i className="day-dot" style={{ background: dayColour(mapDays.findIndex((m) => m.dayId === d.dayId)) }} aria-hidden />
                  )}
                  <strong>{shortDate(d.date)}</strong>
                  <span className="muted"> · {MODE_LABEL[d.mode]}</span>
                  {d.mode !== 'off' && <WeatherChip point={ordered[0] ?? anchor} date={d.date} />}
                  {dayJourneys(d.date).arriving.map((t) => (
                    <DraftJourney key={t.id} transfer={t} free={windowOf(d.date)} />
                  ))}
                  {(anchor || endpoints.length > 0) && (
                    <p className="muted anchor-row">
                      <span>Starts at</span>
                      <select aria-label={`Where ${shortDate(d.date)} starts`} value={startId ?? ''} onChange={(e) => setEndpoint(d.dayId, 'start', e.target.value || null)}>
                        <option value="">nowhere in particular</option>
                        {endpoints.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <span>and ends at</span>
                      <select aria-label={`Where ${shortDate(d.date)} ends`} value={endId ?? ''} onChange={(e) => setEndpoint(d.dayId, 'end', e.target.value || null)}>
                        <option value="">nowhere in particular</option>
                        {endpoints.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </p>
                  )}
                  {check && ordered.length > 1 && (
                    <p className={'muted draft-travel' + (check.travel > LONG_TRAVEL_MINUTES ? ' warn' : '')}>
                      {fmtMinutes(check.travel)} of travel · ends about {clockText(check.end)}
                      {check.travel > LONG_TRAVEL_MINUTES && ' — that’s a lot of getting about; consider moving something to another day'}
                    </p>
                  )}
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
                            leg={check?.legTo[id]}
                            label={d.labels?.[id]}
                            problem={check?.problems.filter((x) => x.id === id).map((x) => x.text).join(' · ') || undefined}
                            canLabel={pl?.tag === 'Food' || pl?.tag === 'Cafes'}
                            fixed={d.times?.[id]}
                            onFix={(t) => setFixedTime(d.dayId, id, t)}
                            pinned={pins.has(id)}
                            onPin={() => togglePin(id)}
                            moveTo={mapDays.filter((m) => m.dayId !== d.dayId).map((m) => ({ dayId: m.dayId, label: m.label }))}
                            onMove={(to) => moveToDay(d.dayId, id, to)}
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
                  {d.mode !== 'off' && (
                    <div className="near-row">
                      <span className="near-lead muted">
                        {d.placeIds.length === 0 ? 'Near where you’re staying:' : 'Not planned yet, measured from the closest place on this day:'}
                      </span>
                      {spareFor(d, 3).map(({ place, km, from }) => (
                        <button
                          key={place.id}
                          className="near-chip"
                          onClick={() => addToPlanDay(d.dayId, place.id)}
                          title={from ? `${place.name} — ${kmText(km)} from ${from.name}` : place.name}
                        >
                          + {place.name} <small className="muted">{kmText(km)}{from ? ` from ${from.name}` : ''}</small>
                        </button>
                      ))}
                      <button className="near-chip add" onClick={() => setPickFor(d.dayId)}>+ From your saved places…</button>
                      <button className="near-chip add" onClick={() => setAddingTo(d.dayId)}>+ A place not on your list…</button>
                    </div>
                  )}
                  {dayJourneys(d.date).leaving.map((t) => (
                    <DraftJourney key={t.id} transfer={t} free={windowOf(d.date)} />
                  ))}
                  {d.placeIds.some((id) => pins.has(id)) && (
                    <button className="soft-btn replan-btn" onClick={() => replanOneDay(d.dayId)}>
                      Re-plan this day around my pins
                    </button>
                  )}
                  {check && check.problems.length > 0 && !better && (
                    <p className="muted">Reordering won’t fix {check.problems.length === 1 ? 'that' : 'those'}. Consider setting {check.problems.length === 1 ? 'it' : 'them'} aside and adding {check.problems.length === 1 ? 'it' : 'them'} to another day.</p>
                  )}
                </div>
              )
            })}
            <details className="card unsched" open={plan.unscheduled.length <= 6}>
              <summary>
                <strong>Unscheduled ({plan.unscheduled.length})</strong>
                <small className="muted">
                  {fitAll ? 'closed on the days you’re here' : 'your days were already full — add any below, or go Back and tick “Fit every place in”'}
                </small>
              </summary>
              {plan.unscheduled.slice(0, 60).map((id) => {
                const ranked = rankDays(id)
                const best = ranked[0]
                const p = placeById.get(id)
                return (
                  <div key={id} className="unsched-row">
                    <span className="unsched-name" title={`${p?.name ?? ''} — ${plan.reasons?.[id] ?? 'the days were already full at this pace'}`}>
                      {row(p)}
                      <small className="muted why">{plan.reasons?.[id] ?? 'days full'}</small>
                    </span>
                    {best && (
                      <button className="fit-btn" title={best.near ? `${kmText(best.km)} from ${best.near.name}` : `quietest day (${best.count} planned)`} onClick={() => addToPlanDay(best.day.dayId, id)}>
                        + {shortDate(best.day.date)}
                        {best.near ? ` · ${kmText(best.km)}` : ''}
                      </button>
                    )}
                    <select
                      className="unsched-day"
                      aria-label={`Add ${p?.name ?? 'this place'} to a day`}
                      value=""
                      onChange={(e) => e.target.value && addToPlanDay(e.target.value, id)}
                    >
                      <option value="">Day…</option>
                      {ranked.map((r) => (
                        <option key={r.day.dayId} value={r.day.dayId}>{shortDate(r.day.date)}{r.near ? ` · ${kmText(r.km)}` : ''}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
              {plan.unscheduled.length > 60 && <p className="muted">…and {plan.unscheduled.length - 60} more.</p>}
            </details>
              </div>
              <aside className="draft-side">
                {activeDay ? (
                  <>
                    <p className="muted draft-side-head"><strong>{shortDate(activeDay.date)}</strong> · tap a <span className="spare-dot">+</span> pin to add it to this day</p>
                    <DraftMap
                      days={mapDays}
                      activeId={activeDay.dayId}
                      spare={spareFor(activeDay, 12).map((x) => x.place)}
                      anchor={activeDay.anchorId ? placeById.get(activeDay.anchorId) : undefined}
                      onAdd={(id) => addToPlanDay(activeDay.dayId, id)}
                      onPickDay={setMapDayId}
                    />
                    <div className="day-key">
                      {mapDays.map((d, i) => (
                        <button
                          key={d.dayId}
                          className={'day-key-chip' + (d.dayId === activeDay.dayId ? ' on' : '')}
                          onClick={() => setMapDayId(d.dayId)}
                          aria-pressed={d.dayId === activeDay.dayId}
                        >
                          <i style={{ background: dayColour(i) }} aria-hidden /> {d.label}
                          <small className="muted">{d.places.length}</small>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="muted">Pick a day to see it on the map.</p>
                )}
              </aside>
            </div>
            {pickFor &&
              createPortal(
                <DraftPicker
                  places={stopPlaces.filter((p) => p.tag !== 'Accommodation' && p.tag !== 'Transport')}
                  dayLabel={shortDate(plan.days.find((d) => d.dayId === pickFor)?.date ?? '')}
                  whereIs={(id) => {
                    const on = plan.days.find((d) => d.placeIds.includes(id))
                    return on ? shortDate(on.date) : undefined
                  }}
                  onPick={(id) => {
                    const on = plan.days.find((d) => d.placeIds.includes(id))
                    if (on && on.dayId !== pickFor) moveToDay(on.dayId, id, pickFor)
                    else if (!on) addToPlanDay(pickFor, id)
                    setPickFor(null)
                  }}
                  onClose={() => setPickFor(null)}
                />,
                document.body,
              )}
            {addingTo &&
              createPortal(
                <AddPlaceSheet
                  trip={trip}
                  onClose={() => setAddingTo(null)}
                  onAdded={(id) => {
                    addToPlanDay(addingTo, id)
                    setAddingTo(null)
                  }}
                />,
                document.body,
              )}
            <div className="row buttons">
              <button
                className="primary"
                onClick={() => {
                  applySuggestion(plan.days.filter((d) => d.mode !== 'off').map((d) => ({ dayId: d.dayId, placeIds: d.placeIds, times: d.times, startId: d.startId, endId: d.endId })))
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
