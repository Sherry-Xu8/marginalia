import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { attachBaseLayer, getMapLabels } from '../lib/tiles'

// Tap the map to say exactly where something is.
export function PinPicker({
  center,
  onPick,
  onCancel,
}: {
  center?: { lat: number; lon: number }
  onPick: (lat: number, lon: number) => void
  onCancel: () => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const [spot, setSpot] = useState<{ lat: number; lon: number } | null>(null)

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: true }).setView(center ? [center.lat, center.lon] : [20, 0], center ? 16 : 2)
    const detach = attachBaseLayer(m, getMapLabels())
    let marker: L.CircleMarker | null = null
    m.on('click', (e: L.LeafletMouseEvent) => {
      marker?.remove()
      marker = L.circleMarker(e.latlng, { radius: 11, color: '#fff', weight: 3, fillColor: '#c2582f', fillOpacity: 1 }).addTo(m)
      setSpot({ lat: e.latlng.lat, lon: e.latlng.lng })
    })
    setTimeout(() => m.invalidateSize(), 0)
    return () => {
      detach()
      m.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="pin-picker">
      <p className="muted">{spot ? 'Move the pin by tapping somewhere else, or confirm it.' : 'Tap the map where it is. Zoom in for a precise spot.'}</p>
      <div ref={el} className="pin-map" />
      <div className="row buttons">
        <button className="primary" disabled={!spot} onClick={() => spot && onPick(spot.lat, spot.lon)}>Use this spot</button>
        <button onClick={onCancel}>Back</button>
      </div>
    </div>
  )
}
