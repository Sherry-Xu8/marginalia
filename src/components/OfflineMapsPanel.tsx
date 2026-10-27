import { Download, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { canSaveOffline, downloadMap, planFor, removeMap, savedMaps, stopPoints } from '../lib/offline'
import { useAppData } from '../lib/store'

// Save the map around each stop, so it still shows with no signal.
export function OfflineMapsPanel() {
  const data = useAppData()
  const [saved, setSaved] = useState(savedMaps)
  const [busy, setBusy] = useState<{ id: string; done: number; total: number } | null>(null)
  const [note, setNote] = useState('')
  const abort = useRef<AbortController | null>(null)

  if (!canSaveOffline()) {
    return <div className="card"><p className="muted">Saving maps needs the installed app or a secure (https) address. Open your published site to use it.</p></div>
  }
  const trips = data.trips.filter((t) => t.stops.length > 0)
  if (trips.length === 0) {
    return <div className="card"><p className="muted">Add a stop to a trip first. Then you can save its map here.</p></div>
  }

  async function save(stopId: string, plan: ReturnType<typeof planFor>) {
    abort.current = new AbortController()
    setNote('')
    setBusy({ id: stopId, done: 0, total: plan.tiles.length })
    const r = await downloadMap(stopId, plan, (done, total) => setBusy({ id: stopId, done, total }), abort.current.signal)
    setBusy(null)
    setSaved(savedMaps())
    setNote(abort.current.signal.aborted ? 'Stopped.' : r.failed > 0 ? `Saved most of it (${r.failed} pieces couldn’t be fetched). Try again with a better connection.` : 'Saved. This map now works offline.')
  }

  return (
    <div className="card offline-card">
      <p className="muted">
        Saves the map around each stop on this device, from the free map servers (about 20 KB a piece). Do it on Wi-Fi before you travel. It’s a modest area around your saved places, with street detail close to each one.
      </p>
      {trips.map((trip) => (
        <div key={trip.id}>
          <strong>{trip.name}</strong>
          {trip.stops.map((stop) => {
            const plan = planFor(stopPoints(stop, trip, data))
            const info = saved[stop.id]
            const working = busy?.id === stop.id
            return (
              <div key={stop.id} className="line offline-line">
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {stop.name}
                  <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                    {plan.tiles.length === 0
                      ? 'No places linked to this stop yet'
                      : working
                        ? `Saving… ${busy!.done} of ${busy!.total}`
                        : info
                          ? `Saved ${new Date(info.at).toLocaleDateString()} · ${info.tiles} pieces`
                          : `About ${Math.max(1, plan.megabytes)} MB · ${plan.tiles.length} pieces`}
                  </span>
                  {working && <progress max={busy!.total} value={busy!.done} style={{ width: '100%' }} />}
                </span>
                {working ? (
                  <button onClick={() => abort.current?.abort()}>Stop</button>
                ) : info ? (
                  <button aria-label={`Remove saved map for ${stop.name}`} onClick={async () => { await removeMap(stop.id, plan); setSaved(savedMaps()) }}><Trash2 size={16} /></button>
                ) : (
                  <button disabled={plan.tiles.length === 0 || !!busy} onClick={() => save(stop.id, plan)}><Download size={16} /> Save</button>
                )}
              </div>
            )
          })}
        </div>
      ))}
      {note && <p role="status">{note}</p>}
    </div>
  )
}
