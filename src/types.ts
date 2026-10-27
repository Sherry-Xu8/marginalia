// The shape of everything the app saves. Later stages add more fields
// (groups, tags, days) — optional ones are already here so saved data
// from Stage 1 keeps working.

export type Stop = {
  id: string
  name: string
  arrival: string // yyyy-mm-dd
  departure: string // yyyy-mm-dd
}

export type Trip = {
  id: string
  name: string
  startDate: string
  endDate: string
  stops: Stop[]
}

export type Place = {
  id: string
  tripId: string
  name: string
  description: string
  lat: number
  lon: number
  layer: string // the original My Maps layer (folder)
  dedupeKey: string // used so re-importing never creates duplicates
  groupId?: string // Stage 2
  tag?: string // Stage 2
}

export type AppData = {
  version: 1
  trips: Trip[]
  places: Place[]
  activeTripId: string | null
}

export type ImportSummary = {
  fileName: string
  found: number
  added: number
  duplicates: number
  noLocation: number
  layers: { name: string; count: number }[]
}
