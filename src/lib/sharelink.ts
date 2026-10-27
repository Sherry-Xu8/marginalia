import qrcode from 'qrcode-generator'
import type { AppData } from '../types'
import { BackupError, parseBackup, type Parsed } from './backup'

// A read-only link: the trip is squeezed into the web address itself, so there's no server and
// nothing is uploaded anywhere. Whoever opens the link sees the plan, and can save a copy.
// Only what's needed to read the plan is included (places you've used, days, stays, journeys,
// notes). No photos, no money.

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

const toB64 = (b: Uint8Array) => {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64 = (t: string) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export function canMakeLinks(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'
}

export async function buildShareLink(state: AppData, tripId: string): Promise<string> {
  const trip = state.trips.find((t) => t.id === tripId)
  if (!trip) throw new BackupError('That trip no longer exists.')
  // Keep the link as short as possible: short ids, rounded coordinates, nothing that can be looked up again.
  let n = 0
  const short = new Map<string, string>()
  const sid = (old: string) => {
    if (!short.has(old)) short.set(old, (n++).toString(36))
    return short.get(old)!
  }
  const days = state.days.filter((d) => d.tripId === tripId && d.items.length > 0)
  const used = new Set([...days.flatMap((d) => d.items.map((i) => i.placeId)), ...(trip.stays ?? []).map((s) => s.placeId)])
  const r5 = (x: number) => Math.round(x * 1e5) / 1e5
  const places = state.places
    .filter((p) => p.tripId === tripId && used.has(p.id))
    .map((p) => ({ id: sid(p.id), tripId: 't', name: p.name, lat: r5(p.lat), lon: r5(p.lon), tag: p.tag, details: p.details?.hours ? { hours: p.details.hours } : undefined }))
  const data = {
    trip: {
      id: 't', name: trip.name, startDate: trip.startDate, endDate: trip.endDate, checklist: [],
      stops: trip.stops.map((s) => ({ id: sid(s.id), name: s.name, arrival: s.arrival, departure: s.departure })),
      stays: (trip.stays ?? []).map((s) => ({ id: sid(s.id), placeId: sid(s.placeId), checkIn: s.checkIn, checkOut: s.checkOut, note: s.note })),
      notes: (trip.notes ?? []).map((x) => ({ id: sid(x.id), title: x.title, text: x.text })),
    },
    places,
    groups: [],
    days: days.map((d) => ({
      id: sid(d.id), tripId: 't', date: d.date,
      items: d.items.map((i) => ({ id: sid(i.id), placeId: sid(i.placeId), time: i.time, note: i.note, done: false, reservation: i.reservation, reservationNote: i.reservationNote })),
    })),
    transfers: state.transfers.filter((t) => t.tripId === tripId).map((t) => ({ id: sid(t.id), tripId: 't', date: t.date, kind: t.kind, title: t.title, from: t.from, to: t.to, departTime: t.departTime, arriveTime: t.arriveTime, note: t.note })),
    expenses: [],
  }
  const json = JSON.stringify({ app: 'trip-planner', kind: 'trip', version: 1, exportedAt: '', data })
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'))
  return `${location.origin}${location.pathname}#/shared/${toB64(packed)}`
}

export async function readShared(payload: string): Promise<Extract<Parsed, { kind: 'trip' }>> {
  try {
    const bytes = await pipe(fromB64(payload), new DecompressionStream('deflate-raw'))
    const parsed = parseBackup(new TextDecoder().decode(bytes))
    if (parsed.kind !== 'trip') throw new BackupError('That link doesn’t hold a trip.')
    return parsed
  } catch (e) {
    throw e instanceof BackupError ? e : new BackupError('That link looks damaged or cut short, so the trip can’t be opened. Ask for it to be sent again.')
  }
}

// A QR code for the link, as an image address. Only possible for short links: QR codes hold about 2,900 characters.
export function qrFor(text: string): string | null {
  if (text.length > 2800) return null
  try {
    const qr = qrcode(0, 'L')
    qr.addData(text)
    qr.make()
    return qr.createDataURL(5, 8)
  } catch {
    return null
  }
}
