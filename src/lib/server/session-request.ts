/**
 * Builders for Coral SessionRequest bodies.
 *
 * For the first roll we ship a single-agent session (just the orchestrator)
 * so we can see the agent loop close end-to-end. Full multi-agent fleets
 * come in a later reroll.
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
	customToolAccess?: string[];
	annotations?: Record<string, string>;
};

export type SessionRequest = {
	agentGraphRequest: {
		agents: AgentDeclaration[];
		groups: string[][];
		customTools?: Record<string, unknown>;
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
	/** TTL in ms — Coral kills the session after this. Defaults to 5 minutes. */
	ttlMs?: number;
};

/**
 * Build a SessionRequest that spawns *just* the research-orchestrator agent
 * with the user query injected as the `INITIAL_QUERY` option (declared in
 * the agent's coral-agent.toml).
 *
 * Namespace name is `fabrick-{slug}-{ts}` so concurrent runs against the
 * same session slug don't collide.
 */
export function buildOrchestratorSessionRequest(input: OrchestratorRunInput): SessionRequest {
	const ttlMs = input.ttlMs ?? 5 * 60 * 1000;
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
					name: 'orchestrator',
					description: 'Fabrick deep-research orchestrator',
					provider: { type: 'local', runtime: 'executable' },
					blocking: true,
					options: {
						INITIAL_QUERY: { type: 'string', value: input.userQuery }
					},
					annotations: { role: 'orchestrator', source: 'fabrick' }
				}
			],
			groups: [['orchestrator']]
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
