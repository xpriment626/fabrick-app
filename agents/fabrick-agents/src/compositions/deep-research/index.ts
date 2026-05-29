/**
 * Deep-research composition — public exports.
 *
 * What a composition contributes to the rest of the worker:
 *   - `agentFactories`: keyed by agentKey (the worker dispatches on
 *     these); each factory builds a Mastra `Agent` on demand.
 *   - `modes`: the FleetMode entries this composition registers.
 *   - `orchestratorAgentKey`: which agentKey is the orchestrator (so
 *     the worker knows to run the composition's orchestrator handler
 *     instead of the shared specialist loop).
 *   - `orchestratorAgentName`: the orchestrator's name in Coral state
 *     (used by the shared specialist loop to detect shutdown).
 *   - `runOrchestrator`: the composition's orchestrator entry point.
 *
 * Extraction-readiness: this file is the composition's API contract.
 * When deep-research moves to its own package, this becomes the
 * package's main export and nothing else changes.
 */

import { makeResearchOrchestrator } from '@deep-research/agents/research-orchestrator.js'
import { makeTokenInfoAgent } from '@deep-research/agents/token-info-agent.js'
import { makeDefillamaAgent } from '@deep-research/agents/defillama-agent.js'
import { makeExaAgent } from '@deep-research/agents/exa-agent.js'
import { makeTopledgerAgent } from '@deep-research/agents/topledger-agent.js'
import { makeNewsAgent } from '@deep-research/agents/news-agent.js'
import { makeGrokAgent } from '@deep-research/agents/grok-agent.js'
import { deepResearchModes } from '@deep-research/mode.js'
import { runDeepResearchOrchestrator } from '@deep-research/orchestrator.js'

/**
 * Lazy factories — each one builds an Agent on demand. Importing this
 * module is cheap; the MCP connection waterfall only happens when the
 * factory for a specific agent is invoked. This keeps the
 * token-info-agent / defillama-agent / research-orchestrator workers
 * from getting blocked on the Exa MCP handshake at boot time.
 */
export const agentFactories = {
	researchOrchestrator: makeResearchOrchestrator,
	tokenInfoAgent: makeTokenInfoAgent,
	defillamaAgent: makeDefillamaAgent,
	exaAgent: makeExaAgent,
	topledgerAgent: makeTopledgerAgent,
	newsAgent: makeNewsAgent,
	grokAgent: makeGrokAgent
} as const

export const deepResearchComposition = {
	id: 'deep-research',
	agentFactories,
	modes: deepResearchModes,
	/** The agentKey the worker dispatches to the orchestrator handler. */
	orchestratorAgentKey: 'researchOrchestrator' as const,
	/** Mastra agent name (used by specialist loop's shutdown detector). */
	orchestratorAgentName: 'research-orchestrator',
	runOrchestrator: runDeepResearchOrchestrator
} as const

export { deepResearchModes }
