import { Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { ImportError, readMapFile } from '../lib/kml'
import { importPlaces, placesGoneFromFile, useAppData } from '../lib/store'
import type { ImportSummary, Place } from '../types'
import { ReviewGoneSheet } from './ReviewGoneSheet'

// Choose a Google My Maps export (KML/KMZ) and add its places to the trip.
export function MapImport({
  tripId,
  compact,
  onResult,
}: {
  tripId: string
  compact?: boolean // just the button; the parent shows the result
  onResult?: (summary: ImportSummary | null, error: string) => void
}) {
  const { groups } = useAppData()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [gone, setGone] = useState<Place[]>([])
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
      const done = importPlaces(tripId, parsed, file.name)
      setSummary(done)
      onResult?.(done, '')
      setGone(placesGoneFromFile(tripId, parsed)) // places that vanished from the map since last time
    } catch (e) {
      const msg = e instanceof ImportError ? e.message : 'Something went wrong reading that file.'
      setError(msg)
      onResult?.(null, msg)
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = '' // allow choosing the same file again
    }
  }

  if (compact) {
    return (
      <>
        <input ref={fileInput} type="file" accept=".kml,.kmz" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="soft-btn import-top" disabled={busy} onClick={() => fileInput.current?.click()}>
          <Upload size={18} /> {busy ? 'Reading…' : 'Import map'}
        </button>
        {gone.length > 0 && <ReviewGoneSheet gone={gone} onClose={() => setGone([])} />}
      </>
    )
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
      {gone.length > 0 && <ReviewGoneSheet gone={gone} onClose={() => setGone([])} />}
    </>
  )
}
