import { useMemo, useRef, useState } from 'react'
import { ImportError, readMapFile } from '../lib/kml'
import { clearPlaces, importPlaces, useAppData } from '../lib/store'
import type { ImportSummary } from '../types'

export function PlacesTab() {
  const { places, trips, activeTripId } = useAppData()
  const trip = trips.find((t) => t.id === activeTripId)
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [query, setQuery] = useState('')

  const mine = useMemo(() => places.filter((p) => p.tripId === activeTripId), [places, activeTripId])

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const shown = q
      ? mine.filter((p) => (p.name + ' ' + p.description + ' ' + p.layer).toLowerCase().includes(q))
      : mine
    const byLayer = new Map<string, typeof shown>()
    for (const p of shown) byLayer.set(p.layer, [...(byLayer.get(p.layer) ?? []), p])
    return { byLayer, count: shown.length }
  }, [mine, query])

  if (!trip) {
    return (
      <section>
        <h2>Places</h2>
        <p className="muted">Create a trip first (on the Trip tab), then you can import places into it.</p>
      </section>
    )
  }

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

  return (
    <section>
      <h2>Places</h2>
      <div className="card">
        <p>
          Export your map from Google My Maps as <strong>KML/KMZ</strong>, then choose the file here.
          Importing the same file again won’t create duplicates.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".kml,.kmz"
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button className="primary wide" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? 'Reading…' : 'Import KML / KMZ file'}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
        {summary && (
          <div className="summary" role="status">
            <strong>Import finished — {summary.fileName}</strong>
            <ul>
              <li>{summary.found} places found</li>
              <li>{summary.added} added</li>
              {summary.duplicates > 0 && <li>{summary.duplicates} already in your trip (skipped)</li>}
              {summary.noLocation > 0 && (
                <li>{summary.noLocation} skipped (lines or areas, not single places)</li>
              )}
              <li>
                Layers: {summary.layers.map((l) => `${l.name} (${l.count})`).join(', ')}
              </li>
            </ul>
          </div>
        )}
      </div>

      {mine.length > 0 && (
        <>
          <input
            type="search"
            placeholder="Search places…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search places"
          />
          <p className="muted">
            {grouped.count} of {mine.length} places, grouped by My Maps layer
          </p>
          {[...grouped.byLayer].map(([layer, items]) => (
            <details key={layer} open className="layer">
              <summary>
                {layer} <span className="muted">({items.length})</span>
              </summary>
              {items.map((p) => (
                <details key={p.id} className="place">
                  <summary>{p.name}</summary>
                  {p.description && <p className="desc">{p.description}</p>}
                  <p className="muted">{p.lat.toFixed(4)}, {p.lon.toFixed(4)}</p>
                </details>
              ))}
            </details>
          ))}
          <button
            className="danger wide"
            onClick={() =>
              confirm(`Remove all ${mine.length} places from “${trip.name}”?`) && clearPlaces(trip.id)
            }
          >
            Remove all places from this trip
          </button>
        </>
      )}
    </section>
  )
}
