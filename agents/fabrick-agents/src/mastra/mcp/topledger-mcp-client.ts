import { MCPClient } from '@mastra/mcp'

/**
 * TopLedger's hosted MCP server. SSE transport. Auth via Bearer token in
 * the Authorization header. Exposes ~9 tools for cross-protocol DeFi
 * positions/PnL across 20+ Solana protocols (Kamino, Drift, marginfi,
 * Jupiter perps, Raydium/Orca/Meteora LP, native staking, etc.).
 *
 * Docs: https://docs.topledger.xyz (MCP page is sparsely indexed; auth
 * scheme verified via probe — server returns `Missing API key. Provide
 * x-api-key header or Authorization: Bearer <key>` on unauth requests).
 *
 * Mastra's SSE transport has a known bug where `requestInit.headers`
 * alone doesn't propagate to the SSE handshake — we also have to inject
 * via `eventSourceInit.fetch`. Both code paths get the same Bearer token.
 */
const TOPLEDGER_MCP_URL = 'https://api.topledger.xyz/mcp/sse'

const apiKey = process.env.TOPLEDGER_API_KEY ?? ''

if (!apiKey) {
	console.warn(
		'[topledger-mcp-client] TOPLEDGER_API_KEY is not set. The TopLedger MCP server will reject all requests with 401.'
	)
}

export const topledgerMcpClient = new MCPClient({
	id: 'topledger-mcp-client',
	timeout: 60_000,
	servers: {
		topledger: {
			url: new URL(TOPLEDGER_MCP_URL),
			requestInit: {
				headers: {
					Authorization: `Bearer ${apiKey}`
				}
			},
			// Required for SSE connections with custom headers — Mastra docs
			// flag this as a workaround for an MCP SDK bug where requestInit
			// headers don't propagate to the EventSource handshake.
			eventSourceInit: {
				fetch(input: Request | URL | string, init?: RequestInit) {
					const headers = new Headers(init?.headers || {})
					headers.set('Authorization', `Bearer ${apiKey}`)
					return fetch(input, { ...init, headers })
				}
			}
		}
	}
})

export async function getTopledgerTools() {
	return await topledgerMcpClient.listTools()
}
