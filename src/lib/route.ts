import { useSyncExternalStore } from 'react'

// Tiny hash-based routing (works on any static host and keeps the phone's Back button useful):
//   #/                      all trips
//   #/trip/<id>/<tab>       inside a trip   (tab: overview | places | map | days | budget)
//   #/trip/<id>/days/<date> a specific day

export const TABS = ['overview', 'places', 'map', 'days', 'budget'] as const
export type TabId = (typeof TABS)[number]

export type Route = { page: 'home' } | { page: 'settings' } | { page: 'trip'; tripId: string; tab: TabId; date?: string } | { page: 'shared'; payload: string }

export function parseHash(hash: string): Route {
  const [, kind, tripId, tab, date] = hash.replace(/^#/, '').split('/')
  if (kind === 'settings') return { page: 'settings' }
  if (kind === 'shared' && tripId && /^[\w-]+$/.test(tripId)) return { page: 'shared', payload: tripId }
  if (kind === 'trip' && tripId) {
    const t = TABS.find((x) => x === tab) ?? 'overview'
    return { page: 'trip', tripId, tab: t, date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined }
  }
  return { page: 'home' }
}

export const hrefFor = (r: Route): string =>
  r.page === 'home' ? '#/' : r.page === 'settings' ? '#/settings' : r.page === 'shared' ? `#/shared/${r.payload}` : `#/trip/${r.tripId}/${r.tab}${r.date ? '/' + r.date : ''}`

export const go = (r: Route) => {
  location.hash = hrefFor(r)
}

let cached: { hash: string; route: Route } = { hash: '', route: { page: 'home' } }
function snapshot(): Route {
  if (cached.hash !== location.hash) cached = { hash: location.hash, route: parseHash(location.hash) }
  return cached.route
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb)
      return () => window.removeEventListener('hashchange', cb)
    },
    snapshot,
  )
}
