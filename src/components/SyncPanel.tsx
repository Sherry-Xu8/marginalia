import { useState } from 'react'
import { buildFullBackup, fileNameFor, shareOrDownload } from '../lib/backup'
import { getSyncConfig, makeCode, syncNow, turnOffSync, turnOnSync, useSyncStatus } from '../lib/sync'
import { getState } from '../lib/store'
import { ask } from '../lib/confirm'

// Keep your phone and computer in step. Needs your own small sync service (see workers/sync).
export function SyncPanel() {
  const status = useSyncStatus()
  const cfg = getSyncConfig()
  const [url, setUrl] = useState('')
  const [code, setCode] = useState('')
  const [mode, setMode] = useState<'new' | 'join'>('new')
  const [error, setError] = useState('')
  const [showCode, setShowCode] = useState(false)

  if (!cfg) {
    return (
      <div className="card sync-card">
        <p className="muted">
          Optional. Keeps your trips the same on your phone and your computer. Your plans are scrambled on your device before they leave it, so the service only holds unreadable data.
          It needs a small free service of your own, set up once (the steps are in the <code>workers/sync</code> folder).
        </p>
        <label>
          Sync service address
          <input value={url} placeholder="https://marginalia-sync.your-name.workers.dev" onChange={(e) => { setUrl(e.target.value); setError('') }} />
        </label>
        <div className="mode-pick wide-pick" role="group" aria-label="New or existing code">
          <button className={mode === 'new' ? 'on' : ''} aria-pressed={mode === 'new'} onClick={() => { setMode('new'); setCode('') }}>Start syncing</button>
          <button className={mode === 'join' ? 'on' : ''} aria-pressed={mode === 'join'} onClick={() => { setMode('join'); setCode('') }}>I already have a code</button>
        </div>
        {mode === 'join' && (
          <label>
            Your sync code
            <input value={code} placeholder="XXXX-XXXX-XXXX-XXXX" autoCapitalize="characters" onChange={(e) => { setCode(e.target.value); setError('') }} />
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button
          className="primary wide"
          onClick={() => {
            const c = mode === 'new' ? makeCode() : code
            const problem = turnOnSync(url, c)
            if (problem) setError(problem)
            else setShowCode(true)
          }}
        >
          {mode === 'new' ? 'Create a sync code and turn on' : 'Turn on sync'}
        </button>
      </div>
    )
  }

  const when = status.at ? new Date(status.at).toLocaleString() : 'not yet'
  return (
    <div className="card sync-card">
      <p>
        <strong>
          {status.state === 'syncing' ? 'Syncing…' : status.state === 'conflict' ? 'Needs your decision' : status.state === 'error' ? 'Couldn’t sync' : 'Sync is on'}
        </strong>
        <span className="muted"> · last synced {when}</span>
      </p>
      {status.message && <p className={status.state === 'error' ? 'error' : 'note'} role="status">{status.message}</p>}

      {status.state === 'conflict' && (
        <div className="note">
          <p>
            Both this device and another have changes the other doesn’t have. Pick which copy to keep. The other one is replaced, so make a backup first if you’re not sure.
          </p>
          <div className="row buttons">
            <button onClick={() => void shareOrDownload(buildFullBackup(getState()), fileNameFor('this-device'))}>Save this device’s copy first</button>
          </div>
          <div className="row buttons">
            <button className="primary" onClick={() => ask('Replace what’s on this device with the copy from your other device?', () => void syncNow('remote'), 'Use the other copy')}>Use the other device’s copy</button>
            <button onClick={() => ask('Replace the saved copy with what’s on this device? Changes made on your other device will be lost.', () => void syncNow('local'), 'Use this device')}>Keep this device’s copy</button>
          </div>
        </div>
      )}

      <div className="row buttons">
        <button className="primary" disabled={status.state === 'syncing'} onClick={() => void syncNow()}>Sync now</button>
        <button onClick={() => setShowCode(!showCode)}>{showCode ? 'Hide code' : 'Show my code'}</button>
        <button className="danger" onClick={() => ask('Turn off sync on this device? Your trips stay here, and the saved copy stays in the cloud.', turnOffSync, 'Turn off')}>Turn off</button>
      </div>
      {showCode && (
        <>
          <p className="sync-code" aria-label="Your sync code">{cfg.code}</p>
          <p className="muted">Type this code on your other device (Settings → Sync → “I already have a code”). Keep it private: anyone with it and your service address can read your plans. If you lose it, the saved copy can’t be opened.</p>
        </>
      )}
    </div>
  )
}
