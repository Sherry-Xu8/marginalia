import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef } from 'react'
import { useAppData } from '../lib/store'

// Pin colours. In Stage 1 pins are coloured by My Maps layer;
// Stage 2 switches this to colour by category.
const PALETTE = ['#3f7d6e', '#c2693c', '#4c6fb0', '#a8508a', '#8a8a2e', '#2e8a9a', '#b04c4c', '#6b5bb0']
function colourFor(key: string): string {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function MapTab() {
  const { places, activeTripId } = useAppData()
  const mine = useMemo(() => places.filter((p) => p.tripId === activeTripId), [places, activeTripId])
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const pins = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: true }).setView([20, 0], 2)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m)
    pins.current = L.layerGroup().addTo(m)
    map.current = m
    setTimeout(() => m.invalidateSize(), 0)
    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const group = pins.current
    const m = map.current
    if (!group || !m) return
    group.clearLayers()
    for (const p of mine) {
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: colourFor(p.layer),
        fillOpacity: 0.95,
      })
      // Built from plain elements (not HTML strings) so text from a file can't inject code.
      const box = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = p.name
      box.append(title)
      if (p.description) {
        const d = document.createElement('p')
        d.textContent = p.description.length > 200 ? p.description.slice(0, 200) + '…' : p.description
        box.append(d)
      }
      const layer = document.createElement('small')
      layer.textContent = p.layer
      box.append(layer)
      marker.bindPopup(box)
      group.addLayer(marker)
    }
    if (mine.length > 0) {
      m.invalidateSize() // make sure the map knows its real size before zooming to fit
      m.fitBounds(L.latLngBounds(mine.map((p) => [p.lat, p.lon] as [number, number])), { padding: [30, 30] })
    }
  }, [mine])

  return (
    <section className="map-section">
      {mine.length === 0 && (
        <p className="muted map-note">No places yet — import a file on the Places tab to see pins here.</p>
      )}
      <div ref={el} className="map" />
    </section>
  )
}
