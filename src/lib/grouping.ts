import type { Group, Place } from '../types'
import { distanceKm } from './geo'

export const GROUP_RADIUS_KM = 30

// Chain-linking: two places are in the same group if they're within 30 km of each
// other, directly or through a chain of nearby places. Returns lists of indexes.
export function clusterPlaces(places: Place[], radiusKm = GROUP_RADIUS_KM): number[][] {
  const parent = places.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      if (distanceKm(places[i], places[j]) <= radiusKm) parent[find(i)] = find(j)
    }
  }
  const clusters = new Map<number, number[]>()
  places.forEach((_, i) => {
    const root = find(i)
    clusters.set(root, [...(clusters.get(root) ?? []), i])
  })
  return [...clusters.values()]
}

// "Area 1", "Area 2", … — the name used until (or unless) a real name is found.
export function nextAreaName(groups: Group[]): string {
  const used = groups.map((g) => /^Area (\d+)$/.exec(g.name)?.[1]).filter(Boolean).map(Number)
  return `Area ${Math.max(0, ...used) + 1}`
}
