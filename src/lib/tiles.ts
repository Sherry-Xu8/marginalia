import L from 'leaflet'

// Which map picture to draw.
//  "english": Esri's street map, which labels places in English (plus the local script).
//            Esri has no detailed map data for South Korea (a Korean legal restriction), so
//            when you zoom in there the map switches to OpenStreetMap, which is in Korean.
//  "local":   OpenStreetMap everywhere, labelled in each place's own language.
export type MapLabels = 'english' | 'local'
const KEY = 'map-labels'

export function getMapLabels(): MapLabels {
  try {
    return localStorage.getItem(KEY) === 'local' ? 'local' : 'english'
  } catch {
    return 'english'
  }
}

export function setMapLabels(v: MapLabels) {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    // not saved — fine
  }
}

const osmLayer = () =>
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  })

const esriLayer = () =>
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors',
  })

// Where Esri's English map runs out of detail, and from which zoom level.
const ESRI_GAPS = [{ box: L.latLngBounds([33, 124.5], [38.8, 131.9]), fromZoom: 13 }] // South Korea

// Which server draws a given tile, and its address. Used for saving maps for offline use.
export type TileProvider = 'osm' | 'esri'
export function providerFor(zoom: number, lat: number, lon: number, labels: MapLabels): TileProvider {
  if (labels === 'local') return 'osm'
  return ESRI_GAPS.some((g) => zoom >= g.fromZoom && g.box.contains([lat, lon])) ? 'osm' : 'esri'
}
export const tileUrl = (p: TileProvider, z: number, x: number, y: number): string =>
  p === 'osm' ? `https://tile.openstreetmap.org/${z}/${x}/${y}.png` : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`
export const tileCacheName = (p: TileProvider): string => (p === 'osm' ? 'osm-tiles' : 'esri-tiles')

// Puts the right base map on `map` and keeps it right as you pan and zoom.
// Call the returned function to remove it. The map must already have a view set.
export function attachBaseLayer(map: L.Map, labels: MapLabels): () => void {
  let current: L.TileLayer | null = null
  let kind = ''
  const wanted = () => {
    if (labels === 'local') return 'osm'
    const gap = ESRI_GAPS.some((g) => map.getZoom() >= g.fromZoom && g.box.contains(map.getCenter()))
    return gap ? 'osm' : 'esri'
  }
  const apply = () => {
    const w = wanted()
    if (w === kind) return
    current?.remove()
    current = (w === 'osm' ? osmLayer() : esriLayer()).addTo(map)
    current.bringToBack()
    kind = w
  }
  map.on('zoomend moveend', apply)
  apply()
  return () => {
    map.off('zoomend moveend', apply)
    current?.remove()
  }
}
