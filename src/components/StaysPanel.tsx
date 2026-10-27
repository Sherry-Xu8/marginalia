import { BedDouble, Plus } from 'lucide-react'
import { useState } from 'react'
import { shortDate } from '../lib/days'
import { fmtMoney } from '../lib/money'
import { nightsOf, sortedStays, uncoveredNights } from '../lib/stays'
import { useAppData } from '../lib/store'
import type { Stay, Trip } from '../types'
import { StaySheet } from './StaySheet'

// Every place you're sleeping, in one list. Each links to its days; the days start and end there.
export function StaysPanel({ trip }: { trip: Trip }) {
  const { places } = useAppData()
  const [sheet, setSheet] = useState<{ stay?: Stay; defaults?: { checkIn: string; checkOut: string } } | null>(null)
  const stays = sortedStays(trip)
  const gaps = uncoveredNights(trip)
  const firstGap = gaps[0]
  const currency = trip.currency ?? 'USD'

  return (
    <>
      {stays.length === 0 && <p className="muted">Add each hotel or apartment with its dates. Your days then start and end there, and the travel times are measured from it.</p>}
      {stays.map((s) => {
        const p = places.find((x) => x.id === s.placeId)
        const n = nightsOf(s)
        return (
          <div key={s.id} className="line stay-line">
            <span className="stay-tile"><BedDouble size={20} aria-hidden /></span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              <strong>{p?.name ?? '(place removed)'}</strong>
              <span className="muted" style={{ display: 'block' }}>
                {shortDate(s.checkIn)} → {shortDate(s.checkOut)} · {n} night{n === 1 ? '' : 's'}
              </span>
              {(s.cost !== undefined || s.reference) && (
                <span className="muted" style={{ display: 'block' }}>
                  {[s.cost !== undefined ? fmtMoney(s.cost, currency) : '', s.reference ? `Ref ${s.reference}` : ''].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            <span className="stay-actions">
              <a className="btn" href={`#/trip/${trip.id}/days/${s.checkIn}`}>Days</a>
              <button onClick={() => setSheet({ stay: s })}>Edit</button>
            </span>
          </div>
        )
      })}
      {gaps.map((g) => (
        <p key={g.stop.id} className="note">
          {g.dates.length} night{g.dates.length === 1 ? '' : 's'} in {g.stop.name} with nowhere to stay yet.
        </p>
      ))}
      <button
        className="soft-btn"
        onClick={() =>
          setSheet({
            defaults: firstGap
              ? { checkIn: firstGap.dates[0], checkOut: firstGap.stop.departure }
              : { checkIn: trip.startDate, checkOut: trip.endDate },
          })
        }
      >
        <Plus size={16} /> Add accommodation
      </button>
      {sheet && <StaySheet trip={trip} stay={sheet.stay} defaults={sheet.defaults} onClose={() => setSheet(null)} />}
    </>
  )
}
