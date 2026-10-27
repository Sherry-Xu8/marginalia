import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useState } from 'react'
import { fromISO, shortDate, stopLabel, stopsOn, toISO } from '../lib/days'
import { addToDay, moveDayItem, removeDayItem, sortDayByTime, updateDayItem, useAppData } from '../lib/store'
import { TAG_STYLE } from '../lib/tagging'
import type { Day, DayItem, Place, Trip } from '../types'
import { FilterChips, tagOf } from './FilterChips'

function ItemRow({ day, item, place }: { day: Day; item: DayItem; place: Place | undefined }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const [open, setOpen] = useState(false)
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }
  const emoji = place ? TAG_STYLE[tagOf(place) as keyof typeof TAG_STYLE].emoji : '❔'

  return (
    <div ref={setNodeRef} style={style} className={'item' + (item.done ? ' done' : '')}>
      <button className="handle" aria-label="Drag to reorder" {...attributes} {...listeners}>⠿</button>
      <input
        type="checkbox"
        className="tick"
        aria-label="Done"
        checked={item.done}
        onChange={(e) => updateDayItem(day.id, item.id, { done: e.target.checked })}
      />
      <button className="item-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <strong>{emoji} {place?.name ?? '(place removed)'}</strong>
        {(item.time || item.note) && (
          <span className="muted">{[item.time, item.note].filter(Boolean).join(' · ')}</span>
        )}
      </button>
      {open && (
        <div className="item-edit">
          <label>
            Time (optional)
            <input type="time" value={item.time ?? ''} onChange={(e) => updateDayItem(day.id, item.id, { time: e.target.value || undefined })} />
          </label>
          <label>
            Note (e.g. opening hours)
            <textarea
              rows={2}
              value={item.note}
              onChange={(e) => updateDayItem(day.id, item.id, { note: e.target.value })}
            />
          </label>
          <button className="danger" onClick={() => removeDayItem(day.id, item.id)}>Remove from this day</button>
        </div>
      )}
    </div>
  )
}

function PlacePicker({ trip, day, onClose }: { trip: Trip; day: Day; onClose: () => void }) {
  const { places, groups } = useAppData()
  const mine = useMemo(() => places.filter((p) => p.tripId === trip.id), [places, trip.id])
  const myGroups = groups.filter((g) => g.tripId === trip.id)
  const stopIds = stopsOn(trip, day.date).map((s) => s.id)
  const [groupId, setGroupId] = useState(myGroups.find((g) => g.stopId && stopIds.includes(g.stopId))?.id ?? 'all')
  const [tags, setTags] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const onDay = new Set(day.items.map((i) => i.placeId))
  const q = query.trim().toLowerCase()
  const list = mine.filter(
    (p) =>
      !onDay.has(p.id) &&
      (groupId === 'all' || p.groupId === groupId) &&
      (tags.length === 0 || tags.includes(tagOf(p))) &&
      (!q || p.name.toLowerCase().includes(q)),
  )

  return (
    <div className="sheet" role="dialog" aria-label="Add places">
      <div className="sheet-head">
        <strong>Add to {shortDate(day.date)}</strong>
        <button className="primary" onClick={onClose}>Done</button>
      </div>
      <div className="sheet-body">
        <input type="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {myGroups.length > 1 && (
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Area">
            <option value="all">All areas</option>
            {myGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
        <FilterChips places={mine} value={tags} onChange={setTags} />
        {list.length === 0 && <p className="muted">Nothing left to add with these filters.</p>}
        {list.slice(0, 100).map((p) => (
          <button key={p.id} className="pick" onClick={() => addToDay(day.id, p.id)}>
            <span>{TAG_STYLE[tagOf(p) as keyof typeof TAG_STYLE].emoji} {p.name}</span>
            <b>+ Add</b>
          </button>
        ))}
        {list.length > 100 && <p className="muted">Showing 100 — search or filter to narrow down.</p>}
      </div>
    </div>
  )
}

export function DaysTab() {
  const { trips, activeTripId, days, places } = useAppData()
  const trip = trips.find((t) => t.id === activeTripId)
  const tripDays = useMemo(
    () => days.filter((d) => d.tripId === activeTripId).sort((a, b) => a.date.localeCompare(b.date)),
    [days, activeTripId],
  )
  const [selected, setSelected] = useState('')
  const [picking, setPicking] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Start on today if it's a trip day, otherwise the first day.
  useEffect(() => {
    if (tripDays.length > 0 && !tripDays.some((d) => d.id === selected)) {
      setSelected((tripDays.find((d) => d.date === toISO(new Date())) ?? tripDays[0]).id)
    }
  }, [tripDays, selected])

  if (!trip) {
    return (
      <section>
        <h2>Days</h2>
        <p className="muted">Create a trip first (on the Trip tab).</p>
      </section>
    )
  }
  const day = tripDays.find((d) => d.id === selected)
  if (!day) return <section><h2>Days</h2><p className="muted">This trip has no dates yet.</p></section>

  const placeById = new Map(places.map((p) => [p.id, p]))
  const dayNumber = tripDays.indexOf(day) + 1
  const label = stopLabel(trip, day.date)
  const done = day.items.filter((i) => i.done).length
  const timed = day.items.filter((i) => i.time).length

  function onDragEnd(e: DragEndEvent) {
    if (day && e.over && e.active.id !== e.over.id) moveDayItem(day.id, String(e.active.id), String(e.over.id))
  }

  return (
    <section>
      <div className="pills" role="tablist" aria-label="Days">
        {tripDays.map((d, i) => (
          <button
            key={d.id}
            role="tab"
            aria-selected={d.id === selected}
            className={d.id === selected ? 'on' : ''}
            onClick={() => setSelected(d.id)}
          >
            <small>Day {i + 1}</small>
            {fromISO(d.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            {d.items.length > 0 && <small>{d.items.length} 📍</small>}
          </button>
        ))}
      </div>

      <h2>Day {dayNumber} · {shortDate(day.date)}</h2>
      <p className="muted">{label || 'No trip stop for this date yet'}</p>

      {day.items.length === 0 ? (
        <div className="card">
          <p>Nothing planned yet. Add places from your imported list, or tap a pin on the Map and choose “Add to day”.</p>
        </div>
      ) : (
        <>
          <p className="muted">{done} of {day.items.length} done · drag ⠿ to reorder · tap a place for time and notes</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={day.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {day.items.map((item) => (
                <ItemRow key={item.id} day={day} item={item} place={placeById.get(item.placeId)} />
              ))}
            </SortableContext>
          </DndContext>
          {timed > 1 && <button className="wide" onClick={() => sortDayByTime(day.id)}>Sort by time</button>}
        </>
      )}
      <button className="primary wide" onClick={() => setPicking(true)}>+ Add places</button>
      {picking && <PlacePicker trip={trip} day={day} onClose={() => setPicking(false)} />}
    </section>
  )
}
