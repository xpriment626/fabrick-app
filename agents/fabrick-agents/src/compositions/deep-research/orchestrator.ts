/**
 * Deep-research orchestrator handler.
 *
 * Runs ONE generate cycle. The worker owns thread lifecycle (creation +
 * closure) — the LLM's job is purely reasoning: dispatch, gather,
 * synthesize. The handler:
 *   1. Resolves the fleet mode from `FLEET_MODE` env (defaults to
 *      `research`).
 *   2. Pre-creates a Coral thread with all specialists as participants
 *      (so the orchestrator doesn't have to call coral_create_thread
 *      itself).
 *   3. Runs `agent.generate(...)` with the orchestrator prompt + the
 *      user's query + thread context.
 *   4. Extracts the final synthesis text, wraps it in the standard
 *      envelope, and sends it into the thread.
 *   5. Closes the thread (canonical "session done" signal — specialists
 *      watch for `thread_closed` and exit cleanly).
 *
 * Why no Mastra `structuredOutput` for v0:
 *   We had it wired with a discriminated-union schema, but Mastra's
 *   structured-output path injects an OpenAI-shaped `response_format`
 *   into the request body. OpenRouter forwards that to Anthropic, which
 *   400s — Anthropic does structured output via tool-use, not
 *   `response_format`. For v0 with only text synthesis we just read
 *   `result.text` and wrap it into the envelope manually. When a future
 *   mode actually needs structured output we'll switch to
 *   `experimental_output` (broader provider support) or a tool-based
 *   emission pattern, scoped per-mode.
 */

import { coralMcpClient } from '@shared/mcp/coral-mcp-client.js'
import {
	FLEET_SYNTHESIS_ENVELOPE_KEY,
	type FleetSynthesis
} from '@shared/fleet-modes-core.js'
import { makeResearchOrchestrator } from '@deep-research/agents/research-orchestrator.js'
import { deepResearchModes, DEEP_RESEARCH_SPECIALISTS } from '@deep-research/mode.js'

export type OrchestratorRunOptions = {
	banner: (msg: string) => void
}

export async function runDeepResearchOrchestrator(
	opts: OrchestratorRunOptions
): Promise<never> {
	const { banner } = opts

	const modeId = process.env.FLEET_MODE ?? 'research'
	const mode =
		modeId in deepResearchModes
			? deepResearchModes[modeId as keyof typeof deepResearchModes]
			: null
	if (!mode) {
		banner(
			`FATAL: Unknown fleet mode "${modeId}". Known: ${Object.keys(deepResearchModes).join(', ')}`
		)
		process.exit(1)
	}
	banner(`Mode=${mode.id} (renderer=${mode.rendererId})`)

	const userQuery =
		process.env.INITIAL_QUERY ||
		'No initial query was injected — introduce yourself and explain you would normally receive a research question.'
	banner(`User query: ${userQuery}`)

	if (!coralMcpClient) {
		banner('FATAL: no CORAL_CONNECTION_URL — orchestrator cannot pre-create thread.')
		process.exit(1)
	}

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
	banner(`Pre-creating thread "${slug}" with ${DEEP_RESEARCH_SPECIALISTS.length} specialists…`)
	const createResult = (await createThreadTool.execute(
		{ threadName: slug, participantNames: DEEP_RESEARCH_SPECIALISTS as readonly string[] },
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
Participants (already added): ${DEEP_RESEARCH_SPECIALISTS.map((s) => `@${s}`).join(', ')}

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
		// path) and exit cleanly instead of hanging to TTL.
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
