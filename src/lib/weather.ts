import { useEffect, useState } from 'react'
import { daysUntil } from './days'

// Weather from Open-Meteo (free, no account). Close to the date it's a real forecast. Further out
// there is no forecast, so you see what the same day was like last year, and it says so.

export type DayWeather = {
  hi: number
  lo: number
  rain?: number // chance of rain, %, forecasts only
  code: number // WMO weather code
  basis: 'forecast' | 'actual' | 'last-year'
}

type Point = { lat: number; lon: number }
const CACHE_KEY = 'wx-cache'
const memory = new Map<string, DayWeather | null>()

function readCache(): Record<string, { t: number; v: DayWeather }> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function writeCache(key: string, v: DayWeather) {
  try {
    const all = readCache()
    all[key] = { t: Date.now(), v }
    const keys = Object.keys(all)
    if (keys.length > 120) for (const k of keys.slice(0, keys.length - 120)) delete all[k]
    localStorage.setItem(CACHE_KEY, JSON.stringify(all))
  } catch {
    // not cached — fine
  }
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

const daily = (j: any, i = 0): { hi: number; lo: number; code: number; rain?: number } | null => {
  const d = j?.daily
  const hi = d?.temperature_2m_max?.[i]
  const lo = d?.temperature_2m_min?.[i]
  const code = d?.weather_code?.[i]
  if (typeof hi !== 'number' || typeof lo !== 'number' || typeof code !== 'number') return null
  const rain = d?.precipitation_probability_max?.[i]
  return { hi, lo, code, rain: typeof rain === 'number' ? rain : undefined }
}

export async function getWeather(p: Point, date: string): Promise<DayWeather | null> {
  const lat = p.lat.toFixed(1)
  const lon = p.lon.toFixed(1)
  const key = `${lat},${lon},${date}`
  if (memory.has(key)) return memory.get(key)!
  const cached = readCache()[key]
  const away = daysUntil(date)
  const ttl = away >= -7 && away <= 15 ? 3 * 3600_000 : 30 * 86400_000
  if (cached && Date.now() - cached.t < ttl) {
    memory.set(key, cached.v)
    return cached.v
  }
  let result: DayWeather | null = null
  const vars = 'weather_code,temperature_2m_max,temperature_2m_min'
  if (away >= -7 && away <= 15) {
    const j = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=${vars},precipitation_probability_max&timezone=auto&start_date=${date}&end_date=${date}`)
    const d = daily(j)
    if (d) result = { ...d, basis: away < 0 ? 'actual' : 'forecast' }
  } else {
    // Same day in an earlier year (the most recent one that's finished).
    const [y, m, dd] = date.split('-').map(Number)
    let year = y
    while (daysUntil(`${year}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`) > -10) year--
    const same = `${year}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    const j = await fetchJson(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&daily=${vars}&timezone=auto&start_date=${same}&end_date=${same}`)
    const d = daily(j)
    if (d) result = { hi: d.hi, lo: d.lo, code: d.code, basis: away < 0 ? 'actual' : 'last-year' }
  }
  if (result) {
    memory.set(key, result)
    writeCache(key, result)
  }
  return result
}

export function useWeather(point: Point | undefined, date: string): DayWeather | null | undefined {
  const [state, setState] = useState<{ key: string; v: DayWeather | null } | null>(null)
  const key = point ? `${point.lat.toFixed(1)},${point.lon.toFixed(1)},${date}` : ''
  useEffect(() => {
    if (!point) return
    let live = true
    getWeather(point, date).then((v) => live && setState({ key, v }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return !point ? null : state?.key === key ? state.v : undefined
}

export function describeWeather(code: number): { label: string; icon: 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' } {
  if (code === 0) return { label: 'Clear', icon: 'sun' }
  if (code <= 2) return { label: 'Partly cloudy', icon: 'partly' }
  if (code === 3) return { label: 'Cloudy', icon: 'cloud' }
  if (code === 45 || code === 48) return { label: 'Foggy', icon: 'fog' }
  if (code >= 51 && code <= 67) return { label: 'Rain', icon: 'rain' }
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: 'snow' }
  if (code >= 80 && code <= 82) return { label: 'Showers', icon: 'rain' }
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: 'snow' }
  if (code >= 95) return { label: 'Thunderstorms', icon: 'storm' }
  return { label: 'Cloudy', icon: 'cloud' }
}
