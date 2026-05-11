import { MCPClient } from '@mastra/mcp'

/**
 * Fabrick's hosted Jupiter MCP server (SvelteKit-served at /mcp/jupiter).
 * Exposes jupiter_get_prices and jupiter_search_tokens.
 *
 * The base URL defaults to localhost for dev; override with
 * FABRICK_MCP_BASE_URL when the SvelteKit app is reachable elsewhere.
 */
const JUPITER_MCP_URL = `${process.env.FABRICK_MCP_BASE_URL ?? 'http://127.0.0.1:5173'}/mcp/jupiter`

export const jupiterMcpClient = new MCPClient({
	id: 'jupiter-mcp-client',
	timeout: 60_000,
	servers: {
		jupiter: { url: new URL(JUPITER_MCP_URL) }
	}
})

export async function getJupiterTools() {
	return await jupiterMcpClient.listTools()
}
