// The shape of everything the app saves. Later stages add more fields
// (days, budget, …) — saved data from earlier stages keeps working.

export type Stop = {
  id: string
  name: string
  arrival: string // yyyy-mm-dd
  departure: string // yyyy-mm-dd
  stayPlaceId?: string // where you're sleeping in this stop (a place tagged Accommodation)
  coverUrl?: string // a photo of the city, found automatically
  coverCheckedAt?: string // when we last looked for one
}

export const TRANSFER_KINDS = ['flight', 'train', 'bus', 'ferry', 'car', 'other'] as const
export type TransferKind = (typeof TRANSFER_KINDS)[number]

// A flight, train or other journey, usually between cities.
export type Transfer = {
  id: string
  tripId: string
  date: string // yyyy-mm-dd, the day you set off
  kind: TransferKind
  title: string // e.g. "KE 123" or "KTX to Busan"
  from: string
  to: string
  departTime?: string
  arriveTime?: string
  reference?: string // booking reference
  note?: string
  cost?: number
}

export type ChecklistItem = {
  id: string
  section: 'pre' | 'packing' // "before you go" or "packing"
  text: string
  done: boolean
}

export type Trip = {
  id: string
  name: string
  startDate: string
  endDate: string
  stops: Stop[]
  checklist: ChecklistItem[]
  budget?: number // total trip budget, in `currency`
  currency?: string // e.g. "USD", "KRW"
}

export const EXPENSE_CATEGORIES = ['Food & drink', 'Transport', 'Accommodation', 'Activities', 'Shopping', 'Other'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

// Money actually spent during the trip.
export type Expense = {
  id: string
  tripId: string
  date: string // yyyy-mm-dd
  title: string
  amount: number
  category: ExpenseCategory
}

// One planned visit in a day.
export type DayItem = {
  id: string
  placeId: string
  time?: string // "HH:MM", optional
  note: string // e.g. opening hours
  done: boolean
  cost?: number // planned cost, optional
}

// A day of the trip. Days are created automatically for every date of the trip.
export type Day = {
  id: string
  tripId: string
  date: string // yyyy-mm-dd
  items: DayItem[] // in the order you'll visit them
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

// Extra information about a place, looked up online or typed in.
export type PlaceDetails = {
  summary?: string
  website?: string
  hours?: string
  phone?: string
  cuisine?: string
  imageUrl?: string // a photo from Wikipedia/Wikimedia, if one exists
  source?: string
}

export type Place = {
  id: string
  tripId: string
  name: string
  details?: PlaceDetails
  photos?: string[] // your own photos (small, saved inside the app)
  lookup?: 'found' | 'partial' | 'none' // result of the automatic online lookup
  lookedUpAt?: string
  originalName?: string // set once you rename a place, so you can undo
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
  days: Day[]
  transfers: Transfer[]
  expenses: Expense[]
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
