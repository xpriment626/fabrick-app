import { agentFactories, isAgentKey, type AgentKey } from './mastra/index.js'
import { coralMcpClient, coralReadStateTool } from './mastra/mcp/coral-mcp-client.js'
import {
	getFleetMode,
	FLEET_SYNTHESIS_ENVELOPE_KEY,
	type FleetSynthesis
} from './mastra/fleet-modes.js'
import { makeResearchOrchestrator } from './mastra/agents/research-orchestrator.js'

const rawKey = process.argv[2]
if (!rawKey) {
	console.error('Usage: coral-worker.ts <agentKey>')
	console.error(
		'  agentKey ∈ { researchOrchestrator, tokenInfoAgent, defillamaAgent, exaAgent, topledgerAgent, newsAgent, grokAgent }'
	)
	process.exit(1)
}
if (!isAgentKey(rawKey)) {
	console.error(`Unknown agentKey "${rawKey}".`)
	process.exit(1)
}
const agentKey: AgentKey = rawKey

const banner = (msg: string) =>
	console.log(`[${new Date().toISOString()}] [${agentKey}] ${msg}`)

banner(
	`Booted. Agent ID=${process.env.CORAL_AGENT_ID} Session=${process.env.CORAL_SESSION_ID}`
)
banner(`Proxy URL=${process.env.CORAL_PROXY_URL_MAIN ?? '(none — standalone fallback)'}`)
banner(`Model=${process.env.CORAL_PROXY_MODEL_MAIN ?? '(default)'}`)

if (agentKey === 'researchOrchestrator') {
	// Orchestrator runs ONE generate cycle. The worker owns thread
	// lifecycle (creation + closure) — the LLM's job is purely
	// reasoning: dispatch, gather, synthesize.
	//
	// Why no Mastra `structuredOutput` for v0:
	//   We had it wired with a discriminated-union schema, but Mastra's
	//   structured-output path injects an OpenAI-shaped `response_format`
	//   into the request body. OpenRouter forwards that to Anthropic,
	//   which 400s — Anthropic does structured output via tool-use, not
	//   `response_format`. (Confirmed live: orchestrator pnum=1 got 400
	//   while specialists with identical proxy config got 200.)
	//
	//   For v0 with only text synthesis, we just read `result.text` and
	//   wrap it into the envelope manually. The mode registry shape
	//   stays — when a future mode actually needs structured output we
	//   can switch to `experimental_output` (broader provider support)
	//   or a tool-based emission pattern, scoped per-mode.
	const SPECIALISTS = [
		'token-info-agent',
		'defillama-agent',
		'exa-agent',
		'topledger-agent',
		'news-agent',
		'grok-agent'
	]

	if (!coralMcpClient) {
		banner('FATAL: no CORAL_CONNECTION_URL — orchestrator cannot pre-create thread.')
		process.exit(1)
	}

	const modeId = process.env.FLEET_MODE ?? 'research'
	let mode: ReturnType<typeof getFleetMode>
	try {
		mode = getFleetMode(modeId)
	} catch (err) {
		banner(`FATAL: ${(err as Error).message}`)
		process.exit(1)
	}
	banner(`Mode=${mode.id} (renderer=${mode.rendererId})`)

	const userQuery =
		process.env.INITIAL_QUERY ||
		'No initial query was injected — introduce yourself and explain you would normally receive a research question.'
	banner(`User query: ${userQuery}`)

	const toolsets = await coralMcpClient.listToolsets()
	const coralTools = toolsets.coral
	if (!coralTools) {
		banner('FATAL: coral toolset missing from MCP client — cannot pre-create thread.')
		process.exit(1)
	}
	const createThreadTool = coralTools.coral_create_thread
	const sendMessageTool = coralTools.coral_send_message
	const closeThreadTool = coralTools.coral_close_thread
	if (!createThreadTool?.execute || !sendMessageTool?.execute || !closeThreadTool?.execute) {
		banner(
			`FATAL: required Coral tools missing or non-executable. Available: ${Object.keys(coralTools).join(', ')}`
		)
		process.exit(1)
	}

	const slug = userQuery.slice(0, 80).replace(/\s+/g, ' ').trim() || 'research-run'
	banner(`Pre-creating thread "${slug}" with ${SPECIALISTS.length} specialists…`)
	const createResult = (await createThreadTool.execute(
		{ threadName: slug, participantNames: SPECIALISTS },
		{} as never
	)) as { thread?: { id?: string } } & Record<string, unknown>

	const threadId = createResult?.thread?.id ?? null
	if (!threadId) {
		banner(`FATAL: coral_create_thread returned no id. Raw: ${JSON.stringify(createResult)}`)
		process.exit(1)
	}
	banner(`Thread created: ${threadId}`)

	const agent = await makeResearchOrchestrator({
		promptSuffix: mode.orchestratorPromptSuffix
	})
	banner('Agent ready.')

	const augmentedUserMessage = `A research thread has been pre-created for this run.

Thread ID: ${threadId}
Participants (already added): ${SPECIALISTS.map((s) => `@${s}`).join(', ')}

Dispatch your sub-questions into this thread by calling coral_send_message with threadId="${threadId}" and the appropriate mentionNames. Do NOT call coral_create_thread (the thread exists). Do NOT call coral_close_thread (the worker handles closure).

User query: ${userQuery}`

	try {
		// Plain generate — no structuredOutput. The orchestrator emits a
		// plain-text response when it's ready (per its system prompt),
		// the loop terminates naturally when no more tool calls are
		// requested, and we wrap the final step's text below.
		const result = await agent.generate(
			[{ role: 'user', content: augmentedUserMessage }],
			{ maxSteps: 30 }
		)

		// `result.text` is the CONCATENATED text from every step of the
		// agent loop — including between-step narration like "I'll
		// dispatch this question" / "exa-agent hasn't replied yet". The
		// synthesis we actually want is just the final step's text (the
		// step that ended the loop by emitting no tool calls). Falling
		// back to `result.text` only if for some reason the last step
		// has no text (defensive — shouldn't happen with a well-formed
		// run).
		const lastStep = result.steps?.[result.steps.length - 1]
		const lastStepText = lastStep?.text?.trim() ?? ''
		const fallbackText = result.text?.trim() ?? ''
		const text = lastStepText.length > 0 ? lastStepText : fallbackText
		banner(
			`Generate finished. Steps=${result.steps?.length ?? 0} Last-step text=${lastStepText.length} Full text=${fallbackText.length} Using=${text.length}`
		)

		let synthesis: FleetSynthesis | null = null
		if (text.length > 0) {
			// v0: every mode renders as text. When non-text modes land,
			// this branch fans out per mode.id with the appropriate
			// wrapping logic (or a per-mode structured emission tool).
			synthesis = { type: 'text', body: text }
		}

		if (synthesis) {
			banner('Sending synthesis envelope into thread…')
			try {
				const envelope = { [FLEET_SYNTHESIS_ENVELOPE_KEY]: synthesis }
				await sendMessageTool.execute!(
					{
						threadId,
						content: JSON.stringify(envelope),
						mentions: []
					},
					{} as never
				)
				banner('Synthesis sent.')
			} catch (sendErr) {
				banner(
					`WARN: failed to send synthesis into thread ${threadId}: ${(sendErr as Error).message}`
				)
			}
		} else {
			banner('Generate returned empty text — nothing to land in thread.')
		}

		// Close the thread — canonical "session done" signal. Specialists
		// watch for `thread_closed` (via their state-poll + AbortSignal
		// path below) and exit cleanly instead of hanging to TTL.
		banner('Closing thread…')
		try {
			await closeThreadTool.execute!(
				{ threadId, summary: synthesis ? 'Synthesis complete' : 'Run ended without synthesis' },
				{} as never
			)
			banner('Thread closed.')
		} catch (closeErr) {
			banner(
				`WARN: failed to close thread ${threadId}: ${(closeErr as Error).message} (specialists will exit on session TTL)`
			)
		}

		process.exit(0)
	} catch (err) {
		banner(`Generate threw: ${(err as Error).message}`)
		console.error(err)
		// Best-effort thread closure on error so specialists can exit
		// rather than hang to TTL.
		try {
			await closeThreadTool.execute!(
				{ threadId, summary: `Run errored: ${(err as Error).message}` },
				{} as never
			)
		} catch {
			/* swallow */
		}
		process.exit(1)
	}
}

