import { useSyncExternalStore } from 'react'
import { getState, restoreParts } from './store'
import type { AppData } from '../types'

// A short message at the bottom of the screen, optionally with one button (Undo, Refresh).
export type Toast = { id: number; message: string; action?: { label: string; run: () => void }; sticky?: boolean }

let current: Toast | null = null
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function dismissToast(id?: number) {
  if (id !== undefined && current?.id !== id) return
  clearTimeout(timer)
  current = null
  emit()
}

export function toast(message: string, opts: { action?: Toast['action']; sticky?: boolean; ms?: number } = {}) {
  clearTimeout(timer)
  const id = ++seq
  current = { id, message, action: opts.action, sticky: opts.sticky }
  emit()
  if (!opts.sticky) timer = setTimeout(() => dismissToast(id), opts.ms ?? 6000)
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}

// Deletes straight away and offers Undo for a few seconds, instead of asking "are you sure?".
// Undo puts back only the parts of the app data the delete touched, so nothing else is lost.
export function deleteWithUndo(message: string, parts: (keyof AppData)[], remove: () => void) {
  const before = getState()
  remove()
  toast(message, { action: { label: 'Undo', run: () => restoreParts(before, parts) }, ms: 7000 })
}
