import { Info, MapPin, MoreHorizontal } from 'lucide-react'
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
  useAppData,
} from '../lib/store'
import { TAG_STYLE } from '../lib/tagging'
import type { Group, ImportSummary, Place, Stop } from '../types'
import { FilterChips, tagOf } from './FilterChips'
import { MapImport } from './MapImport'
import { PlaceSheet } from './PlaceSheet'
import { PlacesMap } from './PlacesMap'
import { QuickTag } from './QuickTag'
import { PlaceThumb } from './TagIcon'

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
}: {
  place: Place
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
  children,
}: {
  group: Group
  count: number
  total: number
  stops: Stop[]
  otherGroups: Group[]
  children: React.ReactNode
}) {
  const stop = stops.find((s) => s.id === group.stopId)
  return (
    <section className="group">
      <header className="group-head">
        <h2 className="display">{group.name}</h2>
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
                  if (into && confirm(`Merge “${group.name}” into “${into.name}”?`)) mergeGroups(group.id, into.id)
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
      <div className="place-grid">{children}</div>
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
  const { places, groups, trips, activeTripId } = useAppData()
  const trip = trips.find((t) => t.id === activeTripId)
  const narrow = useNarrow()
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'location' | 'layer'>('location')
  const [quickTag, setQuickTag] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | undefined>()
  const [pane, setPane] = useState<'list' | 'map'>(initialPane)
  const [importResult, setImportResult] = useState<{ summary: ImportSummary | null; error: string } | null>(null)

  const mine = useMemo(() => places.filter((p) => p.tripId === activeTripId), [places, activeTripId])
  const myGroups = useMemo(() => groups.filter((g) => g.tripId === activeTripId), [groups, activeTripId])
  const untagged = useMemo(() => mine.filter((p) => !p.tag), [mine])
  const englishCount = useMemo(() => (activeTripId ? englishNameCandidates(activeTripId).length : 0), [mine, activeTripId])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return mine.filter(
      (p) =>
        (tagFilter.length === 0 || tagFilter.includes(tagOf(p))) &&
        (!q || (p.name + ' ' + p.description + ' ' + p.layer).toLowerCase().includes(q)),
    )
  }, [mine, query, tagFilter])

  const byLayer = useMemo(() => {
    const m = new Map<string, Place[]>()
    for (const p of shown) m.set(p.layer, [...(m.get(p.layer) ?? []), p])
    return m
  }, [shown])

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
    />
  )

  return (
    <div className="page places-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Places worth a pin</p>
          <h1 className="display">Your map &amp; saved places</h1>
        </div>
        <MapImport tripId={trip.id} compact onResult={(summary, error) => setImportResult({ summary, error })} />
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
            <div className="segmented" role="group" aria-label="Group places by">
              <button className={view === 'location' ? 'on' : ''} onClick={() => setView('location')}>By area</button>
              <button className={view === 'layer' ? 'on' : ''} onClick={() => { setView('layer'); stopSelecting() }}>By layer</button>
            </div>
          </div>
          <FilterChips places={mine} value={tagFilter} onChange={setTagFilter} />

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
              <p className="muted">
                {shown.length} of {mine.length} places
                {waitingForNames && ' · looking up area names…'}
              </p>
              {view === 'location' && (
                <button className="soft-btn move-btn" onClick={() => (selectMode ? stopSelecting() : setSelectMode(true))}>
                  {selectMode ? 'Cancel moving' : 'Move or split places'}
                </button>
              )}

              {view === 'location' &&
                myGroups.map((g) => {
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
                    >
                      {inGroup.map(card)}
                    </GroupSection>
                  )
                })}

              {view === 'layer' &&
                [...byLayer].map(([layer, items]) => (
                  <section key={layer} className="group">
                    <header className="group-head">
                      <h2 className="display">{layer}</h2>
                      <span className="tag-pill">{items.length} places</span>
                    </header>
                    <div className="place-grid">{items.map(card)}</div>
                  </section>
                ))}

              <button
                className="link-btn remove-all"
                onClick={() => confirm(`Remove all ${mine.length} places from “${trip.name}”?`) && clearPlaces(trip.id)}
              >
                Remove all places from this trip
              </button>
            </div>

            <div className={'places-map' + (narrow && pane === 'list' ? ' is-hidden' : '')}>
              <PlacesMap places={shown} focusId={focusId} onFocus={(id) => { setFocusId(id) }} visible={!narrow || pane === 'map'} />
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
    </div>
  )
}
