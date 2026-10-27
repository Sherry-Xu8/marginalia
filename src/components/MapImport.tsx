import { useRef, useState } from 'react'
import { ImportError, readMapFile } from '../lib/kml'
import { importPlaces, useAppData } from '../lib/store'
import type { ImportSummary } from '../types'

// Choose a Google My Maps export (KML/KMZ) and add its places to the trip.
export function MapImport({ tripId }: { tripId: string }) {
  const { groups } = useAppData()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const groupCount = groups.filter((g) => g.tripId === tripId).length

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    setSummary(null)
    try {
      const parsed = await readMapFile(file)
      if (parsed.places.length === 0) {
        throw new ImportError('We read the file but found no places with a location in it.')
      }
      setSummary(importPlaces(tripId, parsed, file.name))
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'Something went wrong reading that file.')
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = '' // allow choosing the same file again
    }
  }

  return (
    <>
      <p className="muted">
        Bring in layers from Google My Maps. Export your map as KML or KMZ, then choose the file here. Files stay on
        this device, and importing the same file twice won’t create duplicates.
      </p>
      <input ref={fileInput} type="file" accept=".kml,.kmz" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <button className="soft-btn" disabled={busy} onClick={() => fileInput.current?.click()}>
        {busy ? 'Reading…' : 'Import a KML or KMZ'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
      {summary && (
        <div className="import-summary" role="status">
          <strong>Import finished — {summary.fileName}</strong>
          <ul>
            <li>{summary.found} places found, {summary.added} added</li>
            {summary.duplicates > 0 && <li>{summary.duplicates} already in your trip (skipped)</li>}
            {summary.noLocation > 0 && <li>{summary.noLocation} skipped (lines or areas, not single places)</li>}
            <li>Layers: {summary.layers.map((l) => `${l.name} (${l.count})`).join(', ')}</li>
            <li>Sorted into {groupCount} location group{groupCount === 1 ? '' : 's'}</li>
          </ul>
        </div>
      )}
    </>
  )
}
