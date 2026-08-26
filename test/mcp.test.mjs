import assert from 'node:assert/strict'
import test from 'node:test'

import handler, { dispatch } from '../api/mcp.mjs'
import apiHandler from '../api/v1.mjs'
import {
  CAPABILITIES,
  EDITORIAL_FEED_LIMITS,
  createEditorialFeedReader,
  getHealth,
} from '../api/lib/product-surface.mjs'

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value },
    end(body = '') { this.body = body },
  }
}

function modernRequest(id, method, params = {}, headers = {}) {
  return {
    method: 'POST',
    url: '/mcp',
    headers: {
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': method,
      ...headers,
    },
    body: {
      jsonrpc: '2.0',
      id,
      method,
      params: {
        ...params,
        _meta: {
          ...(params._meta ?? {}),
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    },
  }
}

const TEST_FEED_URL = 'https://myquantdoesntspeakenglish.com/feed.json'

function feedStory(index) {
  const id = index === 0 ? 'myquant:test-release-story' : `seiche:test-story-${index}`
  const clock = new Date(Date.UTC(2026, 7, 25, 12, 0, 0) - index * 60_000).toISOString()
  return {
    id,
    url: `https://myquantdoesntspeakenglish.com/interpreted/test-story-${index}`,
    ...(index === 0 ? {} : { external_url: `https://seiche.info/dispatches/test-story-${index}` }),
    title: index === 0 ? 'Primary release test story' : `Funding test story ${index}`,
    summary: `Evidence-bounded summary ${index}`,
    date_published: clock,
    tags: ['interpreted', index === 0 ? 'myquant' : 'seiche', 'funding', 'DECLARED'],
    _mqdnse: {
      schema: 'mqdnse.web-feed-item.v1',
      lane: index === 0 ? 'MYQUANT_ANALYSIS' : 'INTERPRETED',
      product: index === 0 ? 'myquant' : 'seiche',
      beat: 'dollar-funding-plumbing',
      editorialClass: index === 0 ? 'house_investigation' : 'full_story',
      articleType: index === 0 ? 'news_analysis' : 'full_story',
      sourceRecordId: id,
      sourceUrl: index === 0
        ? `https://myquantdoesntspeakenglish.com/interpreted/test-story-${index}`
        : `https://seiche.info/dispatches/test-story-${index}`,
      evidence: {
        status: 'DECLARED',
        eventTime: clock,
        knowledgeTime: clock,
        publicationStatus: 'PUBLISHED',
        contribution: `Test contribution ${index}`,
        limitation: `Test limitation ${index}`,
        sourceFingerprint: 'a'.repeat(64),
      },
      copy: {
        state: index === 0 ? 'HOUSE_AUTHORED' : 'SOURCE_GROUNDED',
        inEnglish: `Plain-English copy ${index}`,
        whyItMatters: `Why it matters ${index}`,
        uncertainty: `Uncertainty ${index}`,
        ...(index === 0 ? {} : {
          whatChanged: `What changed in the bounded source record ${index}.`,
          nextCheck: `What to inspect in the next source record ${index}.`,
          qualityGate: 'PASSED',
          method: 'DETERMINISTIC_SOURCE_GROUNDED',
        }),
      },
      sources: index === 0 ? [{
        label: 'Primary statistical release',
        url: 'https://example.gov/release',
        type: 'primary_event',
        release_id: 'USDL-26-0000',
        event_time: clock,
      }] : [{
        id,
        label: 'Seiche',
        url: `https://seiche.info/dispatches/test-story-${index}`,
        fingerprint: 'a'.repeat(64),
      }],
    },
  }
}

function feedDocument(count = 105) {
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'my quant doesn’t speak english',
    home_page_url: 'https://myquantdoesntspeakenglish.com/',
    feed_url: TEST_FEED_URL,
    description: 'Test editorial archive',
    _mqdnse: {
      schema: 'mqdnse.web-feed.v1',
      itemSchema: 'mqdnse.web-feed-item.v1',
      authority: 'PUBLIC_EDITORIAL_ARCHIVE',
      appDistribution: 'SUSPENDED_SEPARATE_CHANNEL',
    },
    items: Array.from({ length: count }, (_, index) => feedStory(index)),
  }
}

function feedResponse(feed, headers = {}) {
  return new Response(JSON.stringify(feed), {
    status: 200,
    headers: { 'content-type': 'application/feed+json; charset=utf-8', ...headers },
  })
}

test('legacy initialize and session-bearing calls remain compatible without minting state', async () => {
  const initialized = await dispatch({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18' },
  })
  assert.equal(initialized.result.protocolVersion, '2025-06-18')

  const response = responseRecorder()
  await handler({
    method: 'POST',
    url: '/mcp',
    headers: {
      'mcp-protocol-version': '2025-06-18',
      'mcp-session-id': 'active-legacy-session',
    },
    body: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  }, response)
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['Mcp-Session-Id'], undefined)
  assert.deepEqual(JSON.parse(response.body).result.tools.map(({ name }) => name), [
    'list_capabilities', 'get_health', 'latest_stories', 'get_story', 'search_stories',
  ])
})

