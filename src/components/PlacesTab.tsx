import { Check, ChevronDown, Info, MapPin, MoreHorizontal, Plus, Star } from 'lucide-react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  applyEnglishNames,
  clearPlaces,
  englishNameCandidates,
  mergeGroups,
  movePlaces,
  renameGroup,
  restoreOriginalNames,
  retryNaming,
  setGroupStop,
  setPlaceMust,
  useAppData,
} from '../lib/store'
import { TAG_STYLE } from '../lib/tagging'
import type { Group, ImportSummary, Place, Stop } from '../types'
import { AddPlaceSheet } from './AddPlaceSheet'
import { shortDate } from '../lib/days'
import { FilterChips, tagOf } from './FilterChips'
import { MapImport } from './MapImport'
import { PlaceSheet } from './PlaceSheet'
import { PlacesMap } from './PlacesMap'
import { QuickTag } from './QuickTag'
import { PlaceThumb } from './TagIcon'
import { ask } from '../lib/confirm'

// True on phones and small tablets, where the list and the map take turns instead of sitting side by side.
function useNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const q = window.matchMedia('(max-width: 959px)')
      q.addEventListener('change', cb)
      return () => q.removeEventListener('change', cb)
    },
    () => window.matchMedia('(max-width: 959px)').matches,
  )
}

function PlaceCard({
  place,
  focused,
  selectMode,
  selected,
  onToggle,
  onFocus,
  onDetails,
  plannedOn,
}: {
  place: Place
  plannedOn: string[]
  focused: boolean
  selectMode: boolean
  selected: boolean
  onToggle: () => void
  onFocus: () => void
  onDetails: () => void
}) {
  const style = TAG_STYLE[tagOf(place) as keyof typeof TAG_STYLE]
  const body = (
    <>
      <PlaceThumb place={place} size={54} />
      <span className="place-text">
        <span className="place-name">{place.name}</span>
        <small className="muted">
          <i className="dot" style={{ background: style.colour }} />
          {tagOf(place)}
        </small>
        {plannedOn.length > 0 && (
          <small className="planned-chip">
            <Check size={12} aria-hidden /> {plannedOn.length > 2 ? `${plannedOn.length} days` : plannedOn.map((d) => shortDate(d)).join(', ')}
          </small>
        )}
        {place.details?.hours && <small className="muted place-hours">{place.details.hours}</small>}
      </span>
    </>
  )
  if (selectMode) {
    return (
      <label className="place-card select-row" id={`pc-${place.id}`}>
        <input type="checkbox" checked={selected} onChange={onToggle} />
        {body}
      </label>
    )
  }
  return (
    <div className={'place-card' + (focused ? ' focused' : '')} id={`pc-${place.id}`}>
      <button className="place-main" onClick={onFocus} aria-label={`Show ${place.name} on the map`}>
        {body}
      </button>
      <button
        className={'icon-btn star-btn' + (place.must ? ' on' : '')}
        aria-label={place.must ? `Remove ${place.name} from must-dos` : `Mark ${place.name} as a must-do`}
        aria-pressed={!!place.must}
        title={place.must ? 'Must-do' : 'Mark as a must-do'}
        onClick={() => setPlaceMust(place.id, !place.must)}
      >
        <Star size={19} fill={place.must ? 'currentColor' : 'none'} />
      </button>
      <button className="icon-btn" aria-label={`Details for ${place.name}`} onClick={onDetails}>
        <Info size={19} />
      </button>
    </div>
  )
}

