import { useRef, useState } from 'react'
import { BackupError, buildFullBackup, buildTripShare, fileNameFor, parseBackup, shareOrDownload } from '../lib/backup'
import { getState, importTripData, replaceAllData } from '../lib/store'
import type { Trip } from '../types'

export function BackupCard({ trip }: { trip?: Trip }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [includeMoney, setIncludeMoney] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function send(json: string, name: string, what: string) {
    setError('')
    const result = await shareOrDownload(json, name)
    setMessage(
      result === 'cancelled' ? '' : result === 'shared' ? `${what} shared.` : `${what} saved as “${name}” in your downloads.`,
    )
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setMessage('')
    setError('')
    try {
      const parsed = parseBackup(await file.text())
      if (parsed.kind === 'trip') {
        const name = importTripData(parsed.data)
        setMessage(`Added the trip “${name}”. Your other trips are untouched.`)
      } else if (
        confirm(
          `This backup has ${parsed.data.trips.length} trip(s). Importing it will REPLACE everything currently on this device. Continue?`,
        )
      ) {
        replaceAllData(parsed.data)
        setMessage('Backup restored.')
      }
    } catch (e) {
      setError(e instanceof BackupError ? e.message : 'Something went wrong reading that file.')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <>
      <h3>Share and back up</h3>
      <div className="card">
        <p className="muted">
          Everything is saved only on this device. A file lets you share a trip or move your plan to another device.
        </p>
        {trip && (
          <>
            <label className="inline">
              <input type="checkbox" checked={includeMoney} onChange={(e) => setIncludeMoney(e.target.checked)} />
              Include budget and expenses when sharing
            </label>
            <button
              className="primary wide"
              onClick={() => send(buildTripShare(getState(), trip.id, includeMoney), fileNameFor(trip.name), 'Trip file')}
            >
              Share this trip
            </button>
          </>
        )}
        <button className="wide" onClick={() => send(buildFullBackup(getState()), fileNameFor('backup'), 'Backup')}>
          Back up everything
        </button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="wide" onClick={() => fileInput.current?.click()}>Import a file…</button>
        {message && <p role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </>
  )
}
