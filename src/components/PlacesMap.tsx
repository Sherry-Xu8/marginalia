import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { fromISO, stopsOn } from '../lib/days'
import { addToDay, getState } from '../lib/store'
import { TAG_STYLE } from '../lib/tagging'
import { attachBaseLayer, getMapLabels, setMapLabels, type MapLabels } from '../lib/tiles'
import type { Place } from '../types'
import { tagOf } from './FilterChips'

// The popup shown when you tap a pin. Built when it opens (so the day list is current)
// from plain elements, not HTML strings, so text from a file can't inject code.
function buildPopup(p: Place): HTMLElement {
  const style = TAG_STYLE[tagOf(p) as keyof typeof TAG_STYLE]
  const box = document.createElement('div')
  box.className = 'popup'
  const title = document.createElement('strong')
  title.textContent = p.name
  const tagLine = document.createElement('div')
  tagLine.textContent = tagOf(p)
  tagLine.className = 'popup-tag'
  tagLine.style.color = style.ink
  box.append(title, tagLine)
  if (p.description) {
    const d = document.createElement('p')
    d.textContent = p.description.length > 200 ? p.description.slice(0, 200) + '…' : p.description
    box.append(d)
  }

  const s = getState()
  const trip = s.trips.find((t) => t.id === p.tripId)
  const days = s.days.filter((d) => d.tripId === p.tripId).sort((a, b) => a.date.localeCompare(b.date))
  if (trip && days.length > 0) {
    const select = document.createElement('select')
    days.forEach((d, i) => {
      const o = document.createElement('option')
      o.value = d.id
      o.textContent = `Day ${i + 1} · ${fromISO(d.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
      select.append(o)
    })
    // Pre-select the first day whose stop is this place's area.
    const group = s.groups.find((g) => g.id === p.groupId)
    const match = days.find((d) => group?.stopId && stopsOn(trip, d.date).some((st) => st.id === group.stopId))
    if (match) select.value = match.id
    const button = document.createElement('button')
    button.className = 'primary'
    button.textContent = 'Add to day'
    button.onclick = () => {
      button.textContent = addToDay(select.value, p.id) ? 'Added ✓' : 'Already on that day'
    }
    box.append(select, button)
  }
  return box
}

// The map of your saved places. Picking a place in the list zooms here; tapping a pin picks it in the list.
export function PlacesMap({
  places,
  focusId,
  onFocus,
  visible,
}: {
  places: Place[]
  focusId?: string
  onFocus?: (id: string) => void
  visible: boolean
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const pins = useRef<L.LayerGroup | null>(null)
  const markers = useRef(new Map<string, L.CircleMarker>())
  const detachTiles = useRef<(() => void) | null>(null)
  const onFocusRef = useRef(onFocus)
  onFocusRef.current = onFocus
  const [labels, setLabels] = useState<MapLabels>(getMapLabels)

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: true }).setView([20, 0], 2)
    pins.current = L.layerGroup().addTo(m)
    map.current = m
    detachTiles.current = attachBaseLayer(m, getMapLabels())
    setTimeout(() => m.invalidateSize(), 0)
    return () => {
      detachTiles.current?.()
      m.remove()
      map.current = null
    }
  }, [])

  // Switching label language swaps the map pictures underneath the pins.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const m = map.current
    if (!m) return
    detachTiles.current?.()
    detachTiles.current = attachBaseLayer(m, labels)
    setMapLabels(labels)
  }, [labels])

  const fit = (list: Place[]) => {
    const m = map.current
    if (!m || list.length === 0) return
    m.invalidateSize()
    m.fitBounds(L.latLngBounds(list.map((p) => [p.lat, p.lon] as [number, number])), { padding: [40, 40], maxZoom: 16 })
  }

  // Redraw the pins when the places change.
  useEffect(() => {
    const group = pins.current
    if (!group) return
    group.clearLayers()
    markers.current.clear()
    for (const p of places) {
      const style = TAG_STYLE[tagOf(p) as keyof typeof TAG_STYLE]
      const marker = L.circleMarker([p.lat, p.lon], { radius: 9, color: '#fff', weight: 2, fillColor: style.colour, fillOpacity: 0.95 })
      marker.bindPopup(() => buildPopup(p))
      marker.on('click', () => onFocusRef.current?.(p.id))
      group.addLayer(marker)
      markers.current.set(p.id, marker)
    }
    fit(places)
  }, [places])

  // When the map becomes visible (phone: switching to Map), make sure it is sized and framed.
  useEffect(() => {
    if (visible) setTimeout(() => (focusId ? undefined : fit(places)), 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // Zoom to the place you picked.
  useEffect(() => {
    markers.current.forEach((marker, id) => {
      const focused = id === focusId
      marker.setStyle({ radius: focused ? 13 : 9, weight: focused ? 4 : 2, color: focused ? '#2f5646' : '#fff' })
      if (focused) marker.bringToFront()
    })
    const m = map.current
    const marker = focusId ? markers.current.get(focusId) : undefined
    if (m && marker) {
      setTimeout(() => {
        m.invalidateSize()
        m.flyTo(marker.getLatLng(), Math.max(m.getZoom(), 15), { duration: 0.7 })
        marker.openPopup()
      }, 40)
    }
  }, [focusId])

  return (
    <div className="places-map-wrap">
      <div ref={el} className="places-map-canvas" role="region" aria-label="Map of your saved places" />
      <div className="map-labels" role="group" aria-label="Map labels">
        <button className={labels === 'english' ? 'on' : ''} onClick={() => setLabels('english')}>English</button>
        <button className={labels === 'local' ? 'on' : ''} onClick={() => setLabels('local')}>Local</button>
      </div>
    </div>
  )
}
