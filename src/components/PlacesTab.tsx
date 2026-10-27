import { useEffect, useMemo, useRef, useState } from 'react'
import { ImportError, readMapFile } from '../lib/kml'
import {
  clearPlaces,
  importPlaces,
  mergeGroups,
  movePlaces,
  renameGroup,
  renamePlace,
  resetPlaceName,
  restoreOriginalNames,
  retryNaming,
  englishNameCandidates,
  applyEnglishNames,
  setGroupStop,
  setPlaceTag,
  useAppData,
} from '../lib/store'
import { TAGS, TAG_STYLE } from '../lib/tagging'
import type { Group, ImportSummary, Place, Stop, Tag } from '../types'
import { FilterChips, tagOf } from './FilterChips'
import { PlaceSheet } from './PlaceSheet'
import { QuickTag } from './QuickTag'

function NameField({ place }: { place: Place }) {
  const [text, setText] = useState(place.name)
  useEffect(() => setText(place.name), [place.name])
  return (
    <>
      <label>
        Name
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim()
            if (v && v !== place.name) renamePlace(place.id, v)
            else setText(place.name)
          }}
        />
      </label>
      {place.originalName && (
        <p className="muted">
          Originally “{place.originalName}”{' '}
          <button className="linklike" onClick={() => resetPlaceName(place.id)}>Undo</button>
        </p>
      )}
    </>
  )
}

