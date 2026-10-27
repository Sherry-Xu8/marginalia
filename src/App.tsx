import { ArrowLeft, CalendarDays, Compass, FileJson, MapPin, Moon, Sun, SunMoon, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BudgetTab } from './components/BudgetTab'
import { DaysTab } from './components/DaysTab'
import { LogoMark, Wordmark } from './components/Logo'
import { PlacesTab } from './components/PlacesTab'
import { ConfirmHost } from './components/ConfirmHost'
import { SharedView } from './components/SharedView'
import { TripHero } from './components/TripHero'
import { TripOverview } from './components/TripOverview'
import { TripsHome } from './components/TripsHome'
import { runAutoLookup, useLookupProgress } from './lib/autolookup'
import { buildFullBackup, fileNameFor, shareOrDownload } from './lib/backup'
import { nameAutoGroups } from './lib/naming'
import { markBackedUp } from './lib/backupState'
import { setTheme, useTheme, type Theme } from './lib/theme'
import { go, useRoute, type TabId } from './lib/route'
import { getState, setActiveTrip, useAppData } from './lib/store'
import './App.css'

const NAV: { id: TabId; label: string; Icon: typeof Compass }[] = [
  { id: 'overview', label: 'Overview', Icon: Compass },
  { id: 'places', label: 'Places', Icon: MapPin },
  { id: 'days', label: 'Days', Icon: CalendarDays },
  { id: 'budget', label: 'Spending', Icon: Wallet },
]

const NEXT_THEME: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' }
const THEME_LABEL: Record<Theme, string> = { auto: 'Match my device', light: 'Light', dark: 'Dark' }

function ThemeButton() {
  const theme = useTheme()
  const Icon = theme === 'auto' ? SunMoon : theme === 'light' ? Sun : Moon
  return (
    <button className="link-btn theme-btn" onClick={() => setTheme(NEXT_THEME[theme])} aria-label={`Appearance: ${THEME_LABEL[theme]}. Tap to change.`} title={`Appearance: ${THEME_LABEL[theme]}`}>
      <Icon size={20} />
    </button>
  )
}

function TopBar() {
  return (
    <header className="topbar">
      <a className="brand" href="#/">
        <LogoMark size={46} />
        <span className="brand-text">
          <Wordmark />
          <span className="brand-tagline">A little room for the road</span>
        </span>
      </a>
      <span className="tagline">A little room for the road</span>
      <div className="top-actions">
        <ThemeButton />
        <button
          className="link-btn backup-btn"
          onClick={() => void shareOrDownload(buildFullBackup(getState()), fileNameFor('backup')).then((r) => r !== 'cancelled' && markBackedUp())}
        >
          <FileJson size={18} /> Backup
        </button>
      </div>
    </header>
  )
}

function AppView() {
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
  }, [places.length, trips.length, trips.reduce((n, t) => n + t.stops.length, 0)])

  // The rest of the app reads "the active trip"; keep it in step with the address.
  useEffect(() => {
    if (trip && activeTripId !== trip.id) setActiveTrip(trip.id)
    if (route.page === 'trip' && !trip) go({ page: 'home' })
  }, [route, trip, activeTripId])

  const tabKey = route.page === 'trip' ? route.tab : ''
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.page, tabKey])

  if (route.page === 'shared') {
    return (
      <div className="app">
        <TopBar />
        <main><SharedView payload={route.payload} /></main>
      </div>
    )
  }

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
  const navTab = tab === 'map' ? 'places' : tab // the old Map address opens Places
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
              className={navTab === id ? 'active' : ''}
              aria-current={navTab === id ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden />
              {label}
            </a>
          ))}
        </nav>
      </div>
      <main>
        {ready && tab === 'overview' && <TripOverview trip={trip} />}
        {ready && (tab === 'places' || tab === 'map') && (
          <PlacesTab key={tab} tagFilter={tagFilter} setTagFilter={setTagFilter} initialPane={tab === 'map' ? 'map' : 'list'} />
        )}
        {ready && tab === 'days' && <DaysTab initialDate={route.date} />}
        {ready && tab === 'budget' && <BudgetTab />}
      </main>
      {lookup.running && <p className="lookup-pill" role="status">Fetching photos and details… {lookup.done} of {lookup.total}</p>}
      <nav className="tabbar" aria-label="Trip sections">
        {NAV.map(({ id, label, Icon }) => (
          <a
            key={id}
            href={`#/trip/${trip.id}/${id}`}
            className={navTab === id ? 'active' : ''}
            aria-current={navTab === id ? 'page' : undefined}
          >
            <Icon size={22} strokeWidth={1.8} aria-hidden />
            {label}
          </a>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <>
      <AppView />
      <ConfirmHost />
    </>
  )
}
