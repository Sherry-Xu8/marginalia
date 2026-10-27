import { useEffect, useState } from 'react'

// Exchange rates from free sources that need no key:
//   • Frankfurter (European Central Bank rates, updated each working day), then
//   • open.er-api.com (wider list of currencies) if the first doesn't have a currency.
// Rates are remembered on this device for a few hours, and an older one is used if you're offline.

export type Rate = { rate: number; asOf: string; source: string; stale?: boolean }
const KEY = 'fx-cache'
const FRESH_MS = 6 * 3600_000
type Stored = Rate & { at: number }

const read = (): Record<string, Stored> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}
const write = (k: string, v: Stored) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [k]: v }))
  } catch {
    // not saved — fine
  }
}

async function getJson<T>(url: string): Promise<T | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const valid = (c: string) => /^[A-Z]{3}$/.test(c)

export async function getRate(fromRaw: string, toRaw: string): Promise<Rate | null> {
  const from = fromRaw.trim().toUpperCase()
  const to = toRaw.trim().toUpperCase()
  if (!valid(from) || !valid(to)) return null
  if (from === to) return { rate: 1, asOf: new Date().toISOString().slice(0, 10), source: 'same currency' }
  const key = `${from}>${to}`
  const cached = read()[key]
  if (cached && Date.now() - cached.at < FRESH_MS) return cached

  const a = await getJson<{ rates?: Record<string, number>; date?: string }>(
    `https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`,
  )
  if (a?.rates?.[to]) {
    const r = { rate: a.rates[to], asOf: a.date ?? '', source: 'European Central Bank', at: Date.now() }
    write(key, r)
    return r
  }
  const b = await getJson<{ rates?: Record<string, number>; time_last_update_utc?: string }>(`https://open.er-api.com/v6/latest/${from}`)
  if (b?.rates?.[to]) {
    const r = {
      rate: b.rates[to],
      asOf: b.time_last_update_utc ? new Date(b.time_last_update_utc).toISOString().slice(0, 10) : '',
      source: 'Exchange Rate API',
      at: Date.now(),
    }
    write(key, r)
    return r
  }
  return cached ? { ...cached, stale: true } : null
}

// React: the rate from one currency to another (null while loading or if unavailable).
export function useRate(from: string, to: string): { rate: Rate | null; loading: boolean } {
  const [state, setState] = useState<{ key: string; rate: Rate | null } | null>(null)
  const key = `${from}>${to}`
  useEffect(() => {
    let live = true
    getRate(from, to).then((rate) => live && setState({ key, rate }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const ready = state?.key === key
  return { rate: ready ? state!.rate : null, loading: !ready }
}
