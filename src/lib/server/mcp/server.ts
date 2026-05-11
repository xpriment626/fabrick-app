/**
 * Minimal MCP-over-HTTP server (Streamable HTTP transport, stateless).
 *
 * Implements only the JSON-RPC methods our agents actually use:
 *   - initialize
 *   - notifications/initialized (no-op)
 *   - ping
 *   - tools/list
 *   - tools/call
 *
 * Anything else returns method-not-found. No SSE/notifications stream.
 * Each `/mcp/<server>` route is stateless — we don't track session IDs
 * (the spec allows this, and our tools have no per-session state).
 *
 * Why this exists vs Coral's `customTools`: Coral 1.2.0's
 * `GraphAgentTool.outputSchema` defaults to a non-null empty `ToolSchema`,
 * which makes the agent's MCP layer demand `structuredContent` in every
 * response — but Coral's `Http.execute` only ever populates `content[]`.
 * The mismatch is unsolvable from our side. Running our tools as real
 * MCP servers bypasses Coral's customTools layer entirely.
 */

import { z } from 'zod';

export type McpTool = {
	name: string;
	description: string;
	inputSchema: z.ZodTypeAny;
	handler: (input: unknown) => Promise<unknown>;
};

const PROTOCOL_VERSION = '2025-06-18';

type JsonRpcRequest = {
	jsonrpc?: string;
	id?: unknown;
	method?: string;
	params?: Record<string, unknown> | undefined;
};

type JsonRpcResponse =
	| { jsonrpc: '2.0'; id: unknown; result: unknown }
	| { jsonrpc: '2.0'; id: unknown; error: { code: number; message: string } };

function ok(id: unknown, result: unknown): JsonRpcResponse {
	return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id: unknown, code: number, message: string): JsonRpcResponse {
	return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/** Convert a zod schema to MCP-compatible JSON Schema for the tool's inputSchema. */
function toMcpInputSchema(schema: z.ZodTypeAny): Record<string, unknown> {
	const raw = z.toJSONSchema(schema) as Record<string, unknown>;
	const copy: Record<string, unknown> = { ...raw };
	delete copy['$schema'];
	delete copy['$id'];
	return copy;
}

/**
 * Handle one JSON-RPC request. Returns null for notifications (no
 * response expected); otherwise returns a JSON-RPC envelope to write
 * back to the client.
 */
export async function handleMcpRequest(
	body: JsonRpcRequest,
	tools: Map<string, McpTool>,
	serverName: string
): Promise<JsonRpcResponse | null> {
	const { id, method, params } = body;

	switch (method) {
		case 'initialize':
			return ok(id, {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: { tools: { listChanged: false } },
				serverInfo: { name: `fabrick-${serverName}-mcp`, version: '0.1.0' }
			});

		case 'notifications/initialized':
			// Client signaling "ready" — no response.
			return null;

		case 'ping':
			return ok(id, {});

		case 'tools/list': {
			const list = Array.from(tools.values()).map((t) => ({
				name: t.name,
				description: t.description,
				inputSchema: toMcpInputSchema(t.inputSchema)
			}));
			return ok(id, { tools: list });
		}

		case 'tools/call': {
			const name = (params?.['name'] as string) ?? '';
			const args = (params?.['arguments'] as Record<string, unknown>) ?? {};
			const tool = tools.get(name);
			if (!tool) {
				return rpcError(id, -32602, `unknown tool: ${name}`);
			}
			const parsed = tool.inputSchema.safeParse(args);
			if (!parsed.success) {
				return ok(id, {
					content: [
						{ type: 'text', text: `input validation failed: ${parsed.error.message}` }
					],
					isError: true
				});
			}
			try {
				const result = await tool.handler(parsed.data);
				return ok(id, {
					content: [{ type: 'text', text: JSON.stringify(result) }],
					isError: false
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return ok(id, {
					content: [{ type: 'text', text: `tool execution failed: ${msg}` }],
					isError: true
				});
			}
		}

		default:
			return rpcError(id, -32601, `method not found: ${method ?? '(missing)'}`);
	}
}
