import { useSyncExternalStore } from 'react'
import { BackupError, buildFullBackup, parseBackup } from './backup'
import { getState, onChange, replaceAllData } from './store'

// Optional sync between your devices. Your plans are encrypted on this device with your sync code, then
// kept as one copy on your own Cloudflare Worker (see workers/sync). The service never sees anything readable.

type Config = { url: string; code: string; version: number; hash: string; at: number }
const KEY = 'sync-config'

export function getSyncConfig(): Config | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return c && typeof c.url === 'string' && typeof c.code === 'string' ? c : null
  } catch {
    return null
  }
}
function save(c: Config | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c))
    else localStorage.removeItem(KEY)
  } catch {
    // not remembered — sync just won't persist
  }
}

// ---- Status the screen can show ----
export type SyncStatus = { state: 'off' | 'idle' | 'syncing' | 'error' | 'conflict'; message: string; at?: number }
let status: SyncStatus = getSyncConfig() ? { state: 'idle', message: '', at: getSyncConfig()!.at || undefined } : { state: 'off', message: '' }
const listeners = new Set<() => void>()
const setStatus = (s: SyncStatus) => {
  status = s
  listeners.forEach((l) => l())
}
export const useSyncStatus = (): SyncStatus =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => status,
  )

// ---- Scrambling ----
const enc = new TextEncoder()
const normalise = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '')
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const sha = async (t: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(t)))
const b64 = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}
const unb64 = (t: string) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0))

async function keyFor(code: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(normalise(code)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('marginalia-sync-v1'), iterations: 150_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}
export const idFor = (code: string) => sha('id:' + normalise(code))

async function seal(text: string, code: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(code), enc.encode(text)))
  const out = new Uint8Array(iv.length + body.length)
  out.set(iv)
  out.set(body, iv.length)
  return b64(out)
}
async function unseal(data: string, code: string): Promise<string> {
  const all = unb64(data)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12) }, await keyFor(code), all.subarray(12))
  return new TextDecoder().decode(plain)
}

// A fresh code: 16 characters (about 80 bits), easy to read out loud.
export function makeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const raw = [...bytes].map((b) => alphabet[b % 32]).join('')
  return raw.match(/.{4}/g)!.join('-')
}

// The same plans always give the same fingerprint (except which trip happens to be open).
const fingerprint = () => sha(JSON.stringify({ ...getState(), activeTripId: null }))
const isEmpty = () => getState().trips.length === 0

type Remote = { version: number; data: string }
let busy = false

async function pull(cfg: Config, remote: Remote) {
  const text = await unseal(remote.data, cfg.code).catch(() => {
    throw new Error('That code can’t open the saved plans. Check it’s typed exactly as it was made.')
  })
  const parsed = parseBackup(text)
  if (parsed.kind !== 'full-backup') throw new BackupError('The saved copy isn’t a full backup.')
  replaceAllData(parsed.data)
  save({ ...cfg, version: remote.version, hash: await fingerprint(), at: Date.now() })
}

async function push(cfg: Config, baseVersion: number): Promise<'ok' | 'changed'> {
  const hash = await fingerprint()
  const data = await seal(buildFullBackup(getState()), cfg.code)
  if (data.length > 7_500_000) throw new Error('Your plans are too big to sync (probably photos). Remove a few photos or use a backup file.')
  const r = await fetch(`${cfg.url}/v1/${await idFor(cfg.code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseVersion, data }),
  })
  if (r.status === 409) {
    return 'changed'
  }
  if (!r.ok) throw new Error('The sync service said no. Check its address and settings.')
  const { version } = (await r.json()) as { version: number }
  save({ ...cfg, version, hash, at: Date.now() })
  return 'ok'
}

export async function syncNow(resolve?: 'remote' | 'local'): Promise<void> {
  const cfg = getSyncConfig()
  if (!cfg || busy) return
  if (status.state === 'conflict' && !resolve) return
  busy = true
  setStatus({ state: 'syncing', message: '', at: status.at })
  try {
    const id = await idFor(cfg.code)
    let remote: Remote | null = null
    const r = await fetch(`${cfg.url}/v1/${id}`)
    if (r.status === 404) remote = null
    else if (r.ok) remote = (await r.json()) as Remote
    else throw new Error('The sync service said no. Check its address and settings.')

    if (!remote) {
      await push(cfg, 0)
    } else if (resolve === 'remote') {
      await pull(cfg, remote)
    } else if (resolve === 'local') {
      await push(cfg, remote.version)
    } else {
      const remoteChanged = remote.version !== cfg.version
      const localChanged = !isEmpty() && (await fingerprint()) !== cfg.hash
      if (remoteChanged && !localChanged) await pull(cfg, remote)
      else if (!remoteChanged && localChanged) {
        if ((await push(cfg, remote.version)) === 'changed') {
          setStatus({ state: 'conflict', message: 'This device and another were both changed.', at: status.at })
          return
        }
      } else if (remoteChanged && localChanged) {
        setStatus({ state: 'conflict', message: 'This device and another were both changed since they last matched.', at: status.at })
        return
      }
    }
    setStatus({ state: 'idle', message: '', at: getSyncConfig()?.at ?? Date.now() })
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine
    setStatus({ state: 'error', message: offline ? 'You’re offline. It will sync when you’re back online.' : e instanceof TypeError ? 'Couldn’t reach the sync service. Check its address and your connection.' : (e as Error).message, at: status.at })
  } finally {
    busy = false
  }
}

export function turnOnSync(url: string, code: string): string | null {
  const clean = url.trim().replace(/\/+$/, '')
  if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(clean) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean)) return 'The address needs to start with https://'
  if (normalise(code).length < 16) return 'The code should have 16 letters and numbers.'
  save({ url: clean, code: normalise(code).match(/.{4}/g)!.join('-'), version: 0, hash: '', at: 0 })
  setStatus({ state: 'idle', message: '' })
  void syncNow()
  return null
}

export function turnOffSync() {
  save(null)
  setStatus({ state: 'off', message: '' })
}

// Keeps things in step on its own: when the app opens, a few seconds after you change something,
// and when you come back online or return to the app.
let started = false
export function startAutoSync() {
  if (started) return
  started = true
  let timer: ReturnType<typeof setTimeout> | undefined
  const soon = (ms: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => void syncNow(), ms)
  }
  if (getSyncConfig()) soon(500)
  onChange(() => getSyncConfig() && soon(8000))
  window.addEventListener('online', () => soon(500))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && getSyncConfig() && soon(500))
}
