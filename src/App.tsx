import { useEffect, useState } from 'react'
import { BudgetTab } from './components/BudgetTab'
import { DaysTab } from './components/DaysTab'
import { MapTab } from './components/MapTab'
import { PlacesTab } from './components/PlacesTab'
import { TripTab } from './components/TripTab'
import { nameAutoGroups } from './lib/naming'
import { useAppData } from './lib/store'
import './App.css'

const TABS = [
  { id: 'trip', label: 'Trip', icon: '🧳' },
  { id: 'places', label: 'Places', icon: '📍' },
  { id: 'map', label: 'Map', icon: '🗺️' },
  { id: 'days', label: 'Days', icon: '📅' },
  { id: 'budget', label: 'Budget', icon: '💰' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  const [tab, setTab] = useState<TabId>('trip')
  const [tagFilter, setTagFilter] = useState<string[]>([]) // shared by the Places and Map tabs
  const { groups } = useAppData()

  // Whenever a group is waiting for a name, look it up (one at a time, politely).
  useEffect(() => {
    if (groups.some((g) => g.nameSource === 'auto')) void nameAutoGroups()
  }, [groups])
  return (
    <div className="app">
      <main>
        {tab === 'trip' && <TripTab />}
        {tab === 'places' && <PlacesTab tagFilter={tagFilter} setTagFilter={setTagFilter} />}
        {tab === 'days' && <DaysTab />}
        {tab === 'budget' && <BudgetTab />}
        {tab === 'map' && <MapTab tagFilter={tagFilter} setTagFilter={setTagFilter} />}
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
