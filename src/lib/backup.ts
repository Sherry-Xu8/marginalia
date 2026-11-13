import type { AppData, ChecklistItem, Day, DayItem, Expense, Group, Note, Place, PlaceDetails, Stay, Stop, Transfer, Trip } from '../types'
import { EXPENSE_CATEGORIES, TAGS, TRANSFER_KINDS } from '../types'

// Saving to / loading from a JSON file. A file can hold the whole plan (a backup) or one trip
// (for sharing). Files can come from anyone, so everything is checked and cleaned on the way in.

export class BackupError extends Error {}

export type TripData = {
  trip: Trip
  places: Place[]
  groups: Group[]
  days: Day[]
  transfers: Transfer[]
  expenses: Expense[]
}

type Bundle =
  | { app: 'trip-planner'; kind: 'full-backup'; version: 1; exportedAt: string; data: AppData }
  | { app: 'trip-planner'; kind: 'trip'; version: 1; exportedAt: string; data: TripData }

export function buildFullBackup(state: AppData): string {
  const b: Bundle = { app: 'trip-planner', kind: 'full-backup', version: 1, exportedAt: new Date().toISOString(), data: state }
  return JSON.stringify(b)
}

export function buildTripShare(state: AppData, tripId: string, includeMoney: boolean): string {
  const trip = state.trips.find((t) => t.id === tripId)
  if (!trip) throw new BackupError('That trip no longer exists.')
  const shared: Trip = includeMoney
    ? trip
    : { ...trip, budget: undefined, currency: undefined, foodPerDay: undefined, stays: (trip.stays ?? []).map((s) => ({ ...s, cost: undefined, paid: undefined })) }
  const days = state.days
    .filter((d) => d.tripId === tripId)
    .map((d) => (includeMoney ? d : { ...d, items: d.items.map((i) => ({ ...i, cost: undefined })) }))
  const data: TripData = {
    trip: shared,
    places: state.places.filter((p) => p.tripId === tripId),
    groups: state.groups.filter((g) => g.tripId === tripId),
    days,
    transfers: state.transfers
      .filter((t) => t.tripId === tripId)
      .map((t) => (includeMoney ? t : { ...t, cost: undefined })),
    expenses: includeMoney ? state.expenses.filter((e) => e.tripId === tripId) : [],
  }
  const b: Bundle = { app: 'trip-planner', kind: 'trip', version: 1, exportedAt: new Date().toISOString(), data }
  return JSON.stringify(b)
}

export function fileNameFor(label: string): string {
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan'
  return `trip-planner-${safe}-${new Date().toISOString().slice(0, 10)}.json`
}

