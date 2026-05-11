import { MCPClient } from '@mastra/mcp'

/**
 * Fabrick's hosted DefiLlama MCP server (SvelteKit-served at
 * /mcp/defillama). Exposes get_protocols, get_protocol_tvl,
 * get_yield_pools, get_dex_volume, and get_coin_prices.
 *
 * Multichain by design — no Solana fence.
 */
const DEFILLAMA_MCP_URL = `${process.env.FABRICK_MCP_BASE_URL ?? 'http://127.0.0.1:5173'}/mcp/defillama`

export const defillamaMcpClient = new MCPClient({
	id: 'defillama-mcp-client',
	timeout: 60_000,
	servers: {
		defillama: { url: new URL(DEFILLAMA_MCP_URL) }
	}
})

export async function getDefillamaTools() {
	return await defillamaMcpClient.listTools()
}