function PlaceRow({
  place,
  selectMode,
  selected,
  onToggle,
  onDetails,
}: {
  place: Place
  selectMode: boolean
  selected: boolean
  onToggle: () => void
  onDetails: () => void
}) {
  const style = TAG_STYLE[tagOf(place) as keyof typeof TAG_STYLE]
  const title = (
    <>
      <i className="dot" style={{ background: style.colour }} />
      {place.name}
      <small className="muted"> {tagOf(place)}</small>
    </>
  )
  if (selectMode) {
    return (
      <label className="place select-row">
        <input type="checkbox" checked={selected} onChange={onToggle} />
        <span>{title}</span>
      </label>
    )
  }
  return (
    <details className="place">
      <summary>{title}</summary>
      <button className="wide" onClick={onDetails}>Photos and details</button>
      <NameField place={place} />
      {place.description && <p className="desc">{place.description}</p>}
      <p className="muted">{place.lat.toFixed(4)}, {place.lon.toFixed(4)} · layer: {place.layer}</p>
      <label>
        Category
        <select
          value={place.tag ?? ''}
          onChange={(e) => setPlaceTag(place.id, (e.target.value || undefined) as Tag | undefined)}
        >
          <option value="">Untagged</option>
          {TAGS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
    </details>
  )
}

function GroupSection({
  group,
  places,
  total,
  stops,
  otherGroups,
  selectMode,
  selected,
  toggle,
  onDetails,
}: {
  group: Group
  places: Place[]
  total: number
  stops: Stop[]
  otherGroups: Group[]
  selectMode: boolean
  selected: Set<string>
  toggle: (id: string) => void
  onDetails: (id: string) => void
}) {
  const stop = stops.find((s) => s.id === group.stopId)
  return (
    <details className="layer" open>
      <summary>
        {group.name} <span className="muted">({places.length === total ? total : `${places.length} of ${total}`})</span>
        {stop && <small className="muted"> · {stop.name}</small>}
      </summary>
      {!selectMode && (
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
            <select
              aria-label="Trip stop"
              value={group.stopId ?? ''}
              onChange={(e) => setGroupStop(group.id, e.target.value || undefined)}
            >
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
      )}
      {places.map((p) => (
        <PlaceRow key={p.id} place={p} selectMode={selectMode} selected={selected.has(p.id)} onToggle={() => toggle(p.id)} onDetails={() => onDetails(p.id)} />
      ))}
    </details>
  )
}

export function PlacesTab({ tagFilter, setTagFilter }: { tagFilter: string[]; setTagFilter: (v: string[]) => void }) {
  const { places, groups, trips, activeTripId } = useAppData()
  const trip = trips.find((t) => t.id === activeTripId)
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'location' | 'layer'>('location')
  const [quickTag, setQuickTag] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailsId, setDetailsId] = useState<string | null>(null)

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

  if (!trip) {
    return (
      <section>
        <h2>Places</h2>
        <p className="muted">Create a trip first (on the Trip tab), then you can import places into it.</p>
      </section>
    )
  }

  if (quickTag) return <QuickTag places={untagged} groups={myGroups} onDone={() => setQuickTag(false)} />

  async function onFile(file: File | undefined) {
    if (!file || !trip) return
    setBusy(true)
    setError('')
    setSummary(null)
    try {
      const parsed = await readMapFile(file)
      if (parsed.places.length === 0) {
        throw new ImportError('We read the file but found no places with a location in it.')
      }
      setSummary(importPlaces(trip.id, parsed, file.name))
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'Something went wrong reading that file.')
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = '' // allow choosing the same file again
    }
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

  return (
    <section>
      <h2>Places</h2>
      <div className="card">
        <p>
          Export your map from Google My Maps as <strong>KML/KMZ</strong>, then choose the file here.
          Importing the same file again won’t create duplicates.
        </p>
        <input ref={fileInput} type="file" accept=".kml,.kmz" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="primary wide" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? 'Reading…' : 'Import KML / KMZ file'}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
        {summary && (
          <div className="import-summary" role="status">
            <strong>Import finished — {summary.fileName}</strong>
            <ul>
              <li>{summary.found} places found</li>
              <li>{summary.added} added</li>
              {summary.duplicates > 0 && <li>{summary.duplicates} already in your trip (skipped)</li>}
              {summary.noLocation > 0 && <li>{summary.noLocation} skipped (lines or areas, not single places)</li>}
              <li>Layers: {summary.layers.map((l) => `${l.name} (${l.count})`).join(', ')}</li>
              <li>Sorted into {myGroups.length} location group{myGroups.length === 1 ? '' : 's'}</li>
            </ul>
          </div>
        )}
      </div>

      {mine.length > 0 && (
        <>
          {untagged.length > 0 && (
            <button className="primary wide" onClick={() => setQuickTag(true)}>
              Tag {untagged.length} untagged place{untagged.length === 1 ? '' : 's'}
            </button>
          )}
          {(englishCount > 0 || mine.some((p) => p.originalName)) && (
            <div className="card">
              {englishCount > 0 && (
                <>
                  <p>
                    {englishCount} place name{englishCount === 1 ? ' has' : 's have'} Korean, Chinese or Japanese text
                    with an English version alongside.
                  </p>
                  <button className="primary wide" onClick={() => { applyEnglishNames(trip.id) }}>
                    Use the English names
                  </button>
                </>
              )}
              {mine.some((p) => p.originalName) && (
                <button className="wide" onClick={() => restoreOriginalNames(trip.id)}>Restore all original names</button>
              )}
              <p className="muted">You can also tap any place to rename it yourself.</p>
            </div>
          )}
          <FilterChips places={mine} value={tagFilter} onChange={setTagFilter} />
          <input
            type="search"
            placeholder="Search places…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search places"
          />
          <div className="segmented" role="group" aria-label="Group places by">
            <button className={view === 'location' ? 'on' : ''} onClick={() => setView('location')}>By location</button>
            <button className={view === 'layer' ? 'on' : ''} onClick={() => { setView('layer'); stopSelecting() }}>By My Maps layer</button>
          </div>
          <p className="muted">
            {shown.length} of {mine.length} places
            {waitingForNames && ' · looking up area names…'}
          </p>
          {failedNames && !waitingForNames && (
            <p className="muted">
              Some areas couldn’t be named (no connection?) and show as “Area N”.{' '}
              <button onClick={retryNaming}>Try naming again</button>
            </p>
          )}

          {view === 'location' && (
            <>
              <button className="wide" onClick={() => (selectMode ? stopSelecting() : setSelectMode(true))}>
                {selectMode ? 'Cancel moving' : 'Move or split places'}
              </button>
              {myGroups.map((g) => {
                const inGroup = shown.filter((p) => p.groupId === g.id)
                if (inGroup.length === 0 && (tagFilter.length > 0 || query)) return null
                return (
                  <GroupSection
                    key={g.id}
                    group={g}
                    places={inGroup}
                    total={mine.filter((p) => p.groupId === g.id).length}
                    stops={trip.stops}
                    otherGroups={myGroups.filter((o) => o.id !== g.id)}
                    selectMode={selectMode}
                    selected={selected}
                    toggle={toggle}
                    onDetails={setDetailsId}
                  />
                )
              })}
            </>
          )}

          {view === 'layer' &&
            [...byLayer].map(([layer, items]) => (
              <details key={layer} open className="layer">
                <summary>
                  {layer} <span className="muted">({items.length})</span>
                </summary>
                {items.map((p) => (
                  <PlaceRow key={p.id} place={p} selectMode={false} selected={false} onToggle={() => {}} onDetails={() => setDetailsId(p.id)} />
                ))}
              </details>
            ))}

          <button
            className="danger wide"
            onClick={() => confirm(`Remove all ${mine.length} places from “${trip.name}”?`) && clearPlaces(trip.id)}
          >
            Remove all places from this trip
          </button>

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
    </section>
  )
}
