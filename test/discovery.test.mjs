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
  assert.equal(server.version, '2.1.0')
  assert.ok(server.description.length <= 100, 'Registry description must fit the 100-character limit')
  assert.deepEqual(server.remotes, [{
    type: 'streamable-http',
    url: 'https://myquantdoesntspeakenglish.com/mcp',
  }])
  assert.deepEqual(mcpEntry.data, server)
  assert.equal(mcpEntry.metadata.productVersion, '0.1.0')
  assert.equal(mcpEntry.metadata.apiVersion, 'myquant.editorial/1.1')
  assert.equal(mcpEntry.metadata.releaseState, 'available')
  assert.equal(mcpEntry.metadata.publicToolCount, 5)
  assert.deepEqual(mcpEntry.capabilities, [
    'list_capabilities', 'get_health', 'latest_stories', 'get_story', 'search_stories',
  ])
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
  assert.equal(openapi.info['x-mcp-version'], '2.1.0')
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

test('Registry publication is exact-main, deployed-live, and canonically verified', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/registry-publish.yml', import.meta.url),
    'utf8',
  )

  assert.match(workflow, /server\.version !== '2\.1\.0'/)
  assert.match(workflow, /npm run smoke:live/)
  assert.equal(workflow.match(/main:refs\/remotes\/origin\/main/g)?.length, 2)
  assert.match(workflow, /publish server\.json/)
  assert.match(workflow, /continue-on-error: true/)
  assert.match(workflow, /versions\/latest/)
  assert.match(workflow, /official\?\.status !== 'active'/)
  assert.match(workflow, /official\?\.isLatest !== true/)
})
