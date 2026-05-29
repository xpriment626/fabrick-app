/**
 * Shared specialist agent loop — composition-agnostic.
 *
 * Perpetual wait_for_mention loop every composition's specialist agents
 * run. Composition-specific only in one place: the orchestrator's name,
 * which the shutdown-detection poll watches for `stopped` state. That's
 * passed in by the caller.
 *
 * Two shutdown signals composed via AbortSignal:
 *   1. A background poll (every 5s) calls `coral_read_state`. If the
 *      orchestrator's runtime is `stopped` OR every known thread is
 *      `closed`, we set `shutdownPending` and `ac.abort()` — that
 *      bubbles up through the in-flight `agent.generate()` (Mastra
 *      honors abortSignal) and we exit on the next loop tick.
 *   2. A pre-iteration check covers the case where a generate finishes
 *      cleanly but the orchestrator stopped during it — we don't burn
 *      another iteration before catching that.
 *
 * `maxSteps: 8` keeps each iteration short so even without abort the
 * loop returns to the shutdown check fast (one wait → one tool call →
 * one reply → done). Previous value of 25 let specialists spin for ~10
 * minutes inside one generate while the orchestrator was already gone.
 */

import { coralReadStateTool } from '@shared/mcp/coral-mcp-client.js'
import type { Agent } from '@mastra/core/agent'

export type SpecialistLoopOptions = {
	agent: Agent
	/** Mastra agent name of the composition's orchestrator (the name it
	 *  registers as in Coral state). Used to detect when the orchestrator
	 *  is `stopped` so specialists can exit cleanly. */
	orchestratorAgentName: string
	banner: (msg: string) => void
}

const SPECIALIST_PROMPT =
	'Call coral_wait_for_mention to receive your next sub-question. Once a message arrives, answer it using your tools, then send a coral_send_message reply into the same thread mentioning the requester. After replying, your turn is complete — return so the loop can restart.'

export async function runSpecialistLoop(opts: SpecialistLoopOptions): Promise<never> {
	const { agent, orchestratorAgentName, banner } = opts
	banner('Entering wait_for_mention loop (specialist)')

	async function shouldExit(): Promise<boolean> {
		try {
			const state = (await coralReadStateTool.execute!({}, {} as never)) as {
				agents?: Array<{ name: string; status?: { type?: string } }>
				threads?: Array<{ state?: { state?: string } | null }>
			}
			const orchestrator = state?.agents?.find?.((a) => a.name === orchestratorAgentName)
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
			const result = await agent.generate(SPECIALIST_PROMPT, {
				maxSteps: 8,
				abortSignal: ac.signal
			})
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
}
