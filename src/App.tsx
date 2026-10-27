import { ArrowLeft, CalendarDays, Compass, FileJson, MapPin, Map as MapIcon, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BudgetTab } from './components/BudgetTab'
import { DaysTab } from './components/DaysTab'
import { MapTab } from './components/MapTab'
import { PlacesTab } from './components/PlacesTab'
import { TripHero } from './components/TripHero'
import { TripOverview } from './components/TripOverview'
import { TripsHome } from './components/TripsHome'
import { runAutoLookup, useLookupProgress } from './lib/autolookup'
import { buildFullBackup, fileNameFor, shareOrDownload } from './lib/backup'
import { nameAutoGroups } from './lib/naming'
import { go, useRoute, type TabId } from './lib/route'
import { getState, setActiveTrip, useAppData } from './lib/store'
import './App.css'

const NAV: { id: TabId; label: string; Icon: typeof Compass }[] = [
  { id: 'overview', label: 'Overview', Icon: Compass },
  { id: 'places', label: 'Places', Icon: MapPin },
  { id: 'map', label: 'Map', Icon: MapIcon },
  { id: 'days', label: 'Days', Icon: CalendarDays },
  { id: 'budget', label: 'Budget', Icon: Wallet },
]

function TopBar() {
  return (
    <header className="topbar">
      <a className="brand" href="#/">
        <span className="logo"><Compass size={22} strokeWidth={1.8} /></span>
        Wayfarer
      </a>
      <span className="tagline">A little room for the road</span>
      <button
        className="link-btn"
        onClick={() => void shareOrDownload(buildFullBackup(getState()), fileNameFor('backup'))}
      >
        <FileJson size={18} /> Backup
      </button>
    </header>
  )
}

export default function App() {
  const route = useRoute()
  const { trips, groups, places, activeTripId } = useAppData()
  const lookup = useLookupProgress()
  const [tagFilter, setTagFilter] = useState<string[]>([]) // shared by the Places and Map tabs
  const trip = route.page === 'trip' ? trips.find((t) => t.id === route.tripId) : undefined

  // Whenever a group is waiting for a name, look it up (one at a time, politely).
  useEffect(() => {
    if (groups.some((g) => g.nameSource === 'auto')) void nameAutoGroups()
  }, [groups])

  // Photos and details are fetched in the background for new places (and again when you're back online).
  useEffect(() => {
    void runAutoLookup()
    const again = () => void runAutoLookup()
    window.addEventListener('online', again)
    return () => window.removeEventListener('online', again)
  }, [places.length])

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
        <TopBar />
        <main><TripsHome /></main>
        {lookup.running && <p className="lookup-pill" role="status">Fetching photos and details… {lookup.done} of {lookup.total}</p>}
      </div>
    )
  }

  const tab = route.tab
  const ready = activeTripId === trip.id
  return (
    <div className="app">
      <TopBar />
      <div className="trip-chrome">
        <div className="back-row">
          <a className="back" href="#/"><ArrowLeft size={18} /> All trips</a>
          <span className="muted trip-name">{trip.name}</span>
        </div>
        {tab === 'overview' && <TripHero trip={trip} />}
        <nav className="tabs" aria-label="Trip sections">
          {NAV.map(({ id, label, Icon }) => (
            <a
              key={id}
              href={`#/trip/${trip.id}/${id}`}
              className={tab === id ? 'active' : ''}
              aria-current={tab === id ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden />
              {label}
            </a>
          ))}
        </nav>
      </div>
      <main className={tab === 'map' ? 'main-wide' : ''}>
        {ready && tab === 'overview' && <TripOverview trip={trip} />}
        {ready && tab === 'places' && <PlacesTab tagFilter={tagFilter} setTagFilter={setTagFilter} />}
        {ready && tab === 'map' && <MapTab tagFilter={tagFilter} setTagFilter={setTagFilter} />}
        {ready && tab === 'days' && <DaysTab initialDate={route.date} />}
        {ready && tab === 'budget' && <BudgetTab />}
      </main>
      {lookup.running && <p className="lookup-pill" role="status">Fetching photos and details… {lookup.done} of {lookup.total}</p>}
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
