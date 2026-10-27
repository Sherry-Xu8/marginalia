import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { Place } from '../types'

// A small map of one day: numbered pins joined by a line in visiting order.
export function DayMap({ places }: { places: Place[] }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: false }).setView([20, 0], 2)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    setTimeout(() => m.invalidateSize(), 0)
    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const g = layer.current
    const m = map.current
    if (!g || !m) return
    g.clearLayers()
    const pts = places.map((p) => [p.lat, p.lon] as [number, number])
    if (pts.length > 1) L.polyline(pts, { color: '#B5532E', weight: 3, opacity: 0.6, dashArray: '6 6' }).addTo(g)
    places.forEach((p, i) => {
      const icon = L.divIcon({
        className: 'num-pin',
        html: `<span>${i + 1}</span>`, // only a number goes in here, never text from a file
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })
      L.marker([p.lat, p.lon], { icon, title: p.name }).addTo(g)
    })
    m.invalidateSize()
    if (pts.length > 0) m.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 15 })
  }, [places])

  return <div ref={el} className="day-map" role="region" aria-label="Map of this day" />
}
