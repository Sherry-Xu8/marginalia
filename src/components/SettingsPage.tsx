import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { isAutoLookupOn, setAutoLookup } from '../lib/autolookup'
import { getFlightService, setFlightService } from '../lib/flights'
import { setTheme, useTheme } from '../lib/theme'
import { BackupCard } from './BackupCard'
import { OfflineMapsPanel } from './OfflineMapsPanel'
import { SyncPanel } from './SyncPanel'

function FlightServiceSetting() {
  const [value, setValue] = useState(getFlightService)
  const [msg, setMsg] = useState('')
  return (
    <div className="card">
      <strong>Flight times service (optional)</strong>
      <p className="muted">
        Paste the address of your flight-lookup service to fill in times when you add a flight. Leave it empty to switch it off.
        Saved on this device only.
      </p>
      <div className="row">
        <input value={value} placeholder="https://marginalia-flights.your-name.workers.dev" onChange={(e) => { setValue(e.target.value); setMsg('') }} aria-label="Flight service address" />
        <button
          onClick={() => setMsg(setFlightService(value) ? (value.trim() ? 'Saved.' : 'Switched off.') : 'That needs to be a secure address starting with https://')}
        >
          Save
        </button>
      </div>
      {msg && <p className="muted" role="status">{msg}</p>}
    </div>
  )
}

function ThemePicker() {
  const theme = useTheme()
  return (
    <div className="card">
      <strong>Appearance</strong>
      <div className="mode-pick wide-pick" role="group" aria-label="Appearance">
        {([['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']] as const).map(([v, l]) => (
          <button key={v} className={theme === v ? 'on' : ''} aria-pressed={theme === v} onClick={() => setTheme(v)}>{l}</button>
        ))}
      </div>
    </div>
  )
}

function AutoLookupToggle() {
  const [on, setOn] = useState(isAutoLookupOn)
  return (
    <label className="card inline">
      <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); setAutoLookup(e.target.checked) }} />
      <span>
        Look up photos and details for my places automatically
        <small className="muted" style={{ display: 'block' }}>
          Sends each place’s name and location to OpenStreetMap and Wikipedia. Turn off to keep everything on this device.
        </small>
      </span>
    </label>
  )
}


// Everything that belongs to the app rather than to one trip.
export function SettingsPage() {
  return (
    <div className="page settings-page">
      <a className="back" href="#/"><ArrowLeft size={18} /> Back</a>
      <header className="page-head">
        <div>
          <p className="eyebrow">Marginalia</p>
          <h1 className="display">Settings</h1>
        </div>
      </header>

      <h3>Appearance</h3>
      <ThemePicker />

      <h3>Sync between devices</h3>
      <SyncPanel />

      <h3>Backup and restore</h3>
      <BackupCard />

      <h3>Offline maps</h3>
      <OfflineMapsPanel />

      <h3>Photos and details</h3>
      <AutoLookupToggle />

      <h3>Flight times</h3>
      <FlightServiceSetting />

      <h3>Using Marginalia on your phone</h3>
      <div className="card">
        <p>Open your site’s address in Safari (iPhone) or Chrome (Android), then choose <strong>Add to Home Screen</strong> from the share or menu button. It opens like an app and works offline after the first visit.</p>
        <p className="muted">Your trips are saved on each device separately. Use a backup file or the sync option to move them. On an iPhone, installing to the Home Screen also stops the browser from clearing your data after a week of not opening it.</p>
      </div>
    </div>
  )
}
