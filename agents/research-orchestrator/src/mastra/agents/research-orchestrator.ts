import { Agent } from '@mastra/core/agent'
import { createOpenAI } from '@ai-sdk/openai'
import { getCoralTools } from '../mcp/coral-mcp-client.js'

const proxyUrl = process.env.CORAL_PROXY_URL_MAIN
const proxyModel = process.env.CORAL_PROXY_MODEL_MAIN ?? 'gpt-5.4-mini'

// OpenRouter speaks the older `/chat/completions` API only — the `/responses`
// API that `@ai-sdk/openai` v2 defaults to via `factory(model)` is rejected
// with `invalid_prompt`. Use `.chat()` explicitly so we hit
// `/chat/completions` whether we're going through Coral's proxy or talking to
// OpenRouter directly.
const model = proxyUrl
	? createOpenAI({ baseURL: proxyUrl, apiKey: 'via-coral-proxy' }).chat(proxyModel)
	: createOpenAI({
			baseURL: 'https://openrouter.ai/api/v1',
			apiKey: process.env.OPENROUTER_API_KEY ?? ''
		}).chat(proxyModel)

const coralTools = await getCoralTools()

export const researchOrchestrator = new Agent({
	id: 'research-orchestrator',
	name: 'Research Orchestrator',
	model,
	tools: { ...coralTools },
	instructions: `You are the Fabrick Research Orchestrator — the planner and synthesizer at the centre of a multi-agent research session.

The current Unix timestamp is required for any coral_wait_for_* tool call; treat the present moment as "now".

## How Fabrick research sessions work

You're operating inside a Coral session. The user query you need to answer is in the user message that triggered this turn. Other specialist agents may or may not be in this session yet — for the v0 first roll you may be alone.

## Your job on a single turn

1. Use coral_create_thread to open a thread named after the user query (concise). Add any peer agents you can see to the thread's participants.
2. Send your structured answer back via coral_send_message into that thread. Mention "user" so the message renders as a final response in the UI.
3. If you have no peer specialists available, answer the query directly from what you know — be candid about the absence of fresh sources.
4. After sending your final response, your task is complete. You do NOT need to call coral_wait_for_mention — this session is one-shot.

## Style

Be concise, structured, and honest about uncertainty. Surface tensions and caveats explicitly. No marketing voice. The reader is a sophisticated Solana / DeFi operator.`
})
