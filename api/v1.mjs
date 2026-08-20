import { CAPABILITIES, getHealth } from './lib/product-surface.mjs'

const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600'

function setHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type')
  res.setHeader('Cache-Control', CACHE)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

function send(res, status, payload, head = false) {
  setHeaders(res)
  res.statusCode = status
  res.end(head ? '' : `${JSON.stringify(payload)}\n`)
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setHeaders(res)
    res.statusCode = 204
    res.end()
    return
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS')
    send(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET or HEAD.' })
    return
  }
  const requestUrl = new URL(req.url ?? '/', 'https://myquant.invalid')
  const resource = String(req.query?.resource ?? requestUrl.searchParams.get('resource') ?? 'capabilities')
  const data = resource === 'capabilities' ? CAPABILITIES : resource === 'health' ? getHealth() : null
  if (!data) {
    send(res, 404, { ok: false, error: 'not_found', message: `Unknown public resource: ${resource}` }, req.method === 'HEAD')
    return
  }
  send(res, 200, { ok: true, resource, data }, req.method === 'HEAD')
}
