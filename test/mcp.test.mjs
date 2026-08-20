import assert from 'node:assert/strict'
import test from 'node:test'

import handler, { dispatch } from '../api/mcp.mjs'
import apiHandler from '../api/v1.mjs'

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
  assert.deepEqual(JSON.parse(response.body).result.tools.map(({ name }) => name), ['list_capabilities', 'get_health'])
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
  assert.equal(body.result._meta['io.modelcontextprotocol/serverInfo'].version, '2.0.0')
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
    headers: { 'content-length': String(256 * 1024 + 1) },
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