// Specialist agents: perpetual wait_for_mention loop with two shutdown
// signals composed via AbortSignal:
//
//   1. A background poll (every 5s) calls `coral_read_state`. If the
//      orchestrator's runtime is `stopped` OR every known thread is
//      `closed`, we set `shutdownPending` and `ac.abort()` — that
//      bubbles up through the in-flight `agent.generate()` (Mastra
//      honors abortSignal) and we exit on the next loop tick.
//   2. A pre-iteration check covers the case where a generate finishes
//      cleanly but the orchestrator stopped during it — we don't burn
//      another iteration before catching that.
//
// `maxSteps: 8` keeps each iteration short so even without abort the
// loop returns to the shutdown check fast (one wait → one tool call →
// one reply → done). Previous value of 25 let specialists spin for ~10
// minutes inside one generate while the orchestrator was already gone.
const agent = await agentFactories[agentKey]()
banner('Entering wait_for_mention loop (specialist)')

async function shouldExit(): Promise<boolean> {
	try {
		const state = (await coralReadStateTool.execute!({}, {} as never)) as {
			agents?: Array<{ name: string; status?: { type?: string } }>
			threads?: Array<{ state?: { state?: string } | null }>
		}
		const orchestrator = state?.agents?.find?.((a) => a.name === 'research-orchestrator')
		if (orchestrator?.status?.type === 'stopped') {
			banner('Orchestrator stopped — exiting specialist loop.')
			return true
		}
		const threads = state?.threads ?? []
		if (threads.length > 0 && threads.every((t) => t.state?.state === 'closed')) {
			banner('All known threads closed — exiting specialist loop.')
			return true
		}
	} catch (err) {
		// Tolerate transient state-read failures — next poll retries.
		banner(`State poll failed (continuing): ${(err as Error).message}`)
	}
	return false
}

const ac = new AbortController()
let shutdownPending = false

const pollInterval = setInterval(() => {
	if (shutdownPending) return
	void shouldExit().then((exit) => {
		if (exit && !shutdownPending) {
			shutdownPending = true
			banner('Shutdown signal received — aborting in-flight generate.')
			ac.abort()
		}
	})
}, 5000)

while (true) {
	if (shutdownPending || (await shouldExit())) {
		clearInterval(pollInterval)
		process.exit(0)
	}
	try {
		const result = await agent.generate(
			'Call coral_wait_for_mention to receive your next sub-question. Once a message arrives, answer it using your tools, then send a coral_send_message reply into the same thread mentioning the requester. After replying, your turn is complete — return so the loop can restart.',
			{ maxSteps: 8, abortSignal: ac.signal }
		)
		banner(`Turn complete. Reply length=${result.text?.length ?? 0}`)
	} catch (err) {
		if (shutdownPending) {
			clearInterval(pollInterval)
			process.exit(0)
		}
		const msg = err instanceof Error ? err.message : String(err)
		banner(`Turn errored: ${msg}`)
		await new Promise((r) => setTimeout(r, 3000))
	}
}
