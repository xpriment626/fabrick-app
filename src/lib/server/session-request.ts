/**
 * Builders for Coral SessionRequest bodies.
 *
 * Each agent in our fleet connects to the data sources it needs via real
 * MCP servers (Coral's MCP for inter-agent coordination, plus Fabrick's
 * hosted Jupiter / DefiLlama MCPs, and Exa's hosted MCP). No
 * `customTools` block — we sidestepped that path because Coral v1.2.0's
 * `GraphAgentTool.outputSchema` defaults to a non-null empty schema that
 * breaks the agent-side MCP validation. External MCPs avoid the issue.
 */

export type AgentOptionValue =
	| { type: 'string'; value: string }
	| { type: 'i64'; value: number }
	| { type: 'f64'; value: number }
	| { type: 'bool'; value: boolean }
	| { type: 'list'; value: string[] };

export type AgentDeclaration = {
	id: {
		name: string;
		version: string;
		registrySourceId: { type: 'local' };
	};
	name: string;
	description?: string;
	provider: { type: 'local'; runtime: 'executable' | 'docker' };
	blocking?: boolean;
	systemPrompt?: string;
	options?: Record<string, AgentOptionValue>;
	annotations?: Record<string, string>;
};

export type SessionRequest = {
	agentGraphRequest: {
		agents: AgentDeclaration[];
		groups: string[][];
	};
	namespaceProvider: {
		type: 'create_if_not_exists';
		namespaceRequest: {
			name: string;
			deleteOnLastSessionExit: boolean;
		};
	};
	execution: {
		mode: 'immediate';
		runtimeSettings: {
			ttl: number;
			extendedEndReport?: boolean;
			persistenceMode?: { mode: 'hold_after_exit'; duration: number };
		};
	};
};

export type OrchestratorRunInput = {
	sessionSlug: string;
	userQuery: string;
	/** TTL in ms — Coral kills the session after this. Defaults to 10 minutes. */
	ttlMs?: number;
};

/**
 * Build a SessionRequest that spawns the 7-agent Fabrick research fleet:
 *  - research-orchestrator (coordinator, no data tools)
 *  - token-info-agent (connects to Fabrick's Jupiter MCP)
 *  - defillama-agent (connects to Fabrick's DefiLlama MCP)
 *  - exa-agent (connects to Exa's hosted MCP)
 *  - topledger-agent (connects to TopLedger's hosted MCP — Solana DeFi positions)
 *  - news-agent (connects to Fabrick's CoinDesk MCP — curated crypto news)
 *  - grok-agent (uses x-ai/grok-4.1-fast via OpenRouter — x_search auto-wired)
 *
 * The user's query is injected on the orchestrator via the INITIAL_QUERY
 * option (declared in its coral-agent.toml).
 */
export function buildOrchestratorSessionRequest(input: OrchestratorRunInput): SessionRequest {
	const ttlMs = input.ttlMs ?? 10 * 60 * 1000;
	const ts = Date.now();

	return {
		agentGraphRequest: {
			agents: [
				{
					id: {
						name: 'fabrick-research-orchestrator',
						version: '0.1.0',
						registrySourceId: { type: 'local' }
					},
					name: 'research-orchestrator',
					description: 'Fabrick research orchestrator — coordinates and synthesizes',
					provider: { type: 'local', runtime: 'executable' },
					blocking: true,
					options: {
						INITIAL_QUERY: { type: 'string', value: input.userQuery }
					},
					annotations: { role: 'orchestrator', source: 'fabrick' }
				},
				{
					id: {
						name: 'fabrick-token-info-agent',
						version: '0.1.0',
						registrySourceId: { type: 'local' }
					},
					name: 'token-info-agent',
					description: 'Solana SPL token prices and metadata via Jupiter MCP',
					provider: { type: 'local', runtime: 'executable' },
					blocking: true,
					annotations: { role: 'specialist', source: 'fabrick' }
				},
				{
					id: {
						name: 'fabrick-defillama-agent',
						version: '0.1.0',
						registrySourceId: { type: 'local' }
					},
					name: 'defillama-agent',
					description: 'Multichain DeFi metrics via DefiLlama MCP',
					provider: { type: 'local', runtime: 'executable' },
					blocking: true,
					annotations: { role: 'specialist', source: 'fabrick' }
				},
				{
					id: {
						name: 'fabrick-exa-agent',
						version: '0.1.0',
						registrySourceId: { type: 'local' }
					},
					name: 'exa-agent',
					description: 'General web search and webpage fetching via Exa MCP',
					provider: { type: 'local', runtime: 'executable' },
					blocking: true,
					annotations: { role: 'specialist', source: 'fabrick' }
				},
				{
					id: {
						name: 'fabrick-topledger-agent',
						version: '0.1.0',
						registrySourceId: { type: 'local' }
					},
					name: 'topledger-agent',
					description: 'Cross-protocol Solana DeFi positions and PnL via TopLedger MCP',
					provider: { type: 'local', runtime: 'executable' },
					blocking: true,
					annotations: { role: 'specialist', source: 'fabrick' }
				},
				{
					id: {
						name: 'fabrick-news-agent',
						version: '0.1.0',
						registrySourceId: { type: 'local' }
					},
					name: 'news-agent',
					description: 'Curated crypto news and sentiment via CoinDesk MCP',
					provider: { type: 'local', runtime: 'executable' },
					blocking: true,
					annotations: { role: 'specialist', source: 'fabrick' }
				},
				{
					id: {
						name: 'fabrick-grok-agent',
						version: '0.1.0',
						registrySourceId: { type: 'local' }
					},
					name: 'grok-agent',
					description: 'X/Twitter sentiment and breaking news via Grok + x_search',
					provider: { type: 'local', runtime: 'executable' },
					blocking: true,
					annotations: { role: 'specialist', source: 'fabrick' }
				}
			],
			groups: [
				[
					'research-orchestrator',
					'token-info-agent',
					'defillama-agent',
					'exa-agent',
					'topledger-agent',
					'news-agent',
					'grok-agent'
				]
			]
		},
		namespaceProvider: {
			type: 'create_if_not_exists',
			namespaceRequest: {
				name: `fabrick-${input.sessionSlug}-${ts}`,
				deleteOnLastSessionExit: true
			}
		},
		execution: {
			mode: 'immediate',
			runtimeSettings: {
				ttl: ttlMs,
				extendedEndReport: true,
				persistenceMode: { mode: 'hold_after_exit', duration: 60_000 }
			}
		}
	};
}
