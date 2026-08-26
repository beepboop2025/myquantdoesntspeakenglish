import { createMcpServer } from './lib/mcp-compat.mjs'
import { MCP_VERSION, SITE_URL, TOOLS } from './lib/product-surface.mjs'

export const server = createMcpServer({
  serverInfo: {
    name: 'myquant-editorial',
    title: 'my quant doesn’t speak english',
    version: MCP_VERSION,
    description: 'Read-only discovery and bounded editorial content for the finite, evidence-bounded market briefing.',
    websiteUrl: SITE_URL,
  },
  instructions: 'Use this server to discover or read the current My Quant briefing. Address stories by their stable source IDs, keep every returned source, release ID, publication state, evidence clock, and limitation attached, and treat every market statement as editorial analysis rather than personalized advice.',
  tools: TOOLS,
  allowedOrigins: [SITE_URL],
  maxBodyBytes: 16 * 1024,
})

export const dispatch = server.dispatch
export default server.handler
