import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { attachBaseLayer, getMapLabels } from '../lib/tiles'
import type { Place } from '../types'

// A map of one day: numbered pins joined by a line in visiting order, with your accommodation
// (H) at the start and end. Choosing a place in the list zooms the map to it.
export function DayMap({
  places,
  startStay,
  endStay,
  gateways = [],
  focusId,
  onFocus,
}: {
  places: Place[]
  startStay?: Place
  endStay?: Place
  gateways?: Place[] // airports and stations the day's journeys leave from or arrive at
  focusId?: string
  onFocus?: (id: string) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const markers = useRef(new Map<string, L.Marker>())
  const focusRef = useRef(focusId)
  const onFocusRef = useRef(onFocus)
  focusRef.current = focusId
  onFocusRef.current = onFocus

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

  // Redraw the pins and route whenever the day's places change.
  useEffect(() => {
    const g = layer.current
    const m = map.current
    if (!g || !m) return
    g.clearLayers()
    markers.current.clear()
    const route: Place[] = [startStay, ...places, endStay].filter((p): p is Place => !!p)
    const pts = [...route, ...gateways].map((p) => [p.lat, p.lon] as [number, number])
    const line = route.map((p) => [p.lat, p.lon] as [number, number])
    if (line.length > 1) L.polyline(line, { color: '#4a7461', weight: 3, opacity: 0.6, dashArray: '6 8' }).addTo(g)

    const stays = [...new Map([startStay, endStay].filter((p): p is Place => !!p).map((p) => [p.id, p])).values()]
    for (const p of stays) {
      const icon = L.divIcon({ className: 'num-pin stay-pin', html: '<span>H</span>', iconSize: [30, 30], iconAnchor: [15, 15] })
      L.marker([p.lat, p.lon], { icon, title: p.name }).addTo(g)
    }
    for (const p of gateways) {
      const icon = L.divIcon({ className: 'num-pin stay-pin', html: '<span>✈</span>', iconSize: [30, 30], iconAnchor: [15, 15] })
      L.marker([p.lat, p.lon], { icon, title: p.name }).addTo(g)
    }
    places.forEach((p, i) => {
      const icon = L.divIcon({
        className: 'num-pin' + (p.id === focusRef.current ? ' focus' : ''),
        html: `<span>${i + 1}</span>`, // only a number goes in here, never text from a file
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      })
      const marker = L.marker([p.lat, p.lon], { icon, title: p.name }).addTo(g)
      marker.on('click', () => onFocusRef.current?.(p.id))
      markers.current.set(p.id, marker)
    })
    m.invalidateSize()
    if (pts.length > 0) m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 })
  }, [places, startStay, endStay, gateways.map((p) => p.id).join(',')])

  // Zoom to the place you picked.
  useEffect(() => {
    const m = map.current
    markers.current.forEach((marker, id) => marker.getElement()?.classList.toggle('focus', id === focusId))
    if (!m || !focusId) return
    const marker = markers.current.get(focusId)
    if (marker) {
      m.invalidateSize()
      m.flyTo(marker.getLatLng(), Math.max(m.getZoom(), 16), { duration: 0.7 })
    }
  }, [focusId])

  return <div ref={el} className="day-map" role="region" aria-label="Map of this day" />
}
