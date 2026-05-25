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
	/**
	 * Fleet mode id — declares the synthesis schema + renderer the run
	 * targets. Defaults to `research` (text-shaped synthesis). The
	 * orchestrator worker reads this from the `FLEET_MODE` agent option
	 * (injected below) and looks up the matching mode in its registry
	 * (`fabrick-agents/src/mastra/fleet-modes.ts`).
	 */
	mode?: string;
	/**
	 * The user's working-memory synthesis (dream-pass output), read at
	 * dispatch. When present it's folded into INITIAL_QUERY as a clearly
	 * delimited context preamble — NOT a new agent option, which would need
	 * a coral-agent.toml whitelist change + server restart. Empty/omitted
	 * for users the dream pass hasn't touched yet.
	 */
	userMemory?: string;
	/**
	 * Story context, when this run was escalated from a News story chat
	 * (§17 Phase C). Folded into INITIAL_QUERY as the authoritative article
	 * the run is grounded in — the structured story→fleet seed. Caller
	 * (`/api/fleet/run`) composes this from the resolved story.
	 */
	storyContext?: string;
};

const MEMORY_PREAMBLE =
	'[USER MEMORY — persistent context about who is asking, distilled from their prior research. Use it to tailor depth, framing, and which angles matter. It is context, not the task. The actual research query follows below.]';

const STORY_PREAMBLE =
	'[STORY CONTEXT — this run was launched from a news story. Treat the article below as the grounding subject of the research: verify, deepen, and contextualize it. The actual research query follows below.]';

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
	const mode = input.mode ?? 'research';

	// Compose INITIAL_QUERY: optional context preambles (story grounding,
	// then user memory) ahead of the actual query. Order puts the subject
	// (story) first, then who's asking (memory), then the task.
	const blocks: string[] = [];
	const story = input.storyContext?.trim();
	if (story) blocks.push(`${STORY_PREAMBLE}\n${story}`);
	const wm = input.userMemory?.trim();
	if (wm) blocks.push(`${MEMORY_PREAMBLE}\n${wm}`);
	const initialQuery = blocks.length
		? `${blocks.join('\n\n')}\n\n[RESEARCH QUERY]\n${input.userQuery}`
		: input.userQuery;

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
						INITIAL_QUERY: { type: 'string', value: initialQuery },
						FLEET_MODE: { type: 'string', value: mode }
					},
					annotations: { role: 'orchestrator', source: 'fabrick', mode }
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
