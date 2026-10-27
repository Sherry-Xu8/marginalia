import { useSyncExternalStore } from 'react'

// The browser's own confirm() box is blocked in some places (installed apps, embedded browsers), which
// made delete buttons do nothing. This asks in the app itself instead.
export type Ask = { message: string; label: string; onYes: () => void }
let current: Ask | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function ask(message: string, onYes: () => void, label = 'Delete') {
  current = { message, label, onYes }
  emit()
}

export function answer(yes: boolean) {
  const a = current
  current = null
  emit()
  if (yes) a?.onYes()
}

export function useAsk(): Ask | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}
