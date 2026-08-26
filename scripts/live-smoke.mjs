const base = (process.env.MYQUANT_SMOKE_BASE_URL || 'https://myquantdoesntspeakenglish.com').replace(/\/$/, '')
const expectedSha = process.env.EXPECTED_RELEASE_SHA || ''
const timeoutMs = 15_000

async function json(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

const [capabilities, health, openapi, catalog, discovery, publicManifest, editorialFeed] = await Promise.all([
  json(`${base}/api/v1/capabilities`),
  json(`${base}/api/v1/health`),
  json(`${base}/openapi.json`),
  json(`${base}/.well-known/ai-catalog.json`),
  json(`${base}/.well-known/mcp.json`),
  json(`${base}/server.json`),
  json(`${base}/feed.json`),
])

if (capabilities.data?.product?.id !== 'myquant-editorial'
  || capabilities.data?.release?.api_version !== 'myquant.editorial/1.1'
  || capabilities.data?.release?.mcp_version !== '2.1.0') {
  throw new Error('live capabilities have incompatible product/API/MCP versions')
}
if (health.data?.ok !== true || health.data?.mcp_version !== '2.1.0') {
  throw new Error('live health is incompatible')
}
if (expectedSha && health.data?.source_sha !== expectedSha) {
  throw new Error(`live source SHA ${health.data?.source_sha || '(missing)'} != ${expectedSha}`)
}
if (openapi.openapi !== '3.1.0'
  || !openapi.paths?.['/api/v1/capabilities']
  || !openapi.paths?.['/api/v1/health']) {
  throw new Error('live OpenAPI is incomplete')
}
const mcpEntry = catalog.entries?.find((entry) => entry.data?.name === publicManifest.name)
if (JSON.stringify(mcpEntry?.data) !== JSON.stringify(publicManifest)
  || discovery.servers?.[0]?.url !== `${base}/mcp`) {
  throw new Error('live discovery documents disagree')
}
if (editorialFeed._mqdnse?.schema !== 'mqdnse.web-feed.v1'
  || !Array.isArray(editorialFeed.items)
  || editorialFeed.items.length < 1
  || editorialFeed.items[0]?.id !== editorialFeed.items[0]?._mqdnse?.sourceRecordId) {
  throw new Error('live editorial feed identity is invalid')
}

async function mcp(id, method, params = {}) {
  return json(`${base}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
}

const initialized = await mcp(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'myquant-live-smoke', version: '1' } })
const listed = await mcp(2, 'tools/list')
const called = await mcp(3, 'tools/call', { name: 'get_health', arguments: {} })
const latest = await mcp(4, 'tools/call', { name: 'latest_stories', arguments: { limit: 1 } })
const firstId = editorialFeed.items[0].id
const exact = await mcp(5, 'tools/call', { name: 'get_story', arguments: { id: firstId } })
const searched = await mcp(6, 'tools/call', { name: 'search_stories', arguments: { query: firstId, limit: 1 } })
if (initialized.result?.serverInfo?.version !== '2.1.0'
  || listed.result?.tools?.map(({ name }) => name).join(',') !== 'list_capabilities,get_health,latest_stories,get_story,search_stories'
  || called.result?.isError !== false
  || called.result?.structuredContent?.mcp_version !== '2.1.0'
  || latest.result?.structuredContent?.feed?.item_count !== editorialFeed.items.length
  || latest.result?.structuredContent?.stories?.[0]?.id !== firstId
  || latest.result?.structuredContent?.stories?.[0]?._mqdnse?.evidence?.publicationStatus !== 'PUBLISHED'
  || exact.result?.structuredContent?.story?.id !== firstId
  || searched.result?.structuredContent?.stories?.[0]?.id !== firstId) {
  throw new Error('live MCP initialize/list/call parity failed')
}
process.stdout.write(`MyQuant editorial discovery smoke passed at ${base}${expectedSha ? ` sha=${expectedSha}` : ''}\n`)
