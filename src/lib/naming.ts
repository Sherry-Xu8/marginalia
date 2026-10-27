import { centroid } from './geo'
import { reverseGeocodeName } from './geocode'
import { applyLookedUpName, getState } from './store'

let running = false

// Names every group that is still waiting for a name, one at a time
// (reverseGeocodeName spaces its requests out to respect Nominatim's rules).
export async function nameAutoGroups() {
  if (running) return
  running = true
  try {
    for (;;) {
      const s = getState()
      const group = s.groups.find((g) => g.nameSource === 'auto')
      if (!group) break
      const members = s.places.filter((p) => p.groupId === group.id)
      if (members.length === 0) {
        applyLookedUpName(group.id, null)
        continue
      }
      const c = centroid(members)
      applyLookedUpName(group.id, await reverseGeocodeName(c.lat, c.lon))
    }
  } finally {
    running = false
  }
}
