// Marginalia flight lookup — a tiny Cloudflare Worker.
//
// It sits between the app and a flight-data service, so your key stays private (the app never sees it).
// The app asks:   GET https://<your-worker>/?flight=KE123&date=2026-11-13
// and gets back:  {"from":"ICN","to":"PUS","departTime":"09:10","arriveTime":"10:20","note":"Terminal 2 → Terminal 1"}
//
// Settings (in Cloudflare: Worker → Settings → Variables and Secrets):
//   API_KEY         (Secret)  your key from the flight-data service
//   ALLOWED_ORIGIN  (Text)    the address of your app, e.g. https://your-site.netlify.app  (use * while testing)
//   PROVIDER        (Text, optional)  "rapidapi" (default) or "apimarket" — where you got your AeroDataBox key

const FLIGHT = /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

function json(body, status, cors, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors, ...extra },
  })
}

// "2026-11-13 09:10+09:00" → "09:10"
const clock = (t) => (t && t.local && /\d{2}:\d{2}/.test(t.local.slice(11, 16)) ? t.local.slice(11, 16) : undefined)

// Turns AeroDataBox's answer into the small shape the app expects.
export function shape(flights, date) {
  if (!Array.isArray(flights) || flights.length === 0) return null
  // Prefer a flight that leaves on the requested date (local time).
  const f = flights.find((x) => x.departure?.scheduledTime?.local?.startsWith(date)) ?? flights[0]
  const dep = f.departure ?? {}
  const arr = f.arrival ?? {}
  const notes = []
  if (dep.terminal) notes.push(`Departs terminal ${dep.terminal}${dep.gate ? `, gate ${dep.gate}` : ''}`)
  if (arr.terminal) notes.push(`arrives terminal ${arr.terminal}`)
  return {
    from: dep.airport?.iata,
    to: arr.airport?.iata,
    departTime: clock(dep.scheduledTime),
    arriveTime: clock(arr.scheduledTime),
    note: notes.length ? notes.join(', ') : undefined,
  }
}

export default {
  async fetch(request, env, ctx) {
    const allowed = env.ALLOWED_ORIGIN || '*'
    const cors = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'GET') return json({ error: 'GET only' }, 405, cors)

    // Only answer your own app (browsers always send Origin on this kind of request).
    const origin = request.headers.get('Origin')
    if (allowed !== '*' && origin && origin !== allowed) return json({ error: 'Not allowed' }, 403, cors)

    const url = new URL(request.url)
    const flight = (url.searchParams.get('flight') || '').toUpperCase().replace(/\s+/g, '')
    const date = url.searchParams.get('date') || ''
    if (!FLIGHT.test(flight) || !DATE.test(date)) return json({ error: 'Send ?flight=KE123&date=YYYY-MM-DD' }, 400, cors)
    if (!env.API_KEY) return json({ error: 'The service has no API_KEY set' }, 500, cors)

    // Answers are kept for an hour, which saves your monthly allowance when you look at the same flight twice.
    const cache = typeof caches !== 'undefined' ? caches.default : null
    const cacheKey = new Request(`https://cache.invalid/${flight}/${date}`)
    if (cache) {
      const hit = await cache.match(cacheKey)
      if (hit) return new Response(hit.body, { status: hit.status, headers: { ...Object.fromEntries(hit.headers), ...cors } })
    }

    let providerUrl
    let headers
    if ((env.PROVIDER || 'rapidapi') === 'apimarket') {
      providerUrl = `https://prod.api.market/api/v1/aedbx/aerodatabox/flights/Number/${flight}/${date}`
      headers = { 'x-magicapi-key': env.API_KEY, Accept: 'application/json' }
    } else {
      providerUrl = `https://aerodatabox.p.rapidapi.com/flights/number/${flight}/${date}`
      headers = { 'X-RapidAPI-Key': env.API_KEY, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com', Accept: 'application/json' }
    }

    let upstream
    try {
      upstream = await fetch(providerUrl, { headers })
    } catch {
      return json({ error: 'The flight service could not be reached' }, 502, cors)
    }
    if (upstream.status === 404 || upstream.status === 204) return json({ error: 'No flight found' }, 404, cors)
    if (!upstream.ok) return json({ error: `The flight service answered ${upstream.status}` }, 502, cors)

    let data
    try {
      data = await upstream.json()
    } catch {
      return json({ error: 'Unreadable answer from the flight service' }, 502, cors)
    }
    const shaped = shape(data, date)
    if (!shaped) return json({ error: 'No flight found' }, 404, cors)

    const res = json(shaped, 200, cors, { 'Cache-Control': 'public, max-age=3600' })
    if (cache) ctx.waitUntil(cache.put(cacheKey, res.clone()))
    return res
  },
}
