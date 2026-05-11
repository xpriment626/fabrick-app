import { MCPClient } from '@mastra/mcp'

/**
 * Exa's hosted MCP server. Free tier: 3 QPS / 150 calls per day, no API
 * key required. We opt-in to all three search tools via the `?tools=`
 * query param so the exa-agent gets advanced search alongside the
 * defaults.
 *
 * Docs: https://docs.exa.ai/docs/reference/exa-mcp
 */
const EXA_MCP_URL =
	'https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,web_search_advanced_exa'

export const exaMcpClient = new MCPClient({
	id: 'exa-mcp-client',
	timeout: 60_000,
	servers: {
		exa: { url: new URL(EXA_MCP_URL) }
	}
})

export async function getExaTools() {
	return await exaMcpClient.listTools()
}
