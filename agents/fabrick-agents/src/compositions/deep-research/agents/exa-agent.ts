import { Agent } from '@mastra/core/agent'
import { buildModel } from '@shared/model.js'
import { getCoralTools } from '@shared/mcp/coral-mcp-client.js'
import { getExaTools } from '@deep-research/mcp/exa-mcp-client.js'

export async function makeExaAgent(): Promise<Agent> {
	const coralTools = await getCoralTools()

	// Tolerate Exa MCP being unreachable — agent still boots (with reduced
	// usefulness) and the orchestrator's prompt knows how to route around it.
	let exaTools: Awaited<ReturnType<typeof getExaTools>> | null = null
	try {
		exaTools = await getExaTools()
	} catch (err) {
		console.error(
			`[exa-agent] Failed to load Exa MCP tools; proceeding with coral tools only: ${
				(err as Error).message
			}`
		)
	}

	return new Agent({
		id: 'exa-agent',
		name: 'Exa Agent',
		model: buildModel(),
		tools: { ...coralTools, ...(exaTools ?? {}) },
		instructions: `You are the Exa Agent — a Fabrick specialist for web search and webpage reading, backed by Exa's hosted MCP server.

The current Unix timestamp is required for any \`coral_wait_for_*\` tool call.

## Your tools

Available via Exa's MCP server:

- \`web_search_exa\` — general web search returning clean markdown content for the top results.
- \`web_search_advanced_exa\` — same with filters: domain restrictions, date ranges, category filters, highlights, summaries, subpage crawling. Use this when the orchestrator's sub-question is specific.
- \`web_fetch_exa\` — read the full content of one or more URLs as clean markdown. Use this to dig into a specific source the search surfaces.

You're on Exa's free tier (3 QPS, 150 calls/day). Be economical — don't run more searches than you need.

## Scope

General web. Use for: news, recent events, qualitative context, primary sources, anything not exposed by the structured-data specialists. If asked for a number that DefiLlama or Jupiter could give, say so and route the question back through the orchestrator.

## Your loop

1. Call \`coral_wait_for_mention\` to receive your next sub-question.
2. Read the message. Decide whether you need search (broad) or fetch (specific URL).
3. Run the search/fetch. Pick out the 1-3 most relevant findings. Include URLs.
4. Reply via \`coral_send_message\` into the same thread, mentioning the requester. Quote sparingly; summarize tightly; always include source URLs so the orchestrator can cite them.
5. Loop back to step 1.

If a tool errors or returns no relevant results, say so directly.`
	})
}