// Shares the file with your phone's Share menu if there is one, otherwise downloads it.
export async function shareOrDownload(json: string, filename: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([json], filename, { type: 'application/json' })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    // any other sharing problem: fall through to a plain download
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

// ---- Reading files back in ----

const str = (v: unknown, max = 2000): string | null => (typeof v === 'string' ? v.slice(0, max) : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const paidOf = (v: unknown): { amount: number; currency: string } | undefined => {
  const p = obj(v)
  const a = num(p?.amount)
  const c = str(p?.currency, 4)
  return p && a !== null && c ? { amount: a, currency: c } : undefined
}
const date = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

function cleanTrip(v: unknown): Trip | null {
  const o = obj(v)
  const id = str(o?.id, 100)
  const name = str(o?.name, 200)
  const startDate = date(o?.startDate)
  const endDate = date(o?.endDate)
  if (!o || !id || !name || !startDate || !endDate) return null
  const stops = arr(o.stops).flatMap((s): Stop[] => {
    const so = obj(s)
    const sid = str(so?.id, 100)
    const sname = str(so?.name, 200)
    const arrival = date(so?.arrival)
    const departure = date(so?.departure)
    return so && sid && sname && arrival && departure
      ? [{ id: sid, name: sname, arrival, departure, coverUrl: url(so.coverUrl) }]
      : []
  })
  const stays: Stay[] = arr(o.stays).flatMap((x): Stay[] => {
    const xo = obj(x)
    const xid = str(xo?.id, 100)
    const placeId = str(xo?.placeId, 100)
    const checkIn = date(xo?.checkIn)
    const checkOut = date(xo?.checkOut)
    return xo && xid && placeId && checkIn && checkOut && checkOut > checkIn
      ? [{ id: xid, placeId, checkIn, checkOut, cost: num(xo.cost) ?? undefined, paid: paidOf(xo.paid), unpaid: xo.unpaid === true ? true : undefined, reference: str(xo.reference, 100) ?? undefined, note: str(xo.note, 1000) ?? undefined }]
      : []
  })
  // Files from before multiple stays kept one place per stop.
  for (const s of arr(o.stops)) {
    const so = obj(s)
    const legacy = str(so?.stayPlaceId, 100)
    const a = date(so?.arrival)
    const b = date(so?.departure)
    if (legacy && a && b && a < b && !stays.some((x) => x.placeId === legacy && x.checkIn === a)) stays.push({ id: str(so?.id, 100) + ':stay', placeId: legacy, checkIn: a, checkOut: b })
  }
  const notes: Note[] = arr(o.notes).flatMap((x): Note[] => {
    const xo = obj(x)
    const xid = str(xo?.id, 100)
    const title = str(xo?.title, 200)
    return xo && xid && title ? [{ id: xid, title, text: str(xo.text, 5000) ?? '' }] : []
  }).slice(0, 100)
  const checklist = arr(o.checklist).flatMap((c): ChecklistItem[] => {
    const co = obj(c)
    const cid = str(co?.id, 100)
    const text = str(co?.text, 300)
    return co && cid && text && (co.section === 'pre' || co.section === 'packing')
      ? [{ id: cid, section: co.section, text, done: co.done === true }]
      : []
  })
  return {
    id, name, startDate, endDate, stops, stays, notes, checklist,
    coverUrl: url(o.coverUrl),
    budget: num(o.budget) ?? undefined,
    currency: str(o.currency, 4) ?? undefined,
    foodPerDay: num(o.foodPerDay) !== null && num(o.foodPerDay)! >= 0 ? num(o.foodPerDay)! : undefined,
    homeCurrency: str(o.homeCurrency, 4) ?? undefined,
  }
}

// Only ordinary web addresses are accepted, so a shared file can't smuggle in a script link.
const url = (v: unknown): string | undefined => {
  const t = str(v, 600)
  return t && /^https?:\/\/[^\s]+$/i.test(t) ? t : undefined
}

function cleanDetails(v: unknown): PlaceDetails | undefined {
  const o = obj(v)
  if (!o) return undefined
  const d: PlaceDetails = {
    summary: str(o.summary, 3000) ?? undefined,
    website: url(o.website),
    hours: str(o.hours, 600) ?? undefined,
    phone: str(o.phone, 60) ?? undefined,
    cuisine: str(o.cuisine, 200) ?? undefined,
    imageUrl: url(o.imageUrl),
    source: str(o.source, 100) ?? undefined,
  }
  return Object.values(d).some(Boolean) ? d : undefined
}

function cleanPhotos(v: unknown): string[] | undefined {
  const list = arr(v).filter((p): p is string => typeof p === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p) && p.length < 600_000)
  return list.length > 0 ? list.slice(0, 6) : undefined
}

function cleanPlace(v: unknown): Place | null {
  const o = obj(v)
  const id = str(o?.id, 100)
  const tripId = str(o?.tripId, 100)
  const name = str(o?.name, 300)
  const lat = num(o?.lat)
  const lon = num(o?.lon)
  if (!o || !id || !tripId || !name || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  const legacy = (o.tag as unknown) === 'Food & drink' ? 'Food' : o.tag
  const tag = TAGS.find((t) => t === legacy)
  return {
    id, tripId, name, lat, lon,
    originalName: str(o.originalName, 300) ?? undefined,
    details: cleanDetails(o.details),
    photos: cleanPhotos(o.photos),
    description: str(o.description, 5000) ?? '',
    layer: str(o.layer, 300) ?? '',
    must: o.must === true ? true : undefined,
    sourceMap: str(o.sourceMap, 300) ?? undefined,
    dedupeKey: str(o.dedupeKey, 500) ?? `${name.toLowerCase()}|${lat.toFixed(5)}|${lon.toFixed(5)}`,
    groupId: str(o.groupId, 100) ?? undefined,
    tag,
    tagSource: tag ? (o.tagSource === 'user' ? 'user' : 'rule') : undefined,
  }
}

function cleanGroup(v: unknown): Group | null {
  const o = obj(v)
  const id = str(o?.id, 100)
  const tripId = str(o?.tripId, 100)
  const name = str(o?.name, 200)
  if (!o || !id || !tripId || !name) return null
  const sources = ['auto', 'geocoded', 'fallback', 'user'] as const
  return {
    id, tripId, name,
    nameSource: sources.find((s) => s === o.nameSource) ?? 'user',
    stopId: str(o.stopId, 100) ?? undefined,
  }
}

function cleanDay(v: unknown): Day | null {
  const o = obj(v)
  const id = str(o?.id, 100)
  const tripId = str(o?.tripId, 100)
  const d = date(o?.date)
  if (!o || !id || !tripId || !d) return null
  const items = arr(o.items).flatMap((i) => {
    const io = obj(i)
    const iid = str(io?.id, 100)
    const placeId = str(io?.placeId, 100)
    if (!io || !iid || !placeId) return []
    const time = typeof io.time === 'string' && /^\d{2}:\d{2}$/.test(io.time) ? io.time : undefined
    const reservation: DayItem['reservation'] = io.reservation === 'todo' || io.reservation === 'booked' ? io.reservation : undefined
    return [{ id: iid, placeId, time, note: str(io.note, 2000) ?? '', done: io.done === true, cost: num(io.cost) ?? undefined, reservation, reservationNote: str(io.reservationNote, 500) ?? undefined }]
  })
  const legModes = Object.fromEntries(
    Object.entries(obj(o.legModes) ?? {})
      .slice(0, 300)
      .filter(([k, v]) => /^[\w-]{1,100}>[\w-]{1,100}$/.test(k) && (v === 'walk' || v === 'transit' || v === 'taxi')),
  )
  return { id, tripId, date: d, items, legModes: Object.keys(legModes).length > 0 ? (legModes as Day['legModes']) : undefined }
}

function cleanExpense(v: unknown): Expense | null {
  const o = obj(v)
  const id = str(o?.id, 100)
  const tripId = str(o?.tripId, 100)
  const d = date(o?.date)
  const title = str(o?.title, 300)
  const amount = num(o?.amount)
  if (!o || !id || !tripId || !d || !title || amount === null) return null
  return {
    id, tripId, date: d, title, amount,
    category: EXPENSE_CATEGORIES.find((c) => c === o.category) ?? 'Other',
    placeId: str(o.placeId, 100) ?? undefined,
    paid: (() => {
      const p = obj(o.paid)
      const a = num(p?.amount)
      const c = str(p?.currency, 4)
      return p && a !== null && c ? { amount: a, currency: c } : undefined
    })(),
  }
}

function cleanTransfer(v: unknown): Transfer | null {
  const o = obj(v)
  const id = str(o?.id, 100)
  const tripId = str(o?.tripId, 100)
  const d = date(o?.date)
  const title = str(o?.title, 200)
  const kind = TRANSFER_KINDS.find((k) => k === o?.kind)
  if (!o || !id || !tripId || !d || !title || !kind) return null
  const time = (x: unknown) => (typeof x === 'string' && /^\d{2}:\d{2}$/.test(x) ? x : undefined)
  return {
    id, tripId, date: d, kind, title,
    from: str(o.from, 200) ?? '',
    to: str(o.to, 200) ?? '',
    departTime: time(o.departTime),
    arriveTime: time(o.arriveTime),
    arriveDate: date(o.arriveDate) && date(o.arriveDate)! > d ? date(o.arriveDate)! : undefined,
    reference: str(o.reference, 100) ?? undefined,
    note: str(o.note, 1000) ?? undefined,
    cost: num(o.cost) ?? undefined,
    paid: paidOf(o.paid),
    unpaid: o.unpaid === true ? true : undefined,
    fromPlaceId: str(o.fromPlaceId, 100) ?? undefined,
    toPlaceId: str(o.toPlaceId, 100) ?? undefined,
  }
}

const collect = <T,>(v: unknown, clean: (x: unknown) => T | null): T[] => arr(v).flatMap((x) => clean(x) ?? [])

export type Parsed =
  | { kind: 'full-backup'; data: AppData }
  | { kind: 'trip'; data: TripData }

export function parseBackup(text: string): Parsed {
  if (text.length > 25_000_000) throw new BackupError('That file is too large to be a trip plan.')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('That file isn’t a Trip Planner file (it couldn’t be read as JSON).')
  }
  const b = obj(raw)
  const data = obj(b?.data)
  if (!b || b.app !== 'trip-planner' || b.version !== 1 || !data) {
    throw new BackupError('That file wasn’t made by this app, so it can’t be imported.')
  }
  if (b.kind === 'trip') {
    const trip = cleanTrip(data.trip)
    if (!trip) throw new BackupError('That trip file is damaged — the trip details are missing.')
    return {
      kind: 'trip',
      data: {
        trip,
        places: collect(data.places, cleanPlace),
        groups: collect(data.groups, cleanGroup),
        days: collect(data.days, cleanDay),
        transfers: collect(data.transfers, cleanTransfer),
        expenses: collect(data.expenses, cleanExpense),
      },
    }
  }
  if (b.kind === 'full-backup') {
    const trips = collect(data.trips, cleanTrip)
    const active = str(data.activeTripId, 100)
    return {
      kind: 'full-backup',
      data: {
        version: 1,
        trips,
        places: collect(data.places, cleanPlace),
        groups: collect(data.groups, cleanGroup),
        days: collect(data.days, cleanDay),
        transfers: collect(data.transfers, cleanTransfer),
        expenses: collect(data.expenses, cleanExpense),
        activeTripId: trips.some((t) => t.id === active) ? active : (trips[0]?.id ?? null),
      },
    }
  }
  throw new BackupError('That file wasn’t made by this app, so it can’t be imported.')
}
