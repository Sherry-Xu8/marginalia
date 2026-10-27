import L from 'leaflet'

// Which map picture to draw. "English" uses Esri's street map, which labels places in English
// (plus the local script); "local" is OpenStreetMap, which labels in the local language only.
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

export function baseLayer(labels: MapLabels): L.TileLayer {
  if (labels === 'local') {
    return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
  }
  return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors',
  })
}
