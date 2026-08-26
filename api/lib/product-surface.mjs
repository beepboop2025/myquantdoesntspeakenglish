import { createHash } from 'node:crypto'

import {
  LEGACY_MCP_PROTOCOL_VERSIONS,
  MCP_PROTOCOL_VERSION,
} from './mcp-compat.mjs'

export const SITE_URL = (process.env.MYQUANT_SITE_URL || 'https://myquantdoesntspeakenglish.com').replace(/\/$/, '')
export const API_VERSION = 'myquant.editorial/1.1'
export const MCP_VERSION = '2.1.0'

export const EDITORIAL_FEED_LIMITS = Object.freeze({
  cacheTtlMs: 60_000,
  timeoutMs: 8_000,
  maxBodyBytes: 512 * 1024,
  maxFeedItems: 1_000,
  defaultResultLimit: 10,
  maxResultLimit: 20,
  maxToolResponseBytes: 128 * 1024,
  maxQueryCharacters: 160,
  maxQueryBytes: 512,
  maxQueryTerms: 12,
  maxIdCharacters: 256,
})

const FEED_VERSION = 'https://jsonfeed.org/version/1.1'
const FEED_SCHEMA = 'mqdnse.web-feed.v1'
const FEED_ITEM_SCHEMA = 'mqdnse.web-feed-item.v1'
const FEED_AUTHORITY = 'PUBLIC_EDITORIAL_ARCHIVE'
const APP_DISTRIBUTION = 'SUSPENDED_SEPARATE_CHANNEL'
const ITEM_KEYS = new Set(['id', 'url', 'external_url', 'title', 'summary', 'date_published', 'tags', '_mqdnse'])
const ITEM_META_KEYS = new Set([
  'schema', 'lane', 'product', 'beat', 'editorialClass', 'articleType', 'sourceRecordId',
  'sourceUrl', 'evidence', 'copy', 'sources', 'newsGate',
])
const EVIDENCE_KEYS = new Set([
  'status', 'eventTime', 'knowledgeTime', 'publicationStatus', 'contribution', 'limitation',
  'sourceFingerprint', 'corrections',
])
const COPY_KEYS = new Set([
  'state', 'inEnglish', 'whyItMatters', 'uncertainty', 'whatChanged', 'nextCheck',
  'qualityGate', 'method', 'keyNumber',
])
const KEY_NUMBER_KEYS = new Set(['value', 'label'])
const SOURCE_KEYS = new Set(['id', 'label', 'url', 'fingerprint', 'type', 'release_id', 'event_time'])
const CORRECTION_KEYS = new Set(['correctedAt', 'fields', 'note'])
const NEWS_GATE_KEYS = new Set([
  'networkRelevance', 'countercase', 'falsifier', 'revisionRisk', 'forecastBoundary',
  'recommendationStatus',
])

function deployedSourceSha() {
  const value = process.env.VERCEL_GIT_COMMIT_SHA || ''
  return /^[0-9a-f]{40}$/.test(value) ? value : null
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertRecord(value, path) {
  if (!isRecord(value)) throw new TypeError(`${path} must be an object`)
  return value
}

function assertKnownKeys(value, allowed, path) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key))
  if (unknown.length) throw new TypeError(`${path} has unsupported field: ${unknown[0]}`)
}

