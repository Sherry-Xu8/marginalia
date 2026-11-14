import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { attachBaseLayer, getMapLabels } from '../lib/tiles'
import type { Place } from '../types'

// A colour per day, so you can see at a glance which day a place belongs to.
const DAY_COLOURS = ['#4a7461', '#2f6690', '#a35638', '#6b4e8f', '#1f7a6c', '#9c5d8c', '#7a6a2f', '#2d6b8a', '#8a4b4b', '#4f6b2f']
export const dayColour = (i: number) => DAY_COLOURS[i % DAY_COLOURS.length]

export type MapDay = { dayId: string; label: string; places: Place[] }

// The map beside the drafted days. Every day's places are shown in that day's colour: the day you're looking at
// has numbered pins joined by its route, the others are small dots you can tap to switch to. The places that
// didn't fit are dashed "+" pins, and tapping one adds it to the day you're on.
export function DraftMap({
  days,
  activeId,
  focusId,
  spare,
  anchor,
  onAdd,
  onPickDay,
  onPickPlace,
}: {
  days: MapDay[]
  activeId?: string
  focusId?: string // a place you tapped in the list: the map flies to it
  spare: Place[]
  anchor?: Place
  onAdd: (placeId: string) => void
  onPickDay: (dayId: string) => void
  onPickPlace?: (placeId: string) => void
}) {
  // "Day" zooms to the day you're on; "Whole trip" pulls back so every day's pins fit.
  const [fit, setFit] = useState<'day' | 'trip'>('day')
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const cb = useRef({ onAdd, onPickDay, onPickPlace })
  cb.current = { onAdd, onPickDay, onPickPlace }
  const markers = useRef(new Map<string, L.Marker>())
  const fittedTo = useRef('') // only re-frame the map when you switch day or view, not on every edit

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

  const key = [days.map((d) => `${d.dayId}:${d.places.map((p) => p.id).join('.')}`).join('|'), activeId, spare.map((p) => p.id).join(','), anchor?.id, fit].join('#')
  useEffect(() => {
    const g = layer.current
    const m = map.current
    if (!g || !m) return
    g.clearLayers()
    markers.current.clear()
    const active = days.find((d) => d.dayId === activeId) ?? days[0]

    // The other days first, so the day you're on sits on top of them.
    days.forEach((d, i) => {
      if (d.dayId === active?.dayId) return
      for (const p of d.places) {
        const icon = L.divIcon({
          className: 'num-pin other-pin',
          html: `<span style="background:${dayColour(i)}"></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        })
        L.marker([p.lat, p.lon], { icon, title: `${p.name} — ${d.label}` })
          .addTo(g)
          .on('click', () => cb.current.onPickDay(d.dayId))
      }
    })

    const colour = dayColour(Math.max(0, days.findIndex((d) => d.dayId === active?.dayId)))
    const route = [anchor, ...(active?.places ?? []), anchor].filter((p): p is Place => !!p)
    if (route.length > 1) L.polyline(route.map((p) => [p.lat, p.lon] as [number, number]), { color: colour, weight: 3, opacity: 0.7, dashArray: '6 8' }).addTo(g)
    if (anchor) {
      const icon = L.divIcon({ className: 'num-pin stay-pin', html: '<span>H</span>', iconSize: [30, 30], iconAnchor: [15, 15] })
      L.marker([anchor.lat, anchor.lon], { icon, title: anchor.name }).addTo(g)
    }
    active?.places.forEach((p, i) => {
      const icon = L.divIcon({
        className: 'num-pin',
        html: `<span style="background:${colour}">${i + 1}</span>`, // only a number and a colour go in here
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      })
      const mk = L.marker([p.lat, p.lon], { icon, title: p.name })
        .addTo(g)
        .bindTooltip(`${i + 1}. ${p.name}`, { direction: 'top', offset: [0, -14] })
        .on('click', () => cb.current.onPickPlace?.(p.id))
      markers.current.set(p.id, mk)
    })
    for (const p of spare) {
      const icon = L.divIcon({ className: 'num-pin spare-pin', html: '<span>+</span>', iconSize: [26, 26], iconAnchor: [13, 13] })
      L.marker([p.lat, p.lon], { icon, title: `${p.name} — tap to add to this day` })
        .addTo(g)
        .bindTooltip(p.name, { direction: 'top', offset: [0, -12] })
        .on('click', () => cb.current.onAdd(p.id))
    }

    // Fit to the day you're looking at (and what you could add to it), not the whole trip, or a city's worth
    // of places leaves everything in one unreadable clump. The other days stay drawn around it.
    m.invalidateSize()
    // Re-framing on every edit makes the sheet feel stuck while the map slides about, so only do it when
    // you move to another day or switch between this day and the whole trip.
    const fitKey = `${fit}|${active?.dayId ?? ''}`
    if (fitKey !== fittedTo.current) {
      fittedTo.current = fitKey
      const everything = [...days.flatMap((d) => d.places), ...spare, ...(anchor ? [anchor] : [])]
      const focus = [...(active?.places ?? []), ...spare, ...(anchor ? [anchor] : [])]
      const chosen = fit === 'trip' ? everything : focus.length > 0 ? focus : everything
      const pts = chosen.map((p) => [p.lat, p.lon] as [number, number])
      if (pts.length > 0) m.fitBounds(L.latLngBounds(pts), { padding: [34, 34], maxZoom: fit === 'trip' ? 15 : 16 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Tapping a place in the list brings it into view.
  useEffect(() => {
    const m = map.current
    markers.current.forEach((mk, id) => mk.getElement()?.classList.toggle('focus', id === focusId))
    if (!m || !focusId) return
    const mk = markers.current.get(focusId)
    if (mk) {
      m.invalidateSize()
      m.flyTo(mk.getLatLng(), Math.max(m.getZoom(), 16), { duration: 0.6 })
    }
  }, [focusId])

  return (
    <div className="draft-map-wrap">
      <div ref={el} className="draft-map" role="region" aria-label="Map of the drafted days" />
      <div className="fit-pick" role="group" aria-label="What the map shows">
        <button className={fit === 'day' ? 'on' : ''} aria-pressed={fit === 'day'} onClick={() => setFit('day')}>This day</button>
        <button className={fit === 'trip' ? 'on' : ''} aria-pressed={fit === 'trip'} onClick={() => setFit('trip')}>Whole trip</button>
      </div>
    </div>
  )
}
