import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readJson = (path) => readFile(
  new URL(`../${path}`, import.meta.url),
  'utf8',
).then(JSON.parse)

test('Registry, AI catalog, and well-known discovery share one MCP identity', async () => {
  const [server, catalog, discovery] = await Promise.all([
    readJson('server.json'),
    readJson('public/.well-known/ai-catalog.json'),
    readJson('public/.well-known/mcp.json'),
  ])
  const mcpEntry = catalog.entries.find((entry) => entry.type === 'application/json')

  assert.equal(
    server.$schema,
    'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
  )
  assert.equal(server.name, 'io.github.beepboop2025/myquant-editorial')
  assert.equal(server.version, '2.0.0')
  assert.deepEqual(server.remotes, [{
    type: 'streamable-http',
    url: 'https://myquantdoesntspeakenglish.com/mcp',
  }])
  assert.deepEqual(mcpEntry.data, server)
  assert.equal(mcpEntry.metadata.productVersion, '0.1.0')
  assert.equal(mcpEntry.metadata.apiVersion, 'myquant.editorial/1.1')
  assert.deepEqual(discovery, {
    canonicalCatalog: 'https://myquantdoesntspeakenglish.com/.well-known/ai-catalog.json',
    servers: [{
      name: server.name,
      url: server.remotes[0].url,
    }],
  })
})

test('curated OpenAPI describes only the two public REST reads', async () => {
  const openapi = await readJson('public/openapi.json')

  assert.equal(openapi.openapi, '3.1.0')
  assert.equal(openapi.info.version, '1.1.0')
  assert.equal(openapi.info['x-product-version'], '0.1.0')
  assert.equal(openapi.info['x-api-version'], 'myquant.editorial/1.1')
  assert.equal(openapi.info['x-mcp-version'], '2.0.0')
  assert.deepEqual(Object.keys(openapi.paths).sort(), [
    '/api/v1/capabilities',
    '/api/v1/health',
  ])
  assert.ok(Object.values(openapi.paths).every((path) => path.get && path.head))
})

test('Vercel routes and caches every public discovery surface', async () => {
  const vercel = await readJson('vercel.json')
  const rewrites = new Map(
    vercel.rewrites.map(({ source, destination }) => [source, destination]),
  )
  const headerRoutes = new Set(vercel.headers.map(({ source }) => source))

  assert.equal(rewrites.get('/mcp'), '/api/mcp')
  assert.equal(rewrites.get('/api/openapi.json'), '/openapi.json')
  assert.ok(headerRoutes.has('/openapi.json'))
  assert.ok(headerRoutes.has('/server.json'))
  assert.ok(headerRoutes.has('/.well-known/:file'))
})
