import { MCPClient } from '@mastra/mcp'

/**
 * Fabrick's hosted CoinDesk MCP server (SvelteKit-served at
 * /mcp/coindesk). Exposes news_get_articles + news_get_categories,
 * wrapping CoinDesk's free unauthenticated `/news/v1/article/list` and
 * `/news/v1/category/list` endpoints.
 *
 * Multicoin by design — orchestrator decides which category to query.
 */
const COINDESK_MCP_URL = `${process.env.FABRICK_MCP_BASE_URL ?? 'http://127.0.0.1:5173'}/mcp/coindesk`

export const coindeskMcpClient = new MCPClient({
	id: 'coindesk-mcp-client',
	timeout: 60_000,
	servers: {
		coindesk: { url: new URL(COINDESK_MCP_URL) }
	}
})

export async function getCoindeskTools() {
	return await coindeskMcpClient.listTools()
}
