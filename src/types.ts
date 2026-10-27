// The shape of everything the app saves. Later stages add more fields
// (days, budget, …) — saved data from earlier stages keeps working.

export type Stop = {
  id: string
  name: string
  arrival: string // yyyy-mm-dd
  departure: string // yyyy-mm-dd
  coverUrl?: string // a photo of the city, found automatically
  coverCheckedAt?: string // when we last looked for one
  coverV?: number // which version of the lookup checked (so improvements can retry earlier misses)
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

// A booked place to sleep: a hotel, hostel or apartment for a run of nights.
export type Stay = {
  id: string
  placeId: string // the place on the map (tagged Accommodation)
  checkIn: string // yyyy-mm-dd
  checkOut: string // yyyy-mm-dd, the morning you leave (the last night is the night before)
  cost?: number // total for the whole stay, in the trip's currency
  reference?: string // booking reference
  note?: string
}

// A handy note: a hotel address to show a taxi driver, Wi-Fi code, emergency numbers…
export type Note = { id: string; title: string; text: string }

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
  coverUrl?: string // a photo of the place, used when the trip has no stops (e.g. a trip called "Lisbon")
  coverCheckedAt?: string
  coverV?: number
  stops: Stop[]
  stays?: Stay[]
  notes?: Note[]
  checklist: ChecklistItem[]
  budget?: number // total trip budget, in `currency`
  currency?: string // the local currency you spend in, e.g. "KRW"
  foodPerDay?: number // daily food and drink allowance, in `currency`
  homeCurrency?: string // your own currency, for showing equivalents, e.g. "USD"
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
  placeId?: string // set when you logged it from a place on your itinerary
  paid?: { amount: number; currency: string } // what you actually paid, if it was in another currency (amount is the local equivalent)
}

// One planned visit in a day.
export type DayItem = {
  id: string
  placeId: string
  time?: string // "HH:MM", optional
  note: string // e.g. opening hours
  done: boolean
  cost?: number // planned cost, optional
  reservation?: 'todo' | 'booked' // do you still need to book it, or is it booked?
  reservationNote?: string // confirmation number, time, name it's under…
}

// A day of the trip. Days are created automatically for every date of the trip.
export type TravelMode = 'walk' | 'transit' | 'taxi'

export type Day = {
  id: string
  tripId: string
  date: string // yyyy-mm-dd
  items: DayItem[] // in the order you'll visit them
  legModes?: Record<string, TravelMode> // how you travel each journey, keyed "fromPlaceId>toPlaceId"
}

export const TAGS = [
  'Food',
  'Cafes',
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
  sourceMap?: string // the name of the map file it was imported from
  dedupeKey: string // used so re-importing never creates duplicates
  groupId?: string
  must?: boolean // a place you really want to do: Suggest my days schedules these first and never sets them aside
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