test('current protocol publishes per-request discovery metadata and read-only annotations', async () => {
  const response = responseRecorder()
  await handler(modernRequest(3, 'server/discover', {}, {
    origin: 'https://myquantdoesntspeakenglish.com',
  }), response)
  const body = JSON.parse(response.body)
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['Access-Control-Allow-Origin'], 'https://myquantdoesntspeakenglish.com')
  assert.equal(body.result.resultType, 'complete')
  assert.equal(body.result._meta['io.modelcontextprotocol/serverInfo'].version, '2.1.0')
  assert.ok(body.result.supportedVersions.includes('2025-06-18'))

  const list = await dispatch({ jsonrpc: '2.0', id: 4, method: 'tools/list' })
  assert.ok(list.result.tools.every(({ annotations }) => (
    annotations.readOnlyHint === true
      && annotations.destructiveHint === false
      && annotations.idempotentHint === true
  )))
})

test('current protocol validates routing metadata and structured tool arguments', async () => {
  const mismatch = responseRecorder()
  await handler(modernRequest(5, 'ping', {}, { 'mcp-method': 'tools/list' }), mismatch)
  assert.equal(mismatch.statusCode, 400)
  assert.equal(JSON.parse(mismatch.body).error.code, -32020)

  const invalidArguments = await dispatch({
    jsonrpc: '2.0', id: 6, method: 'tools/call',
    params: { name: 'get_health', arguments: [] },
  })
  assert.equal(invalidArguments.error.code, -32602)

  const toolCall = responseRecorder()
  await handler(modernRequest(7, 'tools/call', {
    name: 'list_capabilities',
    arguments: {},
  }, { 'mcp-name': 'list_capabilities' }), toolCall)
  const body = JSON.parse(toolCall.body)
  assert.equal(toolCall.statusCode, 200)
  assert.equal(body.result.isError, false)
  assert.equal(body.result.structuredContent.product.id, 'myquant-editorial')
})

test('MCP transport rejects foreign origins and oversized or unsupported requests', async () => {
  const foreign = responseRecorder()
  await handler({
    ...modernRequest(8, 'ping'),
    headers: {
      ...modernRequest(8, 'ping').headers,
      host: 'myquantdoesntspeakenglish.com',
      origin: 'https://attacker.example',
    },
  }, foreign)
  assert.equal(foreign.statusCode, 403)
  assert.equal(foreign.headers['Access-Control-Allow-Origin'], undefined)

  const oversized = responseRecorder()
  await handler({
    method: 'POST',
    headers: { 'content-length': String(16 * 1024 + 1) },
    body: { jsonrpc: '2.0', id: 9, method: 'ping' },
  }, oversized)
  assert.equal(oversized.statusCode, 413)

  const unsupported = responseRecorder()
  await handler({ method: 'GET', headers: {} }, unsupported)
  assert.equal(unsupported.statusCode, 405)
  assert.equal(unsupported.headers.Allow, 'POST, DELETE, OPTIONS')

  const terminated = responseRecorder()
  await handler({ method: 'DELETE', headers: { 'mcp-session-id': 'legacy-session' } }, terminated)
  assert.equal(terminated.statusCode, 204)
  assert.equal(terminated.body, '')
})

test('content tools read a bounded 105-record snapshot and preserve evidence and release fields', async () => {
  let fetches = 0
  const reader = createEditorialFeedReader({
    now: () => Date.UTC(2026, 7, 26),
    fetchImpl: async (url, options) => {
      fetches += 1
      assert.equal(url, TEST_FEED_URL)
      assert.equal(options.method, 'GET')
      assert.equal(options.redirect, 'error')
      return feedResponse(feedDocument())
    },
  })

  const latest = await reader.latestStories({ limit: 2 })
  assert.equal(latest.feed.item_count, 105)
  assert.equal(latest.count, 2)
  assert.match(latest.feed.content_sha256, /^[0-9a-f]{64}$/)
  assert.equal(latest.stories[0].id, latest.stories[0]._mqdnse.sourceRecordId)
  assert.equal(latest.stories[0]._mqdnse.evidence.publicationStatus, 'PUBLISHED')
  assert.equal(latest.stories[0]._mqdnse.sources[0].release_id, 'USDL-26-0000')
  assert.equal(latest.stories[1]._mqdnse.copy.qualityGate, 'PASSED')
  assert.match(latest.stories[1]._mqdnse.copy.whatChanged, /bounded source record/)
  assert.match(latest.stories[1]._mqdnse.copy.nextCheck, /next source record/)

  const exact = await reader.getStory({ id: 'myquant:test-release-story' })
  assert.equal(exact.story._mqdnse.sources[0].event_time, '2026-08-25T12:00:00.000Z')
  const searched = await reader.searchStories({ query: '  usdl-26-0000  ', limit: 5 })
  assert.equal(searched.query, 'usdl-26-0000')
  assert.deepEqual(searched.stories.map(({ id }) => id), ['myquant:test-release-story'])
  assert.equal(fetches, 1)
})

