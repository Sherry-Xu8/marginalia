import { CalendarDays, Compass, MapPin, Map as MapIcon, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BudgetTab } from './components/BudgetTab'
import { DaysTab } from './components/DaysTab'
import { MapTab } from './components/MapTab'
import { PlacesTab } from './components/PlacesTab'
import { TripOverview } from './components/TripOverview'
import { TripsHome } from './components/TripsHome'
import { nameAutoGroups } from './lib/naming'
import { go, useRoute, type TabId } from './lib/route'
import { setActiveTrip, useAppData } from './lib/store'
import './App.css'

const NAV: { id: TabId; label: string; Icon: typeof Compass }[] = [
  { id: 'overview', label: 'Overview', Icon: Compass },
  { id: 'places', label: 'Places', Icon: MapPin },
  { id: 'map', label: 'Map', Icon: MapIcon },
  { id: 'days', label: 'Days', Icon: CalendarDays },
  { id: 'budget', label: 'Budget', Icon: Wallet },
]

export default function App() {
  const route = useRoute()
  const { trips, groups, activeTripId } = useAppData()
  const [tagFilter, setTagFilter] = useState<string[]>([]) // shared by the Places and Map tabs
  const trip = route.page === 'trip' ? trips.find((t) => t.id === route.tripId) : undefined

  // Whenever a group is waiting for a name, look it up (one at a time, politely).
  useEffect(() => {
    if (groups.some((g) => g.nameSource === 'auto')) void nameAutoGroups()
  }, [groups])

  // The rest of the app reads "the active trip"; keep it in step with the address.
  useEffect(() => {
    if (trip && activeTripId !== trip.id) setActiveTrip(trip.id)
    if (route.page === 'trip' && !trip) go({ page: 'home' })
  }, [route, trip, activeTripId])

  const tabKey = route.page === 'trip' ? route.tab : ''
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.page, tabKey])

  if (route.page === 'home' || !trip) {
    return (
      <div className="app">
        <header className="topbar">
          <a className="brand" href="#/">Trip Planner</a>
        </header>
        <main><TripsHome /></main>
      </div>
    )
  }

  const tab = route.tab
  const ready = activeTripId === trip.id
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">Trip Planner</a>
        <span className="crumb">
          <a href="#/">All trips</a>
          <span aria-hidden> / </span>
          <span>{trip.name}</span>
        </span>
        <nav className="topnav" aria-label="Trip sections">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#/trip/${trip.id}/${n.id}`}
              className={tab === n.id ? 'active' : ''}
              aria-current={tab === n.id ? 'page' : undefined}
            >
              {n.label}
            </a>
          ))}
        </nav>
      </header>
      <main className={tab === 'map' ? 'main-wide' : ''}>
        {ready && tab === 'overview' && <TripOverview trip={trip} />}
        {ready && tab === 'places' && <PlacesTab tagFilter={tagFilter} setTagFilter={setTagFilter} />}
        {ready && tab === 'map' && <MapTab tagFilter={tagFilter} setTagFilter={setTagFilter} />}
        {ready && tab === 'days' && <DaysTab initialDate={route.date} />}
        {ready && tab === 'budget' && <BudgetTab />}
      </main>
      <nav className="tabbar" aria-label="Trip sections">
        {NAV.map(({ id, label, Icon }) => (
          <a
            key={id}
            href={`#/trip/${trip.id}/${id}`}
            className={tab === id ? 'active' : ''}
            aria-current={tab === id ? 'page' : undefined}
          >
            <Icon size={22} strokeWidth={1.8} aria-hidden />
            {label}
          </a>
        ))}
      </nav>
    </div>
  )
}
