import { compositionReportFindingSchema } from '$lib/savings/report';
import type {
	AllocationDecision,
	CompositionReport,
	CompositionReportFinding,
	OpportunityCard,
	RiskPreference
} from '$lib/savings/types';

const CORAL_CLOUD_API_URL = 'https://api.coralcloud.ai';
const DEFAULT_NAMESPACE = 'fabrick-composition-report';
const CORAL_TIMEOUT_MS = 12_000;
const CORAL_REPORT_WAIT_MS = 45_000;
const CORAL_POLL_INTERVAL_MS = 1_500;
const AGENT_VERSION = '0.1.0';

const SPECIALISTS = [
	['fabrick-opp-interpreter', 'opportunity-interpreter'],
	['fabrick-rate-quality', 'rate-quality'],
	['fabrick-exit-liquidity', 'exit-liquidity'],
	['fabrick-capacity-risk', 'capacity-concentration'],
	['fabrick-exposure', 'strategy-exposure'],
	['fabrick-strategy-narrator', 'account-narrator']
] as const;

type AgentOptionValue =
	| { type: 'string'; value: string }
	| { type: 'u32'; value: number }
	| { type: 'bool'; value: boolean }
	| { type: 'list[string]'; value: string[] };

type CoralResult = {
	ok: boolean;
	status: number;
	body: unknown;
};

type RegistryGroup = {
	identifier?: { type?: string; linkedServerId?: string };
	agents?: Array<{ name?: string; versions?: string[] }>;
};

export type CoralCompositionOutput = {
	findings: CompositionReportFinding[];
	keyWarnings: string[];
	messageCount: number;
	narratorCopy?: Partial<CompositionReport['narratorCopy']>;
};

export type CoralCompositionSessionResult = {
	coordination: CompositionReport['coordination'];
	output?: CoralCompositionOutput;
};

export type CoralCompositionSessionInput = {
	accountName?: string;
	allocation: AllocationDecision;
	amountUsd: number;
	pools: OpportunityCard[];
	previousAllocation?: AllocationDecision | null;
	riskPreference: RiskPreference;
};

function savingsMcpUrl(): string {
	return process.env.SAVINGS_MCP_URL?.trim() || 'http://127.0.0.1:8788/mcp';
}

function apiUrl(): string {
	return process.env.CORAL_CLOUD_API_URL?.trim() || CORAL_CLOUD_API_URL;
}

function namespace(): string {
	const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
	return `${process.env.CORAL_REPORT_NAMESPACE?.trim() || DEFAULT_NAMESPACE}-${suffix}`;
}

function linkedServerName(): string | undefined {
	return process.env.CORAL_LINKED_SERVER_NAME?.trim() || undefined;
}

function reportWaitMs(): number {
	const parsed = Number(process.env.CORAL_REPORT_WAIT_MS);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : CORAL_REPORT_WAIT_MS;
}

export function buildCoralCompositionTask(input: CoralCompositionSessionInput): string {
	return [
		'Generate a Fabrick Advanced Account Composition Report.',
		'Use Savings MCP only for read-only venue/opportunity/metric context.',
		'The user already selected the pool set; do not propose different pools.',
		'Return specialist findings for the fixed allocation preview. Do not prepare, sign, submit, or mutate anything.',
		'Final narrator output should be concise and structured for these report sections: summary, poolFindings, weightingRationale, rateQuality, exitLiquidity, concentration, exposure, keyWarnings, narratorCopy.',
		'End the final narrator message with a parseable block named FABRICK_REPORT_JSON. The JSON object must have optional narratorCopy { overview, weightingRationale, rebalancing }, keyWarnings string[], and findings array with { specialist, title, severity, body }. Allowed specialists: opportunity, rate, liquidity, capacity, exposure, narrator. Allowed severity: info, watch, warning.',
		'Input JSON:',
		JSON.stringify(
			{
				accountName: input.accountName,
				amountUsd: input.amountUsd,
				riskPreference: input.riskPreference,
				selectedPools: input.pools.map((pool) => ({
					id: pool.id,
					title: pool.title,
					venue: pool.venue,
					product: pool.product,
					apy: pool.apy,
					tvlUsd: pool.tvlUsd,
					utilizationPct: pool.utilizationPct,
					riskTier: pool.riskTier,
					riskSynthesis: pool.riskSynthesis,
					depositable: pool.depositable,
					integrationStatus: pool.integrationStatus,
					limitations: pool.limitations,
					availableFollowups: pool.availableFollowups
				})),
				allocation: input.allocation,
				previousAllocation: input.previousAllocation ?? null
			},
			null,
			2
		)
	].join('\n\n');
}

