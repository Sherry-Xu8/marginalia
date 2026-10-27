import { useState } from 'react'
import { MapTab } from './components/MapTab'
import { PlacesTab } from './components/PlacesTab'
import { TripTab } from './components/TripTab'
import './App.css'

const TABS = [
  { id: 'trip', label: 'Trip', icon: '🧳' },
  { id: 'places', label: 'Places', icon: '📍' },
  { id: 'map', label: 'Map', icon: '🗺️' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  const [tab, setTab] = useState<TabId>('trip')
  return (
    <div className="app">
      <main>
        {tab === 'trip' && <TripTab />}
        {tab === 'places' && <PlacesTab />}
        {tab === 'map' && <MapTab />}
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
