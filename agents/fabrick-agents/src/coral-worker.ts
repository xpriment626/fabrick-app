/**
 * Coral worker entry — composition-aware dispatcher.
 *
 * Started by Coral via each agent's `startup.sh`:
 *   exec npx tsx src/coral-worker.ts <agentKey>
 *
 * Three jobs:
 *   1. Validate `agentKey` against the cross-composition registry.
 *   2. Look up the owning composition.
 *   3. Dispatch — orchestrator → composition's `runOrchestrator`;
 *      specialist → shared `runSpecialistLoop`.
 *
 * Everything composition-specific lives behind the registry boundary —
 * adding a savings-account (or any) composition is a single import in
 * `shared/compositions-registry.ts` + a sibling dir under
 * `compositions/`. This file does not change.
 */

import {
	agentFactories,
	isAgentKey,
	findCompositionFor,
	type AgentKey
} from '@shared/compositions-registry.js'
import { runSpecialistLoop } from '@shared/specialist-loop.js'

const rawKey = process.argv[2]
if (!rawKey) {
	console.error('Usage: coral-worker.ts <agentKey>')
	console.error(`  agentKey ∈ { ${Object.keys(agentFactories).join(', ')} }`)
	process.exit(1)
}
if (!isAgentKey(rawKey)) {
	console.error(
		`Unknown agentKey "${rawKey}". Known: ${Object.keys(agentFactories).join(', ')}`
	)
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

const composition = findCompositionFor(agentKey)
if (!composition) {
	// Registry consistency check — should be unreachable since
	// isAgentKey() succeeded, but typing is conservative.
	banner(`FATAL: no composition owns agentKey "${agentKey}".`)
	process.exit(1)
}
banner(`Composition=${composition.id}`)

if (agentKey === composition.orchestratorAgentKey) {
	// Orchestrator path: run the composition's one-shot orchestration
	// handler. It owns thread lifecycle + synthesis envelope emission +
	// thread closure.
	await composition.runOrchestrator({ banner })
} else {
	// Specialist path: perpetual wait_for_mention loop, parameterized on
	// the composition's orchestrator name (for shutdown detection).
	const agent = await agentFactories[agentKey]()
	await runSpecialistLoop({
		agent,
		orchestratorAgentName: composition.orchestratorAgentName,
		banner
	})
}