function requiredString(value, path, maxCharacters = 8_192) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${path} must be a non-empty trimmed string`)
  }
  if (value.length > maxCharacters || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)) {
    throw new RangeError(`${path} exceeds its safe text limit`)
  }
  return value
}

function httpsUrl(value, path) {
  const text = requiredString(value, path, 2_048)
  let parsed
  try {
    parsed = new URL(text)
  } catch {
    throw new TypeError(`${path} must be an absolute HTTPS URL`)
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new TypeError(`${path} must be an absolute HTTPS URL without credentials`)
  }
  return parsed.href
}

function isoClock(value, path) {
  const text = requiredString(value, path, 64)
  if (!Number.isFinite(Date.parse(text))) throw new TypeError(`${path} must be an ISO-8601 timestamp`)
  return text
}

function fingerprint(value, path) {
  const text = requiredString(value, path, 64)
  if (!/^[0-9a-f]{64}$/u.test(text)) throw new TypeError(`${path} must be a lowercase SHA-256 digest`)
  return text
}

function validateCorrection(value, path) {
  const correction = assertRecord(value, path)
  assertKnownKeys(correction, CORRECTION_KEYS, path)
  if (!Array.isArray(correction.fields) || correction.fields.length === 0 || correction.fields.length > 32) {
    throw new RangeError(`${path}.fields must contain 1 to 32 field names`)
  }
  return {
    correctedAt: isoClock(correction.correctedAt, `${path}.correctedAt`),
    fields: correction.fields.map((field, index) => requiredString(field, `${path}.fields[${index}]`, 128)),
    note: requiredString(correction.note, `${path}.note`, 2_048),
  }
}

function validateEvidence(value, path) {
  const evidence = assertRecord(value, path)
  assertKnownKeys(evidence, EVIDENCE_KEYS, path)
  const publicationStatus = requiredString(evidence.publicationStatus, `${path}.publicationStatus`, 64)
  if (publicationStatus !== 'PUBLISHED') throw new TypeError(`${path}.publicationStatus must be PUBLISHED`)
  const result = {
    status: requiredString(evidence.status, `${path}.status`, 128),
    eventTime: isoClock(evidence.eventTime, `${path}.eventTime`),
    knowledgeTime: isoClock(evidence.knowledgeTime, `${path}.knowledgeTime`),
    publicationStatus,
    contribution: requiredString(evidence.contribution, `${path}.contribution`, 4_096),
    limitation: requiredString(evidence.limitation, `${path}.limitation`, 4_096),
    sourceFingerprint: fingerprint(evidence.sourceFingerprint, `${path}.sourceFingerprint`),
  }
  if (evidence.corrections !== undefined) {
    if (!Array.isArray(evidence.corrections) || evidence.corrections.length > 32) {
      throw new RangeError(`${path}.corrections must contain at most 32 entries`)
    }
    result.corrections = evidence.corrections.map((entry, index) => validateCorrection(entry, `${path}.corrections[${index}]`))
  }
  return result
}

function validateCopy(value, path) {
  const copy = assertRecord(value, path)
  assertKnownKeys(copy, COPY_KEYS, path)
  const result = {
    state: requiredString(copy.state, `${path}.state`, 128),
    inEnglish: requiredString(copy.inEnglish, `${path}.inEnglish`, 8_192),
    whyItMatters: requiredString(copy.whyItMatters, `${path}.whyItMatters`, 8_192),
    uncertainty: requiredString(copy.uncertainty, `${path}.uncertainty`, 8_192),
    ...(copy.whatChanged === undefined ? {} : {
      whatChanged: requiredString(copy.whatChanged, `${path}.whatChanged`, 8_192),
    }),
    ...(copy.nextCheck === undefined ? {} : {
      nextCheck: requiredString(copy.nextCheck, `${path}.nextCheck`, 8_192),
    }),
    ...(copy.qualityGate === undefined ? {} : {
      qualityGate: requiredString(copy.qualityGate, `${path}.qualityGate`, 64),
    }),
    ...(copy.method === undefined ? {} : {
      method: requiredString(copy.method, `${path}.method`, 128),
    }),
  }
  if (result.qualityGate !== undefined && result.qualityGate !== 'PASSED') {
    throw new TypeError(`${path}.qualityGate must be PASSED when published`)
  }
  if (copy.keyNumber !== undefined) {
    const keyNumber = assertRecord(copy.keyNumber, `${path}.keyNumber`)
    assertKnownKeys(keyNumber, KEY_NUMBER_KEYS, `${path}.keyNumber`)
    result.keyNumber = {
      value: requiredString(keyNumber.value, `${path}.keyNumber.value`, 256),
      label: requiredString(keyNumber.label, `${path}.keyNumber.label`, 1_024),
    }
  }
  return result
}

function validateSource(value, path) {
  const source = assertRecord(value, path)
  assertKnownKeys(source, SOURCE_KEYS, path)
  return {
    ...(source.id === undefined ? {} : { id: requiredString(source.id, `${path}.id`, 256) }),
    label: requiredString(source.label, `${path}.label`, 1_024),
    url: httpsUrl(source.url, `${path}.url`),
    ...(source.fingerprint === undefined ? {} : { fingerprint: fingerprint(source.fingerprint, `${path}.fingerprint`) }),
    ...(source.type === undefined ? {} : { type: requiredString(source.type, `${path}.type`, 128) }),
    ...(source.release_id === undefined ? {} : { release_id: requiredString(source.release_id, `${path}.release_id`, 256) }),
    ...(source.event_time === undefined ? {} : { event_time: isoClock(source.event_time, `${path}.event_time`) }),
  }
}

function validateNewsGate(value, path) {
  const gate = assertRecord(value, path)
  assertKnownKeys(gate, NEWS_GATE_KEYS, path)
  return Object.fromEntries([...NEWS_GATE_KEYS].map((key) => [
    key,
    requiredString(gate[key], `${path}.${key}`, 8_192),
  ]))
}

function validateStory(value, index) {
  const path = `feed.items[${index}]`
  const story = assertRecord(value, path)
  assertKnownKeys(story, ITEM_KEYS, path)
  const meta = assertRecord(story._mqdnse, `${path}._mqdnse`)
  assertKnownKeys(meta, ITEM_META_KEYS, `${path}._mqdnse`)
  const id = requiredString(story.id, `${path}.id`, EDITORIAL_FEED_LIMITS.maxIdCharacters)
  const sourceRecordId = requiredString(meta.sourceRecordId, `${path}._mqdnse.sourceRecordId`, EDITORIAL_FEED_LIMITS.maxIdCharacters)
  if (id !== sourceRecordId) throw new TypeError(`${path}.id must match its stable sourceRecordId`)
  if (meta.schema !== FEED_ITEM_SCHEMA) throw new TypeError(`${path} has an unsupported item schema`)
  if (!Array.isArray(story.tags) || story.tags.length === 0 || story.tags.length > 16) {
    throw new RangeError(`${path}.tags must contain 1 to 16 entries`)
  }
  if (!Array.isArray(meta.sources) || meta.sources.length === 0 || meta.sources.length > 12) {
    throw new RangeError(`${path}._mqdnse.sources must contain 1 to 12 sources`)
  }
  const lane = requiredString(meta.lane, `${path}._mqdnse.lane`, 128)
  const copy = validateCopy(meta.copy, `${path}._mqdnse.copy`)
  if (lane === 'INTERPRETED'
    && (!copy.whatChanged || !copy.nextCheck || copy.qualityGate !== 'PASSED' || !copy.method)) {
    throw new TypeError(`${path} interpreted copy is missing its analysis-quality receipt`)
  }
  return {
    id,
    url: httpsUrl(story.url, `${path}.url`),
    ...(story.external_url === undefined ? {} : { external_url: httpsUrl(story.external_url, `${path}.external_url`) }),
    title: requiredString(story.title, `${path}.title`, 1_024),
    summary: requiredString(story.summary, `${path}.summary`, 8_192),
    date_published: isoClock(story.date_published, `${path}.date_published`),
    tags: story.tags.map((tag, tagIndex) => requiredString(tag, `${path}.tags[${tagIndex}]`, 128)),
    _mqdnse: {
      schema: meta.schema,
      lane,
      product: requiredString(meta.product, `${path}._mqdnse.product`, 128),
      beat: requiredString(meta.beat, `${path}._mqdnse.beat`, 256),
      editorialClass: requiredString(meta.editorialClass, `${path}._mqdnse.editorialClass`, 256),
      articleType: requiredString(meta.articleType, `${path}._mqdnse.articleType`, 256),
      sourceRecordId,
      sourceUrl: httpsUrl(meta.sourceUrl, `${path}._mqdnse.sourceUrl`),
      evidence: validateEvidence(meta.evidence, `${path}._mqdnse.evidence`),
      copy,
      sources: meta.sources.map((source, sourceIndex) => validateSource(source, `${path}._mqdnse.sources[${sourceIndex}]`)),
      ...(meta.newsGate === undefined ? {} : { newsGate: validateNewsGate(meta.newsGate, `${path}._mqdnse.newsGate`) }),
    },
  }
}

function validateFeed(value, expectedFeedUrl) {
  const feed = assertRecord(value, 'feed')
  if (feed.version !== FEED_VERSION) throw new TypeError('feed.version is unsupported')
  if (httpsUrl(feed.feed_url, 'feed.feed_url') !== expectedFeedUrl) {
    throw new TypeError('feed.feed_url does not match the configured editorial feed')
  }
  const metadata = assertRecord(feed._mqdnse, 'feed._mqdnse')
  if (metadata.schema !== FEED_SCHEMA
    || metadata.itemSchema !== FEED_ITEM_SCHEMA
    || metadata.authority !== FEED_AUTHORITY
    || metadata.appDistribution !== APP_DISTRIBUTION) {
    throw new TypeError('feed._mqdnse does not match the public editorial archive contract')
  }
  if (!Array.isArray(feed.items) || feed.items.length === 0 || feed.items.length > EDITORIAL_FEED_LIMITS.maxFeedItems) {
    throw new RangeError(`feed.items must contain 1 to ${EDITORIAL_FEED_LIMITS.maxFeedItems} records`)
  }
  const items = feed.items.map(validateStory)
  const ids = new Set()
  let previousClock = Number.POSITIVE_INFINITY
  for (const [index, story] of items.entries()) {
    if (ids.has(story.id)) throw new TypeError(`feed.items[${index}].id is duplicated`)
    ids.add(story.id)
    const clock = Date.parse(story.date_published)
    if (clock > previousClock) throw new TypeError('feed.items must remain newest-first')
    previousClock = clock
  }
  return {
    metadata: {
      schema: metadata.schema,
      item_schema: metadata.itemSchema,
      authority: metadata.authority,
      app_distribution: metadata.appDistribution,
    },
    items,
  }
}

async function readBoundedBody(response, maxBodyBytes) {
  const declared = Number.parseInt(response.headers?.get?.('content-length') ?? '', 10)
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    throw new RangeError('The editorial feed exceeds its response-body limit')
  }
  const chunks = []
  let size = 0
  if (response.body?.[Symbol.asyncIterator]) {
    for await (const chunk of response.body) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.length
      if (size > maxBodyBytes) throw new RangeError('The editorial feed exceeds its response-body limit')
      chunks.push(bytes)
    }
    return Buffer.concat(chunks).toString('utf8')
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > maxBodyBytes) throw new RangeError('The editorial feed exceeds its response-body limit')
  return bytes.toString('utf8')
}

function assertArguments(args, allowed) {
  const value = assertRecord(args, 'arguments')
  const unknown = Object.keys(value).filter((key) => !allowed.has(key))
  if (unknown.length) throw new TypeError(`Unsupported argument: ${unknown[0]}`)
  return value
}

function resultLimit(value) {
  if (value === undefined) return EDITORIAL_FEED_LIMITS.defaultResultLimit
  if (!Number.isInteger(value) || value < 1 || value > EDITORIAL_FEED_LIMITS.maxResultLimit) {
    throw new RangeError(`limit must be an integer from 1 to ${EDITORIAL_FEED_LIMITS.maxResultLimit}`)
  }
  return value
}

function searchQuery(value) {
  if (typeof value !== 'string') throw new TypeError('query must be a string')
  const query = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  if (!query) throw new TypeError('query must not be empty')
  if (query.length > EDITORIAL_FEED_LIMITS.maxQueryCharacters
    || Buffer.byteLength(query) > EDITORIAL_FEED_LIMITS.maxQueryBytes) {
    throw new RangeError('query exceeds its safe text limit')
  }
  const terms = query.toLocaleLowerCase('en-US').split(' ')
  if (terms.length > EDITORIAL_FEED_LIMITS.maxQueryTerms) {
    throw new RangeError(`query must contain at most ${EDITORIAL_FEED_LIMITS.maxQueryTerms} terms`)
  }
  return { query, terms }
}

function searchText(story) {
  return [
    story.id,
    story.title,
    story.summary,
    ...story.tags,
    story._mqdnse.product,
    story._mqdnse.beat,
    story._mqdnse.evidence.status,
    story._mqdnse.evidence.contribution,
    ...story._mqdnse.sources.flatMap((source) => [source.label, source.id ?? '', source.release_id ?? '']),
  ].join('\n').normalize('NFKC').toLocaleLowerCase('en-US')
}

function boundedResult(value) {
  if (Buffer.byteLength(JSON.stringify(value)) > EDITORIAL_FEED_LIMITS.maxToolResponseBytes) {
    throw new RangeError('The editorial tool response exceeds its safe body limit')
  }
  return value
}

export function createEditorialFeedReader({
  fetchImpl = globalThis.fetch,
  feedUrl = `${SITE_URL}/feed.json`,
  now = Date.now,
  cacheTtlMs = EDITORIAL_FEED_LIMITS.cacheTtlMs,
  timeoutMs = EDITORIAL_FEED_LIMITS.timeoutMs,
  maxBodyBytes = EDITORIAL_FEED_LIMITS.maxBodyBytes,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function')
  const canonicalFeedUrl = httpsUrl(feedUrl, 'feedUrl')
  let cached = null
  let pending = null

  async function load() {
    const clock = Number(now())
    if (!Number.isFinite(clock)) throw new TypeError('now() must return a finite epoch value')
    if (cached && clock - cached.loadedAt < cacheTtlMs) return cached.snapshot
    if (pending) return pending
    pending = (async () => {
      const response = await fetchImpl(canonicalFeedUrl, {
        method: 'GET',
        headers: { Accept: 'application/feed+json, application/json;q=0.9' },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response?.ok || response.status !== 200) throw new TypeError('The editorial feed did not return HTTP 200')
      const contentType = response.headers?.get?.('content-type') ?? ''
      if (!/^application\/(?:feed\+)?json(?:\s*;|$)/iu.test(contentType)) {
        throw new TypeError('The editorial feed did not return JSON')
      }
      const body = await readBoundedBody(response, maxBodyBytes)
      let parsed
      try {
        parsed = JSON.parse(body)
      } catch {
        throw new TypeError('The editorial feed is not valid JSON')
      }
      const validated = validateFeed(parsed, canonicalFeedUrl)
      const snapshot = {
        ...validated,
        receipt: {
          url: canonicalFeedUrl,
          ...validated.metadata,
          content_sha256: createHash('sha256').update(body).digest('hex'),
          item_count: validated.items.length,
          fetched_at: new Date(clock).toISOString(),
        },
      }
      cached = { loadedAt: clock, snapshot }
      return snapshot
    })()
    try {
      return await pending
    } finally {
      pending = null
    }
  }

  function envelope(snapshot) {
    return {
      schema: 'myquant.editorial-content.v1',
      release: {
        mcp_version: MCP_VERSION,
        source_sha: deployedSourceSha(),
      },
      feed: snapshot.receipt,
    }
  }

  return Object.freeze({
    async latestStories(args = {}) {
      const input = assertArguments(args, new Set(['limit']))
      const limit = resultLimit(input.limit)
      const snapshot = await load()
      const stories = snapshot.items.slice(0, limit)
      return boundedResult({ ...envelope(snapshot), count: stories.length, stories })
    },
    async getStory(args = {}) {
      const input = assertArguments(args, new Set(['id']))
      const id = requiredString(input.id, 'id', EDITORIAL_FEED_LIMITS.maxIdCharacters)
      const snapshot = await load()
      const story = snapshot.items.find((item) => item.id === id)
      if (!story) throw new TypeError('No published story matches that stable ID')
      return boundedResult({ ...envelope(snapshot), story })
    },
    async searchStories(args = {}) {
      const input = assertArguments(args, new Set(['query', 'limit']))
      const { query, terms } = searchQuery(input.query)
      const limit = resultLimit(input.limit)
      const snapshot = await load()
      const stories = snapshot.items
        .filter((story) => {
          const haystack = searchText(story)
          return terms.every((term) => haystack.includes(term))
        })
        .slice(0, limit)
      return boundedResult({ ...envelope(snapshot), query, count: stories.length, stories })
    },
  })
}

const editorialFeed = createEditorialFeedReader()

export const CAPABILITIES = Object.freeze({
  schema: 'product.capabilities.v1',
  product: {
    id: 'myquant-editorial',
    name: 'my quant doesn’t speak english',
    version: '0.1.0',
    url: SITE_URL,
    description: 'A finite market briefing that translates technical stories into ordinary English with sources and evidence boundaries attached.',
  },
  release: {
    api_version: API_VERSION,
    mcp_version: MCP_VERSION,
    source_sha: deployedSourceSha(),
    updated_at: '2026-08-26',
    compatibility: 'additive',
    existing_routes_unchanged: true,
    state: 'available',
  },
  features: [
    { id: 'finite-briefing', title: 'Finite briefing', status: 'available', description: 'Publishes up to five ranked market stories instead of an infinite feed.' },
    { id: 'evidence-network', title: 'Evidence network', status: 'available', description: 'Carries provenance, editorial status, publication gates, and correction propagation.' },
    { id: 'app-feed', title: 'Versioned app feed', status: 'available', description: 'Serves a validated, correction-aware feed for the mobile and web app.' },
    { id: 'editorial-content-mcp', title: 'Editorial content MCP', status: 'available', description: 'Adds bounded latest, exact-ID, and search reads over the public editorial archive.' },
  ],
  surfaces: {
    web: SITE_URL,
    editorial_feed: `${SITE_URL}/feed.json`,
    app_feed: `${SITE_URL}/app-feed/v1.json`,
    api: {
      capabilities: `${SITE_URL}/api/v1/capabilities`,
      health: `${SITE_URL}/api/v1/health`,
    },
    mcp: {
      endpoint: `${SITE_URL}/mcp`,
      transport: 'streamable-http',
      protocol_version: MCP_PROTOCOL_VERSION,
      legacy_protocol_versions: LEGACY_MCP_PROTOCOL_VERSIONS,
      tools: ['list_capabilities', 'get_health', 'latest_stories', 'get_story', 'search_stories'],
      content_limits: {
        default_results: EDITORIAL_FEED_LIMITS.defaultResultLimit,
        max_results: EDITORIAL_FEED_LIMITS.maxResultLimit,
        max_query_characters: EDITORIAL_FEED_LIMITS.maxQueryCharacters,
        max_feed_body_bytes: EDITORIAL_FEED_LIMITS.maxBodyBytes,
      },
    },
    discovery: {
      openapi: `${SITE_URL}/openapi.json`,
      ai_catalog: `${SITE_URL}/.well-known/ai-catalog.json`,
      mcp: `${SITE_URL}/.well-known/mcp.json`,
      registry_manifest: `${SITE_URL}/server.json`,
    },
  },
  session_compatibility: {
    mcp: 'Legacy Mcp-Session-Id values are accepted without rotation; the public MCP surface is stateless.',
    product: 'The editorial site has no account session, and the existing app-feed contract is unchanged.',
  },
  boundaries: [
    'Public editorial and product metadata only.',
    'Content tools read only the validated public web archive; the separate mobile app channel remains suspended.',
    'No personalized investment advice, brokerage action, portfolio import, or account data.',
    'Sources and publication status must be checked before relying on a market claim.',
  ],
})

export function getHealth() {
  return {
    schema: 'product.health.v1',
    ok: true,
    product: CAPABILITIES.product.id,
    api_version: API_VERSION,
    mcp_protocol_version: MCP_PROTOCOL_VERSION,
    mcp_version: MCP_VERSION,
    source_sha: deployedSourceSha(),
    session_mode: 'stateless-compatible',
    checked_at: new Date().toISOString(),
  }
}

const resultListSchema = {
  type: 'object',
  required: ['schema', 'release', 'feed', 'count', 'stories'],
  properties: {
    schema: { const: 'myquant.editorial-content.v1' },
    release: { type: 'object' },
    feed: { type: 'object' },
    count: { type: 'integer', minimum: 0, maximum: EDITORIAL_FEED_LIMITS.maxResultLimit },
    stories: { type: 'array', maxItems: EDITORIAL_FEED_LIMITS.maxResultLimit, items: { type: 'object' } },
  },
}

export const TOOLS = Object.freeze({
  list_capabilities: {
    title: 'Discover the My Quant editorial product',
    description: 'List the current briefing, evidence-network, app-feed, API, MCP, content limits, and interpretation boundaries.',
    inputSchema: { type: 'object', additionalProperties: false },
    call: async () => CAPABILITIES,
  },
  get_health: {
    title: 'Check the My Quant public surfaces',
    description: 'Return a non-sensitive API and MCP compatibility heartbeat without reading or changing user state.',
    inputSchema: { type: 'object', additionalProperties: false },
    call: async () => getHealth(),
  },
  latest_stories: {
    title: 'Read the latest evidence-bounded stories',
    description: 'Return a bounded newest-first slice of the validated public editorial feed, retaining source, evidence, publication, and release fields.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: EDITORIAL_FEED_LIMITS.maxResultLimit, default: EDITORIAL_FEED_LIMITS.defaultResultLimit } },
      additionalProperties: false,
    },
    outputSchema: resultListSchema,
    call: (args) => editorialFeed.latestStories(args),
  },
  get_story: {
    title: 'Read one story by stable source ID',
    description: 'Return one validated public story by its exact stable ID, including its canonical sources, evidence clocks, publication state, and release IDs.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', minLength: 1, maxLength: EDITORIAL_FEED_LIMITS.maxIdCharacters } },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      required: ['schema', 'release', 'feed', 'story'],
      properties: {
        schema: { const: 'myquant.editorial-content.v1' },
        release: { type: 'object' },
        feed: { type: 'object' },
        story: { type: 'object' },
      },
    },
    call: (args) => editorialFeed.getStory(args),
  },
  search_stories: {
    title: 'Search evidence-bounded stories',
    description: 'Search title, summary, tags, product, beat, evidence status, contribution, source labels, and source release IDs without expanding the result limit.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, maxLength: EDITORIAL_FEED_LIMITS.maxQueryCharacters },
        limit: { type: 'integer', minimum: 1, maximum: EDITORIAL_FEED_LIMITS.maxResultLimit, default: EDITORIAL_FEED_LIMITS.defaultResultLimit },
      },
      additionalProperties: false,
    },
    outputSchema: {
      ...resultListSchema,
      required: [...resultListSchema.required, 'query'],
      properties: { ...resultListSchema.properties, query: { type: 'string' } },
    },
    call: (args) => editorialFeed.searchStories(args),
  },
})
