import { useSyncExternalStore } from 'react'

// Light, dark, or follow the phone/computer ("auto"). Remembered on this device.
export type Theme = 'auto' | 'light' | 'dark'
const KEY = 'theme'
const listeners = new Set<() => void>()

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function applyTheme(t: Theme = getTheme()) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
}

export function setTheme(t: Theme) {
  try {
    if (t === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, t)
  } catch {
    // not remembered — fine
  }
  applyTheme(t)
  listeners.forEach((l) => l())
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getTheme,
  )
}
