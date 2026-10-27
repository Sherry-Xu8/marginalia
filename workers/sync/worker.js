// Marginalia sync — a tiny Cloudflare Worker that keeps one scrambled copy of your plans in the cloud,
// so your phone and computer stay in step.
//
// Your plans are scrambled (encrypted) on your device before they are sent, using your sync code, so this
// service only ever holds unreadable data. It can't read your trips, and neither can anyone else.
//
//   GET  /v1/<id>   → {"version":3,"data":"…scrambled…"}   (404 if nothing saved yet)
//   PUT  /v1/<id>   body {"baseVersion":3,"data":"…"}  → {"version":4}
//                    409 + the current copy if someone else saved in between
//
// Settings (Cloudflare: Worker → Settings → Variables and Bindings):
//   SYNC            (KV namespace binding) where the copies are kept
//   ALLOWED_ORIGIN  (Text) the address of your app, e.g. https://your-site.netlify.app  (use * while testing)

const ID = /^[a-f0-9]{64}$/
const MAX_BYTES = 8 * 1024 * 1024

function reply(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } })
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const allowed = env.ALLOWED_ORIGIN || '*'
    const cors = {
      'Access-Control-Allow-Origin': allowed === '*' ? '*' : allowed,
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (allowed !== '*' && origin !== allowed) return reply({ error: 'Not allowed from this address.' }, 403, cors)

    const match = new URL(request.url).pathname.match(/^\/v1\/([a-f0-9]{64})$/)
    if (!match || !ID.test(match[1])) return reply({ error: 'Not found.' }, 404, cors)
    const key = 'plans:' + match[1]

    if (request.method === 'GET') {
      const saved = await env.SYNC.get(key, 'json')
      return saved ? reply(saved, 200, cors) : reply({ error: 'Nothing saved yet.' }, 404, cors)
    }

    if (request.method === 'PUT') {
      const text = await request.text()
      if (text.length > MAX_BYTES) return reply({ error: 'That is too large to sync.' }, 413, cors)
      let body
      try {
        body = JSON.parse(text)
      } catch {
        return reply({ error: 'Not valid.' }, 400, cors)
      }
      if (typeof body?.data !== 'string' || !Number.isInteger(body?.baseVersion) || body.baseVersion < 0) {
        return reply({ error: 'Not valid.' }, 400, cors)
      }
      const current = await env.SYNC.get(key, 'json')
      const currentVersion = current?.version ?? 0
      if (body.baseVersion !== currentVersion) return reply({ error: 'Changed elsewhere.', ...current }, 409, cors)
      const next = { version: currentVersion + 1, data: body.data }
      await env.SYNC.put(key, JSON.stringify(next))
      return reply({ version: next.version }, 200, cors)
    }

    return reply({ error: 'Not found.' }, 404, cors)
  },
}
