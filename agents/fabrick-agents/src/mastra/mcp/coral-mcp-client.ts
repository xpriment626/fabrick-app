import { MCPClient } from '@mastra/mcp'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

const coralUrl = process.env.CORAL_CONNECTION_URL

export const coralMcpClient = coralUrl
	? new MCPClient({
			id: 'coral-mcp-client',
			timeout: 1_200_000,
			servers: {
				coral: { url: new URL(coralUrl) }
			}
		})
	: null

export async function getCoralTools() {
	if (!coralMcpClient) return {}
	return await coralMcpClient.listTools()
}

/**
 * `coral_read_state` — wraps Coral's `coral://state` MCP **resource** as a
 * Mastra **tool** so the orchestrator's LLM can call it. Coral exposes
 * agent + thread + message snapshots via this resource; the canonical
 * communication pattern (per the CoralOS swarm reference) is:
 *
 *   1. coral_wait_for_mention   (use as a wakeup, ignore returned message)
 *   2. coral_read_state         (ALWAYS — this is the source of truth)
 *   3. process any messages you haven't handled yet
 *   4. loop
 *
 * Calling wait_for_mention twice in a row without reading state in
 * between will drop messages whenever multiple replies arrive while the
 * LLM is mid-token.
 *
 * Mastra's MCPClient surfaces resources via `mcpClient.resources.read()`
 * but does NOT auto-expose them as tools to the LLM. This wrapper bridges
 * the gap: same MCP server, same data, surfaced as a tool-shaped
 * function.
 */
const coralReadStateInput = z.object({}).describe('No inputs — returns the full session state snapshot.')

export const coralReadStateTool = createTool({
	id: 'coral_read_state',
	description:
		'Returns the full Coral session state snapshot (all agents you can see + all threads you participate in, with every message in those threads). Always call this immediately after coral_wait_for_mention to avoid missing messages that arrived while you were thinking.',
	inputSchema: coralReadStateInput,
	execute: async () => {
		if (!coralMcpClient) {
			return { error: 'No CORAL_CONNECTION_URL set; state read unavailable in standalone mode.' }
		}
		const result = await coralMcpClient.resources.read('coral', 'coral://state')
		// `result.contents` is an array of { uri, text|blob, mimeType? }.
		// Return the parsed text payload so the LLM gets structured JSON
		// rather than the MCP envelope.
		const firstText = result.contents.find((c): c is { uri: string; text: string; mimeType?: string } => 'text' in c)
		if (!firstText) {
			return { error: 'coral://state returned no text content' }
		}
		try {
			return JSON.parse(firstText.text)
		} catch {
			return { raw: firstText.text }
		}
	}
})

export function getCoralStateReadTool() {
	return { coral_read_state: coralReadStateTool }
}
