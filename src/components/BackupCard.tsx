import { useRef, useState } from 'react'
import { BackupError, buildFullBackup, buildTripShare, fileNameFor, parseBackup, shareOrDownload } from '../lib/backup'
import { buildShareLink, canMakeLinks, qrFor } from '../lib/sharelink'
import { markBackedUp } from '../lib/backupState'
import { getState, importTripData, replaceAllData } from '../lib/store'
import type { Trip } from '../types'
import { ask } from '../lib/confirm'

export function BackupCard({ trip }: { trip?: Trip }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [includeMoney, setIncludeMoney] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [link, setLink] = useState<{ url: string; qr: string | null } | null>(null)
  const [linkMsg, setLinkMsg] = useState('')

  async function makeLink() {
    if (!trip) return
    setLinkMsg('')
    try {
      const url = await buildShareLink(getState(), trip.id)
      setLink({ url, qr: qrFor(url) })
    } catch (e) {
      setLinkMsg(e instanceof BackupError ? e.message : 'Couldn’t make a link on this device. Share the file instead.')
    }
  }
  async function copyLink() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setLinkMsg('Link copied.')
    } catch {
      setLinkMsg('Couldn’t copy automatically. Select the link and copy it.')
    }
  }

  async function send(json: string, name: string, what: string) {
    setError('')
    const result = await shareOrDownload(json, name)
    if (result !== 'cancelled' && what === 'Backup') markBackedUp()
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
      } else {
        const data = parsed.data
        ask(
          `This backup has ${data.trips.length} trip(s). Importing it will REPLACE everything currently on this device. Continue?`,
          () => {
            replaceAllData(data)
            setMessage('Backup restored.')
          },
          'Replace everything',
        )
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
        {trip && canMakeLinks() && (
          <div className="share-link">
            <strong>Share a read-only link</strong>
            <p className="muted">
              Anyone with the link can read your plan (places you’ve scheduled, stays, journeys and notes) and save their own copy. No money or photos are included. The trip is inside the link itself, so nothing is uploaded.
            </p>
            {!link ? (
              <button className="wide" onClick={makeLink}>Create a link</button>
            ) : (
              <>
                <input readOnly value={link.url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
                <div className="row buttons">
                  <button className="primary" onClick={copyLink}>Copy link</button>
                  {'share' in navigator && <button onClick={() => void navigator.share({ title: trip.name, url: link.url }).catch(() => {})}>Share…</button>}
                </div>
                {link.url.length > 6000 && <p className="note">This is a long link. Some chat apps may cut it off. If it doesn’t open, send the trip file instead.</p>}
                {location.hostname === 'localhost' && <p className="note">You’re on a test address, so this link only works on this computer. Create it from your published site.</p>}
                {link.qr ? <img className="qr" src={link.qr} alt="QR code for the share link" width={180} height={180} /> : <p className="muted">This trip is too big for a QR code. Use the link instead.</p>}
              </>
            )}
            {linkMsg && <p role="status">{linkMsg}</p>}
          </div>
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
