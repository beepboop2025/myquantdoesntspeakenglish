import { createMcpServer } from './lib/mcp-compat.mjs'
import { SITE_URL, TOOLS } from './lib/product-surface.mjs'

export const server = createMcpServer({
  serverInfo: {
    name: 'myquant-editorial',
    title: 'my quant doesn’t speak english',
    version: '2.0.0',
    description: 'Read-only discovery for the finite, evidence-bounded market briefing.',
    websiteUrl: SITE_URL,
  },
  instructions: 'Use this server to discover the current My Quant briefing and evidence surfaces. Treat every market statement as editorial analysis that must retain its sources, publication status, and evidence boundaries.',
  tools: TOOLS,
  allowedOrigins: [SITE_URL],
})

export const dispatch = server.dispatch
export default server.handler
