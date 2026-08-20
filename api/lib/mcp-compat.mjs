export const MCP_PROTOCOL_VERSION = '2026-07-28'
export const LEGACY_MCP_PROTOCOL_VERSIONS = Object.freeze([
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
])

const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  MCP_PROTOCOL_VERSION,
  ...LEGACY_MCP_PROTOCOL_VERSIONS,
])
const MAX_BODY_BYTES = 256 * 1024
const PROTOCOL_META = 'io.modelcontextprotocol/protocolVersion'
const CLIENT_CAPABILITIES_META = 'io.modelcontextprotocol/clientCapabilities'
const SERVER_INFO_META = 'io.modelcontextprotocol/serverInfo'

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function result(id, value, serverInfo, modern) {
  if (!modern) return { jsonrpc: '2.0', id, result: value }
  return {
    jsonrpc: '2.0',
    id,
    result: {
      ...value,
      resultType: value?.resultType ?? 'complete',
      _meta: {
        ...(value?._meta ?? {}),
        [SERVER_INFO_META]: serverInfo,
      },
    },
  }
}

function failure(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  }
}

function requestHeader(req, name) {
  const value = req.headers?.[name.toLowerCase()] ?? req.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

function decodeMirroredHeader(value) {
  if (typeof value !== 'string') return value
  if (!value.startsWith('=?base64?') || !value.endsWith('?=')) return value
  try {
    return Buffer.from(value.slice(9, -2), 'base64').toString('utf8')
  } catch {
    return null
  }
}

function requestOrigin(req) {
  const forwardedHost = String(requestHeader(req, 'x-forwarded-host') ?? '').split(',')[0].trim()
  const host = forwardedHost || requestHeader(req, 'host')
  if (!host) return null
  const forwardedProto = String(requestHeader(req, 'x-forwarded-proto') ?? '').split(',')[0].trim()
  const protocol = forwardedProto || (req.socket?.encrypted ? 'https' : 'http')
  return `${protocol}://${host}`
}

function setHeaders(req, res, allowedOrigins) {
  const origin = requestHeader(req, 'origin')
  const sameOrigin = origin && origin === requestOrigin(req)
  if (origin && (sameOrigin || allowedOrigins.has(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id',
  )
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

async function readBody(req, maxBodyBytes) {
  if (req.body !== undefined) return req.body
  if (!req[Symbol.asyncIterator]) return undefined
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > maxBodyBytes) {
      const error = new RangeError('Request body too large')
      error.code = 'MCP_BODY_TOO_LARGE'
      throw error
    }
    chunks.push(bytes)
  }
  return chunks.length ? Buffer.concat(chunks) : undefined
}

function parseBody(rawBody, maxBodyBytes) {
  if (!Buffer.isBuffer(rawBody) && (isRecord(rawBody) || Array.isArray(rawBody))) {
    const serialized = JSON.stringify(rawBody)
    if (Buffer.byteLength(serialized) > maxBodyBytes) throw new RangeError('Request body too large')
    return rawBody
  }
  if (rawBody === undefined || rawBody === null) throw new SyntaxError('Empty request body')
  const serialized = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)
  if (Buffer.byteLength(serialized) > maxBodyBytes) throw new RangeError('Request body too large')
  return JSON.parse(serialized)
}

function validateProtocolRequest(req, body) {
  const headerVersion = requestHeader(req, 'mcp-protocol-version')
  const bodyVersion = body?.params?._meta?.[PROTOCOL_META]
  const modern = headerVersion === MCP_PROTOCOL_VERSION
    || bodyVersion !== undefined
    || body?.method === 'server/discover'

  if (!modern) {
    if (headerVersion && !SUPPORTED_PROTOCOL_VERSIONS.has(headerVersion)) {
      return {
        error: failure(body?.id, -32022, `Unsupported MCP protocol version: ${headerVersion}`, {
          supported: [MCP_PROTOCOL_VERSION, ...LEGACY_MCP_PROTOCOL_VERSIONS],
          requested: headerVersion,
        }),
      }
    }
    return { modern: false }
  }

  if (!headerVersion || bodyVersion === undefined || headerVersion !== bodyVersion) {
    return { error: failure(body?.id, -32020, 'MCP-Protocol-Version must match params._meta protocolVersion.') }
  }
  if (headerVersion !== MCP_PROTOCOL_VERSION) {
    return {
      error: failure(body?.id, -32022, `Unsupported per-request MCP protocol version: ${headerVersion}`, {
        supported: [MCP_PROTOCOL_VERSION],
        requested: headerVersion,
      }),
    }
  }
  if (requestHeader(req, 'mcp-method') !== body?.method) {
    return { error: failure(body?.id, -32020, 'Mcp-Method must match the JSON-RPC method.') }
  }
  if (!isRecord(body?.params?._meta?.[CLIENT_CAPABILITIES_META])) {
    return { error: failure(body?.id, -32602, 'params._meta clientCapabilities must be an object.') }
  }
  if (body?.method === 'tools/call') {
    const mirroredName = decodeMirroredHeader(requestHeader(req, 'mcp-name'))
    if (mirroredName === null || mirroredName !== body?.params?.name) {
      return { error: failure(body?.id, -32020, 'Mcp-Name must match params.name for tools/call.') }
    }
  }
  return { modern: true }
}

/**
 * @param {{
 *   serverInfo: Record<string, unknown>,
 *   instructions: string,
 *   tools: Record<string, {
 *     title: string,
 *     description: string,
 *     inputSchema: Record<string, unknown>,
 *     outputSchema?: Record<string, unknown>,
 *     annotations?: Record<string, unknown>,
 *     call: (args: Record<string, unknown>) => unknown | Promise<unknown>
 *   }>,
 *   allowedOrigins?: string[],
 *   maxBodyBytes?: number,
 *   cacheTtlMs?: number
 * }} config
 */
export function createMcpServer({
  serverInfo,
  instructions,
  tools,
  allowedOrigins = [],
  maxBodyBytes = MAX_BODY_BYTES,
  cacheTtlMs = 300_000,
}) {
  const allowedOriginSet = new Set(allowedOrigins)
  const toolEntries = Object.entries(tools)
  const listedTools = toolEntries.map(([name, tool]) => ({
    name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      ...(tool.annotations ?? {}),
    },
  }))

  async function dispatch(message, { modern = false } = {}) {
    if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return failure(null, -32600, 'Invalid Request')
    }
    if (!Object.hasOwn(message, 'id')) return null

    const { id = null, method, params = {} } = message
    if (method === 'initialize') {
      const requested = params?.protocolVersion
      const protocolVersion = LEGACY_MCP_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : LEGACY_MCP_PROTOCOL_VERSIONS[0]
      return result(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo,
        instructions,
      }, serverInfo, false)
    }
    if (method === 'server/discover' && modern) {
      return result(id, {
        supportedVersions: [MCP_PROTOCOL_VERSION, ...LEGACY_MCP_PROTOCOL_VERSIONS],
        capabilities: { tools: { listChanged: false } },
        instructions,
        ttlMs: cacheTtlMs,
        cacheScope: 'public',
      }, serverInfo, true)
    }
    if (method === 'ping') return result(id, {}, serverInfo, modern)
    if (method === 'tools/list') {
      return result(id, {
        tools: listedTools,
        ...(modern ? { ttlMs: cacheTtlMs, cacheScope: 'public' } : {}),
      }, serverInfo, modern)
    }
    if (method === 'tools/call') {
      if (!isRecord(params) || typeof params.name !== 'string' || !isRecord(params.arguments ?? {})) {
        return failure(id, -32602, 'tools/call requires a tool name and object arguments.')
      }
      const tool = tools[params.name]
      if (!tool) return failure(id, -32602, `Unknown tool: ${params.name}`)
      try {
        const data = await tool.call(params.arguments ?? {})
        return result(id, {
          content: [{ type: 'text', text: JSON.stringify(data) }],
          structuredContent: data,
          isError: false,
        }, serverInfo, modern)
      } catch (error) {
        const safeMessage = error instanceof TypeError || error instanceof RangeError
          ? error.message
          : 'The public product surface is temporarily unavailable.'
        return result(id, {
          content: [{ type: 'text', text: safeMessage }],
          isError: true,
        }, serverInfo, modern)
      }
    }
    return failure(id, -32601, 'Method not found')
  }

  async function handler(req, res) {
    setHeaders(req, res, allowedOriginSet)
    const origin = requestHeader(req, 'origin')
    if (origin && origin !== requestOrigin(req) && !allowedOriginSet.has(origin)) {
      res.statusCode = 403
      res.end(`${JSON.stringify(failure(null, -32600, 'Origin not allowed'))}\n`)
      return
    }
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method === 'DELETE' && requestHeader(req, 'mcp-session-id')) {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, DELETE, OPTIONS')
      res.statusCode = 405
      res.end(`${JSON.stringify(failure(null, -32600, 'POST required'))}\n`)
      return
    }

    const length = Number.parseInt(requestHeader(req, 'content-length') ?? '0', 10)
    if (Number.isFinite(length) && length > maxBodyBytes) {
      res.statusCode = 413
      res.end(`${JSON.stringify(failure(null, -32600, 'Request body too large'))}\n`)
      return
    }

    try {
      const body = parseBody(await readBody(req, maxBodyBytes), maxBodyBytes)
      const validation = validateProtocolRequest(req, body)
      if (validation.error) {
        res.statusCode = 400
        res.end(`${JSON.stringify(validation.error)}\n`)
        return
      }
      const response = await dispatch(body, { modern: validation.modern })
      res.statusCode = response === null
        ? 202
        : validation.modern && response?.error?.code === -32601
          ? 404
          : 200
      res.end(response === null ? '' : `${JSON.stringify(response)}\n`)
    } catch (error) {
      const oversized = error?.code === 'MCP_BODY_TOO_LARGE'
        || (error instanceof RangeError && error.message === 'Request body too large')
      res.statusCode = oversized ? 413 : 400
      res.end(`${JSON.stringify(failure(null, oversized ? -32600 : -32700, oversized ? 'Request body too large' : 'Parse error'))}\n`)
    }
  }

  return { dispatch, handler, listedTools }
}
