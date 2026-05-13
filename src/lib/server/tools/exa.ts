/**
 * Exa-backed tool — single web search for chat agent.
 *
 * Calls Exa's hosted MCP server (the same endpoint exa-agent uses on
 * the fleet side) over plain JSON-RPC. The free unauthenticated tier
 * gives us 3 QPS / 150 calls per day — fine for chat-mode lookups
 * where a single search per turn is typical.
 *
 * Returns a small, model-friendly shape: title, url, published date,
 * and a short content excerpt. Caps at 5 results so the chat agent
 * doesn't drown its context.
 *
 * Docs: https://docs.exa.ai/docs/reference/exa-mcp
 */

import { z } from 'zod';

const EXA_MCP_URL =
	'https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,web_search_advanced_exa';

/* ---- exa_web_search ------------------------------------------------- */

export const exaWebSearchInput = z
	.object({
		query: z
			.string()
			.min(2)
			.max(400)
			.describe('Natural-language search query. Be specific.'),
		numResults: z
			.number()
			.int()
			.min(1)
			.max(5)
			.default(3)
			.describe('How many results to return. Default 3, max 5.')
	})
	.describe('Inputs for exa_web_search');

export type ExaWebSearchInput = z.infer<typeof exaWebSearchInput>;

export const exaWebSearchOutput = z.object({
	results: z.array(
		z.object({
			title: z.string(),
			url: z.string(),
			published: z.string().nullable(),
			snippet: z.string()
		})
	)
});

type RawExaResult = {
	title?: string;
	url?: string;
	publishedDate?: string | null;
	text?: string;
};

export async function exaWebSearch(input: ExaWebSearchInput) {
	const body = {
		jsonrpc: '2.0',
		id: Math.floor(Math.random() * 1_000_000),
		method: 'tools/call',
		params: {
			name: 'web_search_exa',
			arguments: { query: input.query, numResults: input.numResults }
		}
	};

	const res = await fetch(EXA_MCP_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream'
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(8000)
	});
	if (!res.ok) {
		throw new Error(`exa /tools/call ${res.status}: ${await res.text()}`);
	}

	const text = await res.text();
	// Exa's MCP responds with either application/json OR text/event-stream
	// depending on Accept header negotiation. Handle both.
	const payload = parseExaResponse(text);
	if (!payload || payload.error) {
		throw new Error(`exa error: ${JSON.stringify(payload?.error ?? 'no payload')}`);
	}
	const toolResult = payload.result;
	const content = toolResult?.content?.[0];
	const inner = content?.text ? JSON.parse(content.text) : toolResult?.structuredContent;
	const raw: RawExaResult[] = inner?.results ?? [];

	const results = raw.slice(0, input.numResults).map((r) => ({
		title: (r.title ?? '').trim(),
		url: r.url ?? '',
		published: r.publishedDate ?? null,
		snippet: ((r.text ?? '').trim().slice(0, 320) + (((r.text ?? '').length > 320) ? '…' : ''))
	}));

	return { results };
}

/**
 * Parse Exa's mixed response format. If text starts with `data: ` it's
 * an SSE frame envelope; otherwise it's plain JSON-RPC.
 */
function parseExaResponse(raw: string): {
	result?: {
		content?: { type?: string; text?: string }[];
		structuredContent?: { results?: RawExaResult[] };
	};
	error?: unknown;
} | null {
	const trimmed = raw.trim();
	if (trimmed.startsWith('event:') || trimmed.startsWith('data:')) {
		// Find the first `data:` line and parse its JSON payload.
		const lines = trimmed.split('\n');
		for (const line of lines) {
			if (line.startsWith('data:')) {
				try {
					return JSON.parse(line.slice(5).trim());
				} catch {
					/* try next */
				}
			}
		}
		return null;
	}
	try {
		return JSON.parse(trimmed);
	} catch {
		return null;
	}
}