export function buildCoralCompositionSessionRequest(input: {
	linkedServer?: string;
	namespace: string;
	savingsMcpUrl: string;
	task: string;
}): unknown {
	return {
		agentGraphRequest: {
			agents: SPECIALISTS.map(([registryName, instanceName]) => ({
				id: {
					name: registryName,
					version: AGENT_VERSION,
					registrySourceId: input.linkedServer
						? { type: 'linked', linkedServerId: input.linkedServer }
						: { type: 'local' }
				},
				name: instanceName,
				description: `Fabrick savings composition specialist: ${instanceName}`,
				blocking: true,
				provider: input.linkedServer
					? { type: 'linked', linkedServerName: input.linkedServer, runtime: 'prototype' }
					: { type: 'local', runtime: 'prototype' },
				options: {
					SAVINGS_MCP_URL: { type: 'string', value: input.savingsMcpUrl },
					SMOKE_TASK: { type: 'string', value: input.task }
				} satisfies Record<string, AgentOptionValue>
			})),
			groups: [SPECIALISTS.map(([, instanceName]) => instanceName)],
			customTools: {}
		},
		namespaceProvider: {
			type: 'create_if_not_exists',
			namespaceRequest: {
				name: input.namespace,
				deleteOnLastSessionExit: true,
				annotations: { app: 'fabrick', surface: 'composition-report' }
			}
		},
		execution: {
			mode: 'immediate',
			runtimeSettings: {
				ttl: 180_000,
				extendedEndReport: true,
				persistenceMode: { mode: 'hold_after_exit', duration: 120_000 }
			}
		},
		annotations: { app: 'fabrick', feature: 'composition-report' }
	};
}

export function findMissingCompositionAgents(
	registry: RegistryGroup[],
	linkedServer?: string
): string[] {
	const matchingGroups = registry.filter((group) => {
		if (!linkedServer) return group.identifier?.type === 'local';
		return group.identifier?.type === 'linked' && group.identifier.linkedServerId === linkedServer;
	});
	return SPECIALISTS.filter(([registryName]) => {
		return !matchingGroups.some((group) =>
			group.agents?.some(
				(agent) => agent.name === registryName && agent.versions?.includes(AGENT_VERSION)
			)
		);
	}).map(([registryName]) => `${registryName}@${AGENT_VERSION}`);
}

function registryTarget(linkedServer?: string): string {
	return linkedServer ? `linked registry "${linkedServer}"` : 'Coral Cloud local registry';
}

async function coralFetch(
	path: string,
	apiKey: string,
	options: { body?: unknown; method?: 'GET' | 'POST' } = {}
): Promise<CoralResult> {
	const response = await fetch(`${apiUrl()}${path}`, {
		method: options.method ?? 'POST',
		headers: {
			authorization: `Bearer ${apiKey}`,
			'content-type': 'application/json'
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
		signal: AbortSignal.timeout(CORAL_TIMEOUT_MS)
	});
	const text = await response.text();
	let parsed: unknown = text;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		// Keep raw response text.
	}
	return { ok: response.ok, status: response.status, body: parsed };
}

async function listRegistry(apiKey: string): Promise<RegistryGroup[]> {
	const result = await coralFetch('/api/v1/registry', apiKey, { method: 'GET' });
	if (!result.ok) throw new Error(`registry list failed with HTTP ${result.status}`);
	return Array.isArray(result.body) ? (result.body as RegistryGroup[]) : [];
}

