import JSZip from 'jszip'

export type ParsedPlace = {
  name: string
  description: string
  lat: number
  lon: number
  layer: string
}

export type ParseResult = {
  mapName: string // the name of the map inside the file (used to recognise a re-import of the same map)
  places: ParsedPlace[]
  noLocation: number // placemarks that are lines/areas, not single points
}

// Errors carry a message that is safe to show to the user as-is.
export class ImportError extends Error {}

const NOT_A_MAP =
  "That doesn't look like a Google My Maps export. Please choose a .kml or .kmz file."
const UNREADABLE =
  "We couldn't read that file. It may be damaged or not a map export. Try exporting it from My Maps again (menu → Export to KML/KMZ)."

export async function readMapFile(file: File): Promise<ParseResult> {
  const lower = file.name.toLowerCase()
  let text: string
  try {
    if (lower.endsWith('.kmz')) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      const entry = zip.file('doc.kml') ?? zip.file(/\.kml$/i)[0]
      if (!entry) throw new ImportError('That KMZ file has no map data inside it.')
      text = await entry.async('string')
    } else if (lower.endsWith('.kml')) {
      text = await file.text()
    } else {
      throw new ImportError(NOT_A_MAP)
    }
  } catch (e) {
    if (e instanceof ImportError) throw e
    throw new ImportError(UNREADABLE)
  }
  return parseKml(text)
}

function childText(el: Element, tag: string): string {
  for (const c of Array.from(el.children)) {
    if (c.localName === tag) return c.textContent?.trim() ?? ''
  }
  return ''
}

// My Maps descriptions are often small bits of HTML; keep just the text.
function htmlToText(html: string): string {
  if (!html) return ''
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n')
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html')
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

function layerOf(pm: Element, fallback: string): string {
  let node = pm.parentElement
  while (node) {
    if (node.localName === 'Folder') return childText(node, 'name') || fallback
    node = node.parentElement
  }
  return fallback
}

function pointOf(pm: Element): { lat: number; lon: number } | null {
  const point = pm.getElementsByTagName('Point')[0]
  const coords = point?.getElementsByTagName('coordinates')[0]?.textContent
  if (!coords) return null
  const [lon, lat] = coords.trim().split(/[,\s]+/).map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

export function parseKml(text: string): ParseResult {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new ImportError(UNREADABLE)
  }
  if (doc.documentElement.localName !== 'kml') throw new ImportError(NOT_A_MAP)

  const docEl = doc.getElementsByTagName('Document')[0]
  const docName = (docEl && childText(docEl, 'name')) || 'Imported places'

  const places: ParsedPlace[] = []
  let noLocation = 0
  for (const pm of Array.from(doc.getElementsByTagName('Placemark'))) {
    const pt = pointOf(pm)
    if (!pt) {
      noLocation++
      continue
    }
    places.push({
      name: childText(pm, 'name') || 'Unnamed place',
      description: htmlToText(childText(pm, 'description')),
      lat: pt.lat,
      lon: pt.lon,
      layer: layerOf(pm, docName),
    })
  }
  return { mapName: docName, places, noLocation }
}
