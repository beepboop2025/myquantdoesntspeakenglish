import {
  LEGACY_MCP_PROTOCOL_VERSIONS,
  MCP_PROTOCOL_VERSION,
} from './mcp-compat.mjs'

export const SITE_URL = (process.env.MYQUANT_SITE_URL || 'https://myquantdoesntspeakenglish.com').replace(/\/$/, '')
export const API_VERSION = 'myquant.editorial/1.1'

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
    updated_at: '2026-08-20',
    compatibility: 'additive',
    existing_routes_unchanged: true,
  },
  features: [
    { id: 'finite-briefing', title: 'Finite briefing', status: 'available', description: 'Publishes up to five ranked market stories instead of an infinite feed.' },
    { id: 'evidence-network', title: 'Evidence network', status: 'available', description: 'Carries provenance, editorial status, publication gates, and correction propagation.' },
    { id: 'app-feed', title: 'Versioned app feed', status: 'available', description: 'Serves a validated, correction-aware feed for the mobile and web app.' },
  ],
  surfaces: {
    web: SITE_URL,
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
      tools: ['list_capabilities', 'get_health'],
    },
  },
  session_compatibility: {
    mcp: 'Legacy Mcp-Session-Id values are accepted without rotation; the public MCP surface is stateless.',
    product: 'The editorial site has no account session, and the existing app-feed contract is unchanged.',
  },
  boundaries: [
    'Public editorial and product metadata only.',
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
    session_mode: 'stateless-compatible',
    checked_at: new Date().toISOString(),
  }
}

export const TOOLS = Object.freeze({
  list_capabilities: {
    title: 'Discover the My Quant editorial product',
    description: 'List the current briefing, evidence-network, app-feed, API, MCP, and interpretation boundaries.',
    inputSchema: { type: 'object', additionalProperties: false },
    call: async () => CAPABILITIES,
  },
  get_health: {
    title: 'Check the My Quant public surfaces',
    description: 'Return a non-sensitive API and MCP compatibility heartbeat without reading or changing user state.',
    inputSchema: { type: 'object', additionalProperties: false },
    call: async () => getHealth(),
  },
})
