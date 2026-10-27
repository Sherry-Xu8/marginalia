import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from 'lucide-react'
import { describeWeather, useWeather } from '../lib/weather'

const ICONS = { sun: Sun, partly: CloudSun, cloud: Cloud, fog: CloudFog, rain: CloudRain, snow: CloudSnow, storm: CloudLightning }

// The day's weather in one line. Close to the date it's a forecast; further out it's last year's.
export function WeatherChip({ point, date }: { point?: { lat: number; lon: number }; date: string }) {
  const w = useWeather(point, date)
  if (!point || w === null) return null
  if (w === undefined) return <span className="wx muted">Checking the weather…</span>
  const { label, icon } = describeWeather(w.code)
  const Icon = ICONS[icon]
  const basis =
    w.basis === 'last-year'
      ? 'No forecast this far ahead, so this is what the same day was like last year.'
      : w.basis === 'actual'
        ? 'What the weather was.'
        : 'Forecast'
  return (
    <span className="wx" title={`${label}. ${basis}`}>
      <Icon size={18} aria-hidden />
      <span>
        {Math.round(w.hi)}° / {Math.round(w.lo)}°
        {w.rain !== undefined && w.rain >= 20 && ` · ${w.rain}% rain`}
        {w.basis === 'last-year' && <small className="muted"> last year</small>}
      </span>
    </span>
  )
}
