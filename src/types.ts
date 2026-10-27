// The shape of everything the app saves. Later stages add more fields
// (days, budget, …) — saved data from earlier stages keeps working.

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

export const TAGS = [
  'Food & drink',
  'Sightseeing',
  'Accommodation',
  'Shopping',
  'Nature & outdoors',
  'Nightlife',
  'Transport',
  'Other',
] as const
export type Tag = (typeof TAGS)[number]

export type Place = {
  id: string
  tripId: string
  name: string
  description: string
  lat: number
  lon: number
  layer: string // the original My Maps layer (folder)
  dedupeKey: string // used so re-importing never creates duplicates
  groupId?: string
  tag?: Tag // no tag = "Untagged"
  tagSource?: 'rule' | 'user' // user choices are never overwritten by automatic tagging
}

// A location group: places roughly within 30 km of each other.
export type Group = {
  id: string
  tripId: string
  name: string
  // auto = still waiting for a name lookup, geocoded = named from OpenStreetMap,
  // fallback = lookup failed (shows "Area N"), user = renamed by you
  nameSource: 'auto' | 'geocoded' | 'fallback' | 'user'
  stopId?: string // which trip stop this group belongs to
}

export type AppData = {
  version: 1
  trips: Trip[]
  places: Place[]
  groups: Group[]
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
