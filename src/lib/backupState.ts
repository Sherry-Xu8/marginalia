import { useSyncExternalStore } from 'react'

// Everything lives in this browser, so we gently remind you to save a backup file now and then.
const BACKED = 'last-backup'
const SNOOZE = 'backup-snooze'
const FIRST = 'first-data'
const listeners = new Set<() => void>()

const read = (k: string): number => {
  try {
    return Number(localStorage.getItem(k)) || 0
  } catch {
    return 0
  }
}
const write = (k: string, v: number) => {
  try {
    localStorage.setItem(k, String(v))
  } catch {
    // not remembered — fine
  }
  listeners.forEach((l) => l())
}

export const markBackedUp = () => write(BACKED, Date.now())
export const snoozeBackupReminder = () => write(SNOOZE, Date.now())
export const lastBackup = (): number => read(BACKED)

const DAY = 86400_000

// Show the reminder if there's real data, no backup in the last week, and it hasn't been dismissed in 3 days.
export function backupDue(hasData: boolean): boolean {
  if (!hasData) return false
  const now = Date.now()
  if (!read(FIRST)) {
    try {
      localStorage.setItem(FIRST, String(now)) // no notifying here: this runs while the page is drawing
    } catch {
      // not remembered — fine
    }
  }
  if (now - read(SNOOZE) < 3 * DAY) return false
  const last = read(BACKED)
  return last ? now - last > 7 * DAY : now - read(FIRST) > 2 * DAY
}

export function useBackupDue(hasData: boolean): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => backupDue(hasData),
  )
}
