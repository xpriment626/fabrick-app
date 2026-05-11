import { makeResearchOrchestrator } from './agents/research-orchestrator.js'
import { makeTokenInfoAgent } from './agents/token-info-agent.js'
import { makeDefillamaAgent } from './agents/defillama-agent.js'
import { makeExaAgent } from './agents/exa-agent.js'

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
	exaAgent: makeExaAgent
} as const

export type AgentKey = keyof typeof agentFactories

export function isAgentKey(value: string): value is AgentKey {
	return value in agentFactories
}
