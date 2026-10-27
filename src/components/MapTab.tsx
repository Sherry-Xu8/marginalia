import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppData } from '../lib/store'
import { TAG_STYLE } from '../lib/tagging'
import { FilterChips, tagOf } from './FilterChips'

export function MapTab({ tagFilter, setTagFilter }: { tagFilter: string[]; setTagFilter: (v: string[]) => void }) {
  const { places, groups, activeTripId } = useAppData()
  const [groupId, setGroupId] = useState('all')
  const mine = useMemo(() => places.filter((p) => p.tripId === activeTripId), [places, activeTripId])
  const myGroups = useMemo(() => groups.filter((g) => g.tripId === activeTripId), [groups, activeTripId])
  const visible = useMemo(
    () =>
      mine.filter(
        (p) => (tagFilter.length === 0 || tagFilter.includes(tagOf(p))) && (groupId === 'all' || p.groupId === groupId),
      ),
    [mine, tagFilter, groupId],
  )
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
    for (const p of visible) {
      const tag = tagOf(p)
      const style = TAG_STYLE[tag as keyof typeof TAG_STYLE]
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 10,
        color: '#fff',
        weight: 2,
        fillColor: style.colour,
        fillOpacity: 0.95,
      })
      // Built from plain elements (not HTML strings) so text from a file can't inject code.
      const box = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = p.name
      box.append(title)
      const tagLine = document.createElement('div')
      tagLine.textContent = `${style.emoji} ${tag}`
      box.append(tagLine)
      if (p.description) {
        const d = document.createElement('p')
        d.textContent = p.description.length > 200 ? p.description.slice(0, 200) + '…' : p.description
        box.append(d)
      }
      marker.bindPopup(box)
      group.addLayer(marker)
    }
    if (visible.length > 0) {
      m.invalidateSize() // make sure the map knows its real size before zooming to fit
      m.fitBounds(L.latLngBounds(visible.map((p) => [p.lat, p.lon] as [number, number])), { padding: [30, 30], maxZoom: 16 })
    }
  }, [visible])

  return (
    <section className="map-section">
      <div className="map-bar">
        {mine.length > 0 && <FilterChips places={mine} value={tagFilter} onChange={setTagFilter} />}
        {myGroups.length > 1 && (
          <select aria-label="Show area" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="all">All areas</option>
            {myGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
        {mine.length === 0 && <p className="muted">No places yet — import a file on the Places tab to see pins here.</p>}
      </div>
      <div ref={el} className="map" />
    </section>
  )
}
