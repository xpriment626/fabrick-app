/**
 * MCP-over-HTTP endpoints for our hosted servers.
 *
 *   POST /mcp/jupiter      — Jupiter (Solana SPL prices + token metadata)
 *   POST /mcp/defillama    — DefiLlama free surface (TVL, yields, prices, etc.)
 *   POST /mcp/coindesk     — CoinDesk Data API (curated crypto news + sentiment)
 *
 * Streamable HTTP transport, stateless. GET returns 405 — no SSE
 * notifications stream (our tools don't push anything to clients).
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleMcpRequest } from '$lib/server/mcp/server';
import { TOOLS_BY_SERVER } from '$lib/server/mcp/registry';

export const POST: RequestHandler = async ({ request, params }) => {
	const serverName = params.server ?? '';
	const tools = TOOLS_BY_SERVER[serverName];
	if (!tools) {
		throw error(404, `unknown MCP server: ${serverName}`);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'invalid JSON request body');
	}

	const response = await handleMcpRequest(body as never, tools, serverName);
	if (response === null) {
		// Notification — no body, just acknowledge.
		return new Response(null, { status: 202 });
	}
	return json(response);
};

export const GET: RequestHandler = () => {
	return new Response('SSE notifications not supported', { status: 405 });
};
