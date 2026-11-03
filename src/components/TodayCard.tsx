import { ArrowRight, MapPin, Wallet } from 'lucide-react'
import { stopLabel, toISO } from '../lib/days'
import { hoursWarning } from '../lib/hours'
import { toMinutes } from '../lib/journeys'
import { fmtMoney } from '../lib/money'
import { useAppData } from '../lib/store'
import type { Trip } from '../types'
import { KIND_INFO } from './TransferSheet'
import { WeatherChip } from './WeatherChip'

// While you're travelling: what's next today, the next journey, and what you've spent. Only shown
// on the days of the trip.
export function TodayCard({ trip }: { trip: Trip }) {
  const { days, places, transfers, expenses } = useAppData()
  const today = toISO(new Date())
  if (today < trip.startDate || today > trip.endDate) return null
  const day = days.find((d) => d.tripId === trip.id && d.date === today)
  if (!day) return null

  const placeById = new Map(places.map((p) => [p.id, p]))
  const todays = transfers.filter((t) => t.tripId === trip.id && t.date === today)
  const next = day.items.find((i) => !i.done)
  const nextPlace = next ? placeById.get(next.placeId) : undefined
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const nextJourney = [...todays]
    .sort((a, b) => (a.departTime ?? '').localeCompare(b.departTime ?? ''))
    .find((t) => (toMinutes(t.departTime) ?? 0) >= nowMin - 30)
  const warning = nextPlace ? hoursWarning(nextPlace.details?.hours, today, next?.time) : null
  const spent = expenses.filter((e) => e.tripId === trip.id && e.date === today).reduce((s, e) => s + e.amount, 0)
  const foodSpent = expenses.filter((e) => e.tripId === trip.id && e.date === today && e.category === 'Food & drink').reduce((s, e) => s + e.amount, 0)
  const currency = trip.currency ?? 'GBP'
  const done = day.items.filter((i) => i.done).length

  return (
    <section className="card today-card" aria-label="Today">
      <p className="eyebrow">Today · Day {days.filter((d) => d.tripId === trip.id && d.date <= today).length} of {days.filter((d) => d.tripId === trip.id).length}</p>
      <h2 className="display">{stopLabel(trip, today) || 'Today'}</h2>
      <WeatherChip point={nextPlace ?? places.find((p) => p.tripId === trip.id)} date={today} />

      {nextPlace ? (
        <div className="today-next">
          <p className="eyebrow">Next up</p>
          <strong className="serif">{nextPlace.name}</strong>
          <span className="muted">
            {[next?.time, `${done} of ${day.items.length} done`].filter(Boolean).join(' · ')}
          </span>
          {warning && <span className="rsv warn">{warning}</span>}
          <div className="chips">
            <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${nextPlace.lat},${nextPlace.lon}`} target="_blank" rel="noopener noreferrer">
              <MapPin size={15} /> Directions
            </a>
            <a className="btn" href={`#/trip/${trip.id}/days/${today}`}>Open today <ArrowRight size={15} /></a>
          </div>
        </div>
      ) : (
        <p className="muted">{day.items.length === 0 ? 'Nothing planned for today.' : 'Everything on today’s list is done.'}</p>
      )}

      {nextJourney && (
        <div className="today-journey">
          {(() => {
            const { Icon } = KIND_INFO[nextJourney.kind]
            return <Icon size={18} />
          })()}
          <span>
            <strong>{nextJourney.title}</strong>
            <span className="muted" style={{ display: 'block' }}>
              {[nextJourney.departTime && `Leaves ${nextJourney.departTime}`, nextJourney.from && nextJourney.to ? `${nextJourney.from} → ${nextJourney.to}` : '', nextJourney.reference && `Ref ${nextJourney.reference}`].filter(Boolean).join(' · ')}
            </span>
          </span>
        </div>
      )}

      <a className="today-spend" href={`#/trip/${trip.id}/budget`}>
        <Wallet size={18} aria-hidden />
        <span>
          Spent today {fmtMoney(spent, currency)}
          {trip.foodPerDay ? <span className="muted"> · food {fmtMoney(foodSpent, currency)} of {fmtMoney(trip.foodPerDay, currency)}</span> : null}
        </span>
        <ArrowRight size={16} aria-hidden />
      </a>
    </section>
  )
}