function summarizeFailure(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

const SPECIALIST_ALIASES: Array<{
	specialist: CompositionReportFinding['specialist'];
	aliases: string[];
	defaultTitle: string;
}> = [
	{
		specialist: 'opportunity',
		aliases: ['opportunity-interpreter', 'fabrick-opp-interpreter', 'opportunity data interpreter'],
		defaultTitle: 'Opportunity interpretation'
	},
	{
		specialist: 'rate',
		aliases: ['rate-quality', 'fabrick-rate-quality', 'rate quality specialist'],
		defaultTitle: 'Rate quality'
	},
	{
		specialist: 'liquidity',
		aliases: ['exit-liquidity', 'fabrick-exit-liquidity', 'exit liquidity specialist'],
		defaultTitle: 'Exit liquidity'
	},
	{
		specialist: 'capacity',
		aliases: ['capacity-concentration', 'fabrick-capacity-risk', 'capacity and concentration'],
		defaultTitle: 'Capacity and concentration'
	},
	{
		specialist: 'exposure',
		aliases: ['strategy-exposure', 'fabrick-exposure', 'strategy exposure specialist'],
		defaultTitle: 'Strategy exposure'
	},
	{
		specialist: 'narrator',
		aliases: ['account-narrator', 'fabrick-strategy-narrator', 'account strategy narrator'],
		defaultTitle: 'Narrator synthesis'
	}
];

type CoralThreadMessage = {
	source: string;
	text: string;
};

function normalizeText(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function compactText(value: string, maxLength: number): string {
	const cleaned = normalizeText(value)
		.replace(/\b(?:kamino|save|jupiter):[A-Za-z0-9:_-]{18,}\b/g, 'selected opportunity')
		.replace(/\s+([,.;:])/g, '$1');
	if (cleaned.length <= maxLength) return cleaned;
	const sentenceEnd = Math.max(
		cleaned.lastIndexOf('. ', maxLength),
		cleaned.lastIndexOf('; ', maxLength),
		cleaned.lastIndexOf('? ', maxLength),
		cleaned.lastIndexOf('! ', maxLength)
	);
	const cut = sentenceEnd > maxLength * 0.55 ? sentenceEnd + 1 : cleaned.lastIndexOf(' ', maxLength);
	return `${cleaned.slice(0, cut > 0 ? cut : maxLength).trim()}...`;
}

function looksLikeInstructionEcho(text: string): boolean {
	const lower = text.toLowerCase();
	return (
		lower.includes('smoke workflow') ||
		lower.includes('please reply with concise findings') ||
		lower.includes('selected pools (fixed)') ||
		lower.includes('input json:') ||
		lower.includes('generate a fabrick advanced account composition report')
	);
}

function stringifyMessageContent(value: unknown): string {
	if (typeof value === 'string') return normalizeText(value);
	if (Array.isArray(value)) {
		return normalizeText(value.map((item) => stringifyMessageContent(item)).filter(Boolean).join(' '));
	}
	if (value && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		for (const key of ['text', 'content', 'message', 'body', 'value', 'output']) {
			const rendered = stringifyMessageContent(obj[key]);
			if (rendered) return rendered;
		}
	}
	return '';
}

function messageSource(value: unknown): string {
	if (!value || typeof value !== 'object') return '';
	const obj = value as Record<string, unknown>;
	const parts = [
		obj.senderName,
		obj.sender,
		obj.authorName,
		obj.author,
		obj.agentName,
		obj.name,
		obj.source,
		obj.from
	].map((part) => stringifyMessageContent(part));
	return normalizeText(parts.filter(Boolean).join(' '));
}

export function extractCoralThreadMessages(state: unknown): CoralThreadMessage[] {
	const threads = (state as { threads?: Array<{ messages?: unknown[] }> })?.threads ?? [];
	const messages: CoralThreadMessage[] = [];
	for (const thread of threads) {
		for (const message of thread.messages ?? []) {
			const text = stringifyMessageContent(message);
			if (!text) continue;
			messages.push({ source: messageSource(message), text });
		}
	}
	return messages;
}

function inferSpecialist(message: CoralThreadMessage): (typeof SPECIALIST_ALIASES)[number] | null {
	const haystack = `${message.source} ${message.text}`.toLowerCase();
	return (
		SPECIALIST_ALIASES.find((entry) => entry.aliases.some((alias) => haystack.includes(alias))) ?? null
	);
}

function severityFromText(text: string): CompositionReportFinding['severity'] {
	const lower = text.toLowerCase();
	if (/(critical|severe|fragile|high risk|not executable|do not|unsupported)/.test(lower)) {
		return 'warning';
	}
	if (/(watch|caution|thin|volatile|spike|market-data-only|missing|weak|limited)/.test(lower)) {
		return 'watch';
	}
	return 'info';
}

function titleFromText(text: string, fallback: string): string {
	const firstSentence = text.split(/[.\n]/)[0]?.trim();
	if (!firstSentence || firstSentence.length > 80) return fallback;
	return firstSentence.replace(/^[-*]\s*/, '');
}

function stripSpecialistPrefix(text: string, specialist: CompositionReportFinding['specialist']): string {
	const label = SPECIALIST_ALIASES.find((entry) => entry.specialist === specialist);
	const aliases = label?.aliases ?? [];
	let cleaned = text;
	for (const alias of aliases) {
		const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		cleaned = cleaned.replace(new RegExp(`^${escaped}\\s*:?\\s*`, 'i'), '');
	}
	return cleaned
		.replace(/^rate quality specialist\s*:\s*/i, '')
		.replace(/^exit liquidity specialist\s*:\s*/i, '')
		.replace(/^capacity\/concentration findings\s+for\s+[^:]+:\s*/i, '')
		.replace(/^strategy exposure classification\s*\([^)]*\)\s*:\s*/i, '')
		.trim();
}

function extractJsonBlock(text: string): unknown | null {
	const markerIndex = text.lastIndexOf('FABRICK_REPORT_JSON');
	if (markerIndex < 0) return null;
	const block = text.slice(markerIndex + 'FABRICK_REPORT_JSON'.length);
	const fenced = block.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced?.[1] ?? block.slice(block.indexOf('{'));
	if (!candidate || !candidate.includes('{')) return null;
	try {
		return JSON.parse(candidate.trim());
	} catch {
		return null;
	}
}

function parseStructuredOutput(messages: CoralThreadMessage[]): Omit<CoralCompositionOutput, 'messageCount'> | null {
	for (const message of [...messages].reverse()) {
		const parsed = extractJsonBlock(message.text);
		if (!parsed || typeof parsed !== 'object') continue;
		const obj = parsed as {
			findings?: unknown[];
			keyWarnings?: unknown[];
			narratorCopy?: Partial<CompositionReport['narratorCopy']>;
		};
		const findings = (obj.findings ?? [])
			.map((finding) => compositionReportFindingSchema.safeParse(finding))
			.filter((result) => result.success)
			.map((result) => result.data);
		const keyWarnings = (obj.keyWarnings ?? []).filter((item): item is string => typeof item === 'string');
		const narratorCopy =
			obj.narratorCopy && typeof obj.narratorCopy === 'object'
				? {
						overview:
							typeof obj.narratorCopy.overview === 'string'
								? obj.narratorCopy.overview
								: undefined,
						weightingRationale:
							typeof obj.narratorCopy.weightingRationale === 'string'
								? obj.narratorCopy.weightingRationale
								: undefined,
						rebalancing:
							typeof obj.narratorCopy.rebalancing === 'string'
								? obj.narratorCopy.rebalancing
								: undefined
					}
				: undefined;
		if (findings.length || keyWarnings.length || narratorCopy) {
			return { findings, keyWarnings, narratorCopy };
		}
	}
	return null;
}

function parseMessageFindings(messages: CoralThreadMessage[]): CompositionReportFinding[] {
	const seen = new Set<CompositionReportFinding['specialist']>();
	const findings: CompositionReportFinding[] = [];
	for (const message of messages) {
		const entry = inferSpecialist(message);
		if (!entry || seen.has(entry.specialist)) continue;
		if (entry.specialist === 'narrator') continue;
		if (looksLikeInstructionEcho(message.text)) continue;
		const stripped = stripSpecialistPrefix(message.text, entry.specialist);
		const body = compactText(stripped, 420);
		if (body.length < 20) continue;
		seen.add(entry.specialist);
		findings.push({
			specialist: entry.specialist,
			title: titleFromText(body, entry.defaultTitle),
			severity: severityFromText(body),
			body
		});
	}
	return findings;
}

function extractWarnings(findings: CompositionReportFinding[]): string[] {
	return findings
		.filter((finding) => finding.severity !== 'info' && finding.specialist !== 'narrator')
		.map((finding) => compactText(`${finding.title}: ${finding.body}`, 260))
		.slice(0, 4);
}

export function parseCoralCompositionOutput(state: unknown): CoralCompositionOutput | null {
	const messages = extractCoralThreadMessages(state);
	if (!messages.length) return null;

	const structured = parseStructuredOutput(messages);
	if (structured) {
		return {
			findings: structured.findings,
			keyWarnings: structured.keyWarnings,
			messageCount: messages.length,
			narratorCopy: structured.narratorCopy
		};
	}

	const findings = parseMessageFindings(messages);
	if (!findings.length) return null;
	return {
		findings,
		keyWarnings: extractWarnings(findings),
		messageCount: messages.length
	};
}

function isTerminalSessionState(state: unknown): boolean {
	const baseStatus = (state as { base?: { status?: { type?: string } } })?.base?.status?.type;
	if (baseStatus && ['closed', 'completed', 'failed', 'timed_out'].includes(baseStatus)) return true;
	const agents = (state as { agents?: Array<{ status?: { type?: string } }> })?.agents ?? [];
	return agents.length > 0 && agents.every((agent) => agent.status?.type === 'stopped');
}

async function pollCoralCompositionOutput(
	apiKey: string,
	ns: string,
	sessionId: string
): Promise<{ output: CoralCompositionOutput | null; terminal: boolean }> {
	const deadline = Date.now() + reportWaitMs();
	let lastOutput: CoralCompositionOutput | null = null;
	let terminal = false;

	while (Date.now() <= deadline) {
		const result = await coralFetch(
			`/api/v1/local/session/${encodeURIComponent(ns)}/${encodeURIComponent(sessionId)}/extended`,
			apiKey,
			{ method: 'GET' }
		);
		if (result.ok) {
			lastOutput = parseCoralCompositionOutput(result.body) ?? lastOutput;
			terminal = isTerminalSessionState(result.body);
			if (terminal && lastOutput) return { output: lastOutput, terminal };
		}
		if (reportWaitMs() === 0) break;
		await new Promise((resolve) => setTimeout(resolve, CORAL_POLL_INTERVAL_MS));
	}

	return { output: lastOutput, terminal };
}

export async function tryRunCoralCompositionSession(
	input: CoralCompositionSessionInput
): Promise<CoralCompositionSessionResult> {
	const apiKey = process.env.CORAL_API_KEY?.trim();
	if (!apiKey) {
		return {
			coordination: {
				runtime: 'local_schema',
				status: 'unavailable',
				message: 'CORAL_API_KEY is not configured for this server process.'
			}
		};
	}

	const ns = namespace();
	const linkedServer = linkedServerName();
	try {
		const registry = await listRegistry(apiKey);
		const missing = findMissingCompositionAgents(registry, linkedServer);
		if (missing.length) {
			return {
				coordination: {
					runtime: 'local_schema',
					status: 'unavailable',
					namespace: ns,
					message: `${registryTarget(linkedServer)} is missing Fabrick prototype agents: ${missing.join(', ')}. Expose these agents through Coral Cloud custom-agent registration or a linked Coral Server, then rerun the report.`
				}
			};
		}

		const result = await coralFetch(
			'/api/v1/local/session',
			apiKey,
			{
				body: buildCoralCompositionSessionRequest({
					linkedServer,
					namespace: ns,
					savingsMcpUrl: savingsMcpUrl(),
					task: buildCoralCompositionTask(input)
				})
			}
		);

		if (!result.ok) {
			return {
				coordination: {
					runtime: 'local_schema',
					status: 'unavailable',
					namespace: ns,
					message: `Coral session create failed with HTTP ${result.status}: ${typeof result.body === 'string' ? result.body : JSON.stringify(result.body)}`
				}
			};
		}

		const sessionId =
			result.body && typeof result.body === 'object' && 'sessionId' in result.body
				? String((result.body as { sessionId: unknown }).sessionId)
				: undefined;

		if (!sessionId) {
			return {
				coordination: {
					runtime: 'coral_cloud',
					status: 'session_created',
					namespace: ns,
					message:
						'Coral specialist session was created, but the response did not include a session id to poll.'
				}
			};
		}

		const { output, terminal } = await pollCoralCompositionOutput(apiKey, ns, sessionId);
		if (output) {
			return {
				coordination: {
					runtime: 'coral_cloud',
					status: terminal ? 'completed' : 'session_created',
					namespace: ns,
					sessionId,
					message: `Coral specialist output parsed from ${output.messageCount} thread messages.`
				},
				output
			};
		}

		return {
			coordination: {
				runtime: 'coral_cloud',
				status: 'session_created',
				namespace: ns,
				sessionId,
				message:
					'Coral specialist session was created, but no parseable specialist output was available before the report timeout.'
			}
		};
	} catch (err) {
		return {
			coordination: {
				runtime: 'local_schema',
				status: 'unavailable',
				namespace: ns,
				message: `Coral report session unavailable: ${summarizeFailure(err)}`
			}
		};
	}
}

export async function tryCreateCoralCompositionSession(
	input: CoralCompositionSessionInput
): Promise<CompositionReport['coordination']> {
	const result = await tryRunCoralCompositionSession(input);
	return result.coordination;
}
