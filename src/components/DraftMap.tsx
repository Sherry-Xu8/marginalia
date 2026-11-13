import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { attachBaseLayer, getMapLabels } from '../lib/tiles'
import type { Place } from '../types'

// The map beside a drafted day: numbered pins in visiting order joined by a line, the accommodation (H)
// at each end, and the places that didn't fit shown faded. Tapping a faded pin adds it to the day.
export function DraftMap({
  places,
  spare,
  anchor,
  onAdd,
}: {
  places: Place[]
  spare: Place[]
  anchor?: Place
  onAdd: (placeId: string) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const onAddRef = useRef(onAdd)
  onAddRef.current = onAdd

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: false }).setView([20, 0], 2)
    const detach = attachBaseLayer(m, getMapLabels())
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    setTimeout(() => m.invalidateSize(), 0)
    return () => {
      detach()
      m.remove()
      map.current = null
    }
  }, [])

  const key = [places.map((p) => p.id).join(','), spare.map((p) => p.id).join(','), anchor?.id].join('|')
  useEffect(() => {
    const g = layer.current
    const m = map.current
    if (!g || !m) return
    g.clearLayers()
    const route = [anchor, ...places, anchor].filter((p): p is Place => !!p)
    const line = route.map((p) => [p.lat, p.lon] as [number, number])
    if (line.length > 1) L.polyline(line, { color: '#4a7461', weight: 3, opacity: 0.6, dashArray: '6 8' }).addTo(g)

    if (anchor) {
      const icon = L.divIcon({ className: 'num-pin stay-pin', html: '<span>H</span>', iconSize: [30, 30], iconAnchor: [15, 15] })
      L.marker([anchor.lat, anchor.lon], { icon, title: anchor.name }).addTo(g)
    }
    places.forEach((p, i) => {
      const icon = L.divIcon({ className: 'num-pin', html: `<span>${i + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] })
      L.marker([p.lat, p.lon], { icon, title: p.name }).addTo(g)
    })
    // The ones that didn't fit: faded, and a tap puts them on this day.
    for (const p of spare) {
      const icon = L.divIcon({ className: 'num-pin spare-pin', html: '<span>+</span>', iconSize: [26, 26], iconAnchor: [13, 13] })
      const marker = L.marker([p.lat, p.lon], { icon, title: `${p.name} — tap to add to this day` }).addTo(g)
      marker.bindTooltip(p.name, { direction: 'top', offset: [0, -12] })
      marker.on('click', () => onAddRef.current(p.id))
    }

    const pts = [...route, ...spare].map((p) => [p.lat, p.lon] as [number, number])
    m.invalidateSize()
    if (pts.length > 0) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return <div ref={el} className="draft-map" role="region" aria-label="Map of this day" />
}