function GroupSection({
  group,
  count,
  total,
  stops,
  otherGroups,
  collapsed,
  onToggle,
  children,
}: {
  group: Group
  count: number
  total: number
  stops: Stop[]
  otherGroups: Group[]
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const stop = stops.find((s) => s.id === group.stopId)
  return (
    <section className={'group' + (collapsed ? ' collapsed' : '')}>
      <header className="group-head">
        <h2 className="display">
          <button className="group-toggle" aria-expanded={!collapsed} onClick={onToggle}>
            <ChevronDown size={22} className="chev" aria-hidden />
            {group.name}
          </button>
        </h2>
        <span className="tag-pill">{count === total ? `${total} places` : `${count} of ${total}`}</span>
        {stop && <span className="tag-pill warm">Stop: {stop.name}</span>}
        <details className="group-more">
          <summary aria-label={`Options for ${group.name}`}><MoreHorizontal size={20} /></summary>
          <div className="manage">
            <button
              onClick={() => {
                const name = prompt('New name for this area:', group.name)?.trim()
                if (name) renameGroup(group.id, name)
              }}
            >
              Rename
            </button>
            {stops.length > 0 && (
              <select aria-label="Trip stop" value={group.stopId ?? ''} onChange={(e) => setGroupStop(group.id, e.target.value || undefined)}>
                <option value="">No trip stop</option>
                {stops.map((s) => (
                  <option key={s.id} value={s.id}>Stop: {s.name}</option>
                ))}
              </select>
            )}
            {otherGroups.length > 0 && (
              <select
                aria-label="Merge into another area"
                value=""
                onChange={(e) => {
                  const into = otherGroups.find((g) => g.id === e.target.value)
                  if (into) ask(`Merge “${group.name}” into “${into.name}”?`, () => mergeGroups(group.id, into.id), 'Merge')
                }}
              >
                <option value="">Merge into…</option>
                {otherGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
          </div>
        </details>
      </header>
      {!collapsed && <div className="place-grid">{children}</div>}
    </section>
  )
}

export function PlacesTab({
  tagFilter,
  setTagFilter,
  initialPane = 'list',
}: {
  tagFilter: string[]
  setTagFilter: (v: string[]) => void
  initialPane?: 'list' | 'map'
}) {
  const { places, groups, trips, activeTripId, days } = useAppData()
  const [planFilter, setPlanFilter] = useState<'all' | 'todo' | 'planned'>('all')
  const trip = trips.find((t) => t.id === activeTripId)
  const narrow = useNarrow()
  const [query, setQuery] = useState('')
  const [layerFilter, setLayerFilter] = useState('all') // only offered when the map has several named layers
  const [quickTag, setQuickTag] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [focusId, setFocusId] = useState<string | undefined>()
  const [pane, setPane] = useState<'list' | 'map'>(initialPane)
  // Areas you've folded away, so you can see another one without scrolling past it.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem('collapsed-areas') ?? '[]'))
    } catch {
      return new Set<string>()
    }
  })
  const saveCollapsed = (next: Set<string>) => {
    setCollapsed(next)
    try {
      localStorage.setItem('collapsed-areas', JSON.stringify([...next]))
    } catch {
      // not saved — fine
    }
  }
  const toggleArea = (id: string) => {
    const next = new Set(collapsed)
    if (!next.delete(id)) next.add(id)
    saveCollapsed(next)
  }
  const [importResult, setImportResult] = useState<{ summary: ImportSummary | null; error: string } | null>(null)

  const mine = useMemo(() => places.filter((p) => p.tripId === activeTripId), [places, activeTripId])
  const myGroups = useMemo(() => groups.filter((g) => g.tripId === activeTripId), [groups, activeTripId])
  // The days each place is planned on, so you can see what's already in your itinerary.
  const plannedOn = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const d of days) {
      if (d.tripId !== activeTripId) continue
      for (const i of d.items) m.set(i.placeId, [...(m.get(i.placeId) ?? []), d.date].sort())
    }
    return m
  }, [days, activeTripId])
  const untagged = useMemo(() => mine.filter((p) => !p.tag), [mine])
  const englishCount = useMemo(() => (activeTripId ? englishNameCandidates(activeTripId).length : 0), [mine, activeTripId])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return mine.filter(
      (p) =>
        (tagFilter.length === 0 || tagFilter.includes(tagOf(p))) &&
        (layerFilter === 'all' || p.layer === layerFilter) &&
        (planFilter === 'all' || (planFilter === 'planned') === plannedOn.has(p.id)) &&
        (!q || (p.name + ' ' + p.description + ' ' + p.layer).toLowerCase().includes(q)),
    )
  }, [mine, query, tagFilter, layerFilter, planFilter, plannedOn])

  // Layers from Google My Maps: only worth showing if the map actually has more than one.
  const layerNames = useMemo(() => [...new Set(mine.map((p) => p.layer))].filter(Boolean), [mine])

  // Keep the picked place in view in the list.
  useEffect(() => {
    if (focusId) document.getElementById(`pc-${focusId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusId])

  if (!trip) {
    return (
      <div className="page">
        <h1 className="display">Places</h1>
        <p className="muted">Create a trip first, then you can import places into it.</p>
      </div>
    )
  }

  if (quickTag) return <QuickTag places={untagged} groups={myGroups} onDone={() => setQuickTag(false)} />

  const pick = (id: string) => {
    setFocusId(id)
    if (narrow) setPane('map') // on a phone, the map is a separate view: take you there
  }
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (!n.delete(id)) n.add(id)
      return n
    })
  const stopSelecting = () => {
    setSelectMode(false)
    setSelected(new Set())
  }
  const waitingForNames = myGroups.some((g) => g.nameSource === 'auto')
  const failedNames = myGroups.some((g) => g.nameSource === 'fallback')
  const anyRenamed = mine.some((p) => p.originalName)
  const needsTidy = untagged.length > 0 || englishCount > 0 || anyRenamed || failedNames

  const card = (p: Place) => (
    <PlaceCard
      key={p.id}
      place={p}
      focused={p.id === focusId}
      selectMode={selectMode}
      selected={selected.has(p.id)}
      onToggle={() => toggle(p.id)}
      onFocus={() => pick(p.id)}
      onDetails={() => setDetailsId(p.id)}
      plannedOn={plannedOn.get(p.id) ?? []}
    />
  )

  return (
    <div className="page places-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Places worth a pin</p>
          <h1 className="display">Your map &amp; saved places</h1>
        </div>
        <div className="head-actions">
          <button className="soft-btn import-top" onClick={() => setAdding(true)}><Plus size={18} /> Add a place</button>
          <MapImport tripId={trip.id} compact onResult={(summary, error) => setImportResult({ summary, error })} />
        </div>
      </header>

      {importResult && (
        <div className="card import-result" role="status">
          {importResult.error ? (
            <p className="error">{importResult.error}</p>
          ) : (
            importResult.summary && (
              <>
                <strong>Import finished — {importResult.summary.fileName}</strong>
                <p className="muted">
                  {importResult.summary.found} places found, {importResult.summary.added} added
                  {importResult.summary.duplicates > 0 && `, ${importResult.summary.duplicates} already here (skipped)`}
                  {importResult.summary.noLocation > 0 && `, ${importResult.summary.noLocation} skipped (lines or areas)`}.
                </p>
              </>
            )
          )}
          <button className="link-btn" onClick={() => setImportResult(null)}>Dismiss</button>
        </div>
      )}

      {mine.length === 0 ? (
        <div className="card panel">
          <div className="empty">
            <span className="empty-icon"><MapPin size={30} /></span>
            <h3 className="display">Bring in the places you’ve saved.</h3>
            <p className="muted">Export your map from Google My Maps as KML or KMZ, then choose “Import map”. Importing the same file twice won’t create duplicates.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="places-toolbar">
            <input type="search" placeholder="Search saved places" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search places" />
            {layerNames.length > 1 && (
              <select aria-label="Filter by map layer" value={layerFilter} onChange={(e) => setLayerFilter(e.target.value)} className="layer-select">
                <option value="all">All layers</option>
                {layerNames.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            )}
          </div>
          <FilterChips places={mine} value={tagFilter} onChange={setTagFilter} />
          {plannedOn.size > 0 && (
            <div className="chips" role="group" aria-label="Itinerary">
              {([['all', 'All'], ['todo', `Not planned (${mine.length - plannedOn.size})`], ['planned', `In my days (${plannedOn.size})`]] as const).map(([k, label]) => (
                <button key={k} className={'chip' + (planFilter === k ? ' on' : '')} aria-pressed={planFilter === k} onClick={() => setPlanFilter(k)}>{label}</button>
              ))}
            </div>
          )}

          {needsTidy && (
            <div className="tidy">
              <strong>Tidy up</strong>
              {untagged.length > 0 && <button onClick={() => setQuickTag(true)}>Tag {untagged.length} untagged</button>}
              {englishCount > 0 && <button onClick={() => applyEnglishNames(trip.id)}>Use English names ({englishCount})</button>}
              {anyRenamed && <button onClick={() => restoreOriginalNames(trip.id)}>Restore original names</button>}
              {failedNames && !waitingForNames && <button onClick={retryNaming}>Name areas again</button>}
            </div>
          )}

          {narrow && (
            <div className="segmented pane-toggle" role="group" aria-label="Show">
              <button className={pane === 'list' ? 'on' : ''} onClick={() => setPane('list')}>List</button>
              <button className={pane === 'map' ? 'on' : ''} onClick={() => setPane('map')}>Map</button>
            </div>
          )}

          <div className="places-split">
            <div className={'places-list' + (narrow && pane === 'map' ? ' is-hidden' : '')}>
              <p className="muted count-line">
                {shown.length} of {mine.length} places
                {waitingForNames && ' · looking up area names…'}
                {myGroups.length > 1 && (
                  <button
                    className="link-btn"
                    onClick={() => saveCollapsed(collapsed.size >= myGroups.length ? new Set() : new Set(myGroups.map((g) => g.id)))}
                  >
                    {collapsed.size >= myGroups.length ? 'Expand all' : 'Collapse all'}
                  </button>
                )}
              </p>
              <button className="soft-btn move-btn" onClick={() => (selectMode ? stopSelecting() : setSelectMode(true))}>
                {selectMode ? 'Cancel moving' : 'Move or split places'}
              </button>

              {myGroups.map((g) => {
                  const inGroup = shown.filter((p) => p.groupId === g.id)
                  if (inGroup.length === 0 && (tagFilter.length > 0 || query)) return null
                  return (
                    <GroupSection
                      key={g.id}
                      group={g}
                      count={inGroup.length}
                      total={mine.filter((p) => p.groupId === g.id).length}
                      stops={trip.stops}
                      otherGroups={myGroups.filter((o) => o.id !== g.id)}
                      collapsed={collapsed.has(g.id)}
                      onToggle={() => toggleArea(g.id)}
                    >
                      {inGroup.map(card)}
                    </GroupSection>
                  )
              })}

              <button
                className="link-btn remove-all"
                onClick={() => ask(`Remove all ${mine.length} places from “${trip.name}”?`, () => clearPlaces(trip.id), 'Remove all')}
              >
                Remove all places from this trip
              </button>
            </div>

            <div className={'places-map' + (narrow && pane === 'list' ? ' is-hidden' : '')}>
              <PlacesMap
                places={shown}
                focusId={focusId}
                onFocus={(id) => {
                  setFocusId(id)
                  const gid = mine.find((p) => p.id === id)?.groupId
                  if (gid && collapsed.has(gid)) toggleArea(gid) // show the card for the pin you tapped
                }}
                visible={!narrow || pane === 'map'}
              />
            </div>
          </div>

          {selectMode && (
            <div className="movebar">
              <span>{selected.size} selected</span>
              <select
                aria-label="Move to"
                value=""
                disabled={selected.size === 0}
                onChange={(e) => {
                  if (!e.target.value) return
                  movePlaces([...selected], e.target.value)
                  stopSelecting()
                }}
              >
                <option value="">Move to…</option>
                <option value="new">➕ A new area</option>
                {myGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button onClick={stopSelecting}>Cancel</button>
            </div>
          )}
        </>
      )}
      {detailsId && <PlaceSheet placeId={detailsId} onClose={() => setDetailsId(null)} />}
      {adding && <AddPlaceSheet trip={trip} onClose={() => setAdding(false)} onAdded={(id) => pick(id)} />}
    </div>
  )
}