test('content tools enforce argument, result, and upstream body limits before returning content', async () => {
  let fetches = 0
  const reader = createEditorialFeedReader({
    fetchImpl: async () => {
      fetches += 1
      return feedResponse(feedDocument())
    },
  })

  await assert.rejects(reader.latestStories({ limit: 21 }), /limit must be an integer from 1 to 20/)
  await assert.rejects(reader.latestStories({ limit: 1, cursor: 'all' }), /Unsupported argument: cursor/)
  await assert.rejects(reader.searchStories({ query: 'x'.repeat(161) }), /query exceeds its safe text limit/)
  await assert.rejects(reader.searchStories({ query: Array.from({ length: 13 }, (_, index) => `t${index}`).join(' ') }), /at most 12 terms/)
  await assert.rejects(reader.getStory({ id: 'x'.repeat(257) }), /exceeds its safe text limit/)
  assert.equal(fetches, 0)

  const oversized = createEditorialFeedReader({
    fetchImpl: async () => feedResponse({}, {
      'content-length': String(EDITORIAL_FEED_LIMITS.maxBodyBytes + 1),
    }),
  })
  await assert.rejects(oversized.latestStories({}), /exceeds its response-body limit/)
})

test('content tools fail closed on identity, publication, ordering, and schema drift', async () => {
  const cases = [
    ['stable sourceRecordId', (feed) => { feed.items[0]._mqdnse.sourceRecordId = 'different-id' }, /stable sourceRecordId/],
    ['duplicate ID', (feed) => { feed.items[1] = structuredClone(feed.items[0]) }, /duplicated/],
    ['non-public status', (feed) => { feed.items[0]._mqdnse.evidence.publicationStatus = 'DRAFT' }, /must be PUBLISHED/],
    ['newest-first order', (feed) => { feed.items[1].date_published = '2026-08-26T00:00:00.000Z' }, /newest-first/],
    ['analysis-quality receipt', (feed) => { delete feed.items[1]._mqdnse.copy.whatChanged }, /analysis-quality receipt/],
    ['unknown item field', (feed) => { feed.items[0].privateDraft = true }, /unsupported field/],
  ]
  for (const [name, mutate, pattern] of cases) {
    const feed = feedDocument(2)
    mutate(feed)
    const reader = createEditorialFeedReader({ fetchImpl: async () => feedResponse(feed) })
    await assert.rejects(reader.latestStories({ limit: 1 }), pattern, name)
  }
})

test('REST discovery supports GET, HEAD, CORS preflight, and explicit errors', async () => {
  const capabilities = responseRecorder()
  await apiHandler({ method: 'GET', url: '/api/v1?resource=capabilities', headers: {} }, capabilities)
  const body = JSON.parse(capabilities.body)
  assert.equal(capabilities.statusCode, 200)
  assert.equal(capabilities.headers['Access-Control-Allow-Origin'], '*')
  assert.equal(body.data.product.id, 'myquant-editorial')

  const head = responseRecorder()
  await apiHandler({ method: 'HEAD', query: { resource: 'health' }, headers: {} }, head)
  assert.equal(head.statusCode, 200)
  assert.equal(head.body, '')

  const missing = responseRecorder()
  await apiHandler({ method: 'GET', query: { resource: 'private-state' }, headers: {} }, missing)
  assert.equal(missing.statusCode, 404)
  assert.equal(JSON.parse(missing.body).error, 'not_found')

  const preflight = responseRecorder()
  await apiHandler({ method: 'OPTIONS', headers: {} }, preflight)
  assert.equal(preflight.statusCode, 204)

  const write = responseRecorder()
  await apiHandler({ method: 'POST', headers: {} }, write)
  assert.equal(write.statusCode, 405)
  assert.equal(write.headers.Allow, 'GET, HEAD, OPTIONS')
})

test('product, REST, MCP, and deployed-source versions remain explicit', () => {
  assert.equal(CAPABILITIES.product.version, '0.1.0')
  assert.equal(CAPABILITIES.release.api_version, 'myquant.editorial/1.1')
  assert.equal(CAPABILITIES.release.mcp_version, '2.1.0')
  assert.equal(CAPABILITIES.release.state, 'available')
  assert.equal(CAPABILITIES.release.source_sha, null)
  assert.deepEqual(CAPABILITIES.surfaces.discovery, {
    openapi: 'https://myquantdoesntspeakenglish.com/openapi.json',
    ai_catalog: 'https://myquantdoesntspeakenglish.com/.well-known/ai-catalog.json',
    mcp: 'https://myquantdoesntspeakenglish.com/.well-known/mcp.json',
    registry_manifest: 'https://myquantdoesntspeakenglish.com/server.json',
  })
  assert.equal(getHealth().mcp_version, '2.1.0')
  assert.equal(getHealth().source_sha, null)
})
