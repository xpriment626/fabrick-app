#!/usr/bin/env tsx
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MCP_DIR = '/Users/bambozlor/Desktop/studio/savings-mcp';
const DEFAULT_MCP_URL = 'http://127.0.0.1:8788/mcp';
const DEFAULT_NAMESPACE = 'fabrick-savings-smoke';
const DEFAULT_TASK =
	'Build a Fabrick Advanced Account Composition Report for selected USDC opportunities.';
const MCP_READY_TIMEOUT_MS = 30_000;
const CORAL_READY_TIMEOUT_MS = 60_000;
const CORAL_OUTPUT_TIMEOUT_MS = 180_000;
const CORAL_MIN_COORDINATION_MESSAGES = 3;
const POLL_INTERVAL_MS = 1_500;
const CHILD_SHUTDOWN_GRACE_MS = 1_500;

export const CORAL_CLOUD_API_URL = 'https://api.coralcloud.ai';

export type SavingsSpecialist = {
	registryName: string;
	instanceName: string;
	version: string;
	directory: string;
	description: string;
};

export const SAVINGS_SPECIALISTS: SavingsSpecialist[] = [
	{
		registryName: 'fabrick-opp-interpreter',
		instanceName: 'opportunity-interpreter',
		version: '0.1.0',
		directory: 'opportunity-data-interpreter',
		description: 'Explains Savings MCP USDC opportunity data for Fabrick account concepts.'
	},
	{
		registryName: 'fabrick-rate-quality',
		instanceName: 'rate-quality',
		version: '0.1.0',
		directory: 'rate-quality-specialist',
		description: 'Assesses APY quality, stability, reward composition, and rate-data weakness.'
	},
	{
		registryName: 'fabrick-exit-liquidity',
		instanceName: 'exit-liquidity',
		version: '0.1.0',
		directory: 'exit-liquidity-specialist',
		description: 'Assesses withdrawal mechanics, utilization, buffers, and exit fragility.'
	},
	{
		registryName: 'fabrick-capacity-risk',
		instanceName: 'capacity-concentration',
		version: '0.1.0',
		directory: 'capacity-concentration-specialist',
		description: 'Assesses account concentration, venue depth, and rebalance deltas.'
	},
	{
		registryName: 'fabrick-exposure',
		instanceName: 'strategy-exposure',
		version: '0.1.0',
		directory: 'strategy-exposure-specialist',
		description: 'Classifies stablecoin savings exposure and flags complex strategy risk.'
	},
	{
		registryName: 'fabrick-strategy-narrator',
		instanceName: 'account-narrator',
		version: '0.1.0',
		directory: 'account-strategy-narrator',
		description: 'Coordinates specialist findings into preview-safe user-facing narration.'
	}
];

type AgentOptionValue =
	| { type: 'string'; value: string }
	| { type: 'u32'; value: number }
	| { type: 'bool'; value: boolean }
	| { type: 'list[string]'; value: string[] };

type RegistrySourceId =
	| { type: 'local' }
	| { type: 'linked'; linkedServerId: string };

type AgentProvider =
	| { type: 'local'; runtime: 'prototype' | 'function' }
	| { type: 'linked'; linkedServerName: string; runtime: 'prototype' };

type SessionAgentRequest = {
	id: {
		name: string;
		version: string;
		registrySourceId: RegistrySourceId;
	};
	name: string;
	description: string;
	blocking: boolean;
	provider: AgentProvider;
	options: Record<string, AgentOptionValue>;
};

export type CoralSessionRequest = {
	agentGraphRequest: {
		agents: SessionAgentRequest[];
		groups: string[][];
		customTools: Record<string, never>;
	};
	namespaceProvider: {
		type: 'create_if_not_exists';
		namespaceRequest: {
			name: string;
			deleteOnLastSessionExit: boolean;
			annotations: Record<string, string>;
		};
	};
	execution: {
		mode: 'immediate';
		runtimeSettings: {
			ttl: number;
			extendedEndReport: boolean;
			persistenceMode: { mode: 'hold_after_exit'; duration: number };
		};
	};
	annotations: Record<string, string>;
};

type RegistryGroup = {
	identifier?: { type?: string; linkedServerId?: string };
	agents?: Array<{ name: string; versions?: string[] }>;
};

type HttpResult = {
	ok: boolean;
	status: number;
	statusText: string;
	body: unknown;
};

type SessionPollOptions = {
	minMessages?: number;
	requireTerminal?: boolean;
	timeoutMs?: number;
};

type SmokeOpportunity = {
	id?: string;
	title?: string;
	venue?: string;
	product_type?: string;
	integrationStatus?: string;
};

type SmokeAllocationPayload = {
	allocation?: {
		weights?: Array<{ opportunityId: string; title: string; weightPct: number; apy: number }>;
		blendedApyPct?: number;
		riskEnvelope?: string;
		rationale?: string;
	};
};

type SmokeConfig = {
	apiUrl: string;
	envFile: string;
	mcpDir: string;
	mcpUrl: string;
	namespace: string;
	startMcp: boolean;
	task: string;
	linkedServer?: string;
};

function stripQuotes(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

export function readEnvFile(
	contents: string,
	base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
	const parsed: NodeJS.ProcessEnv = {};
	for (const line of contents.split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;
		if (base[match[1]] !== undefined) continue;
		parsed[match[1]] = stripQuotes(match[2]);
	}
	return { ...parsed, ...base };
}

function loadEnv(envFile: string): NodeJS.ProcessEnv {
	if (!existsSync(envFile)) return process.env;
	return readEnvFile(readFileSync(envFile, 'utf8'), process.env);
}

export function buildSessionRequest(input: {
	namespace: string;
	savingsMcpUrl: string;
	task: string;
	linkedServer?: string;
}): CoralSessionRequest {
	return {
		agentGraphRequest: {
			agents: SAVINGS_SPECIALISTS.map((specialist) => ({
				id: {
					name: specialist.registryName,
					version: specialist.version,
					registrySourceId: buildRegistrySourceId(input.linkedServer)
				},
				name: specialist.instanceName,
				description: specialist.description,
				blocking: true,
				provider: buildSpecialistProvider(input.linkedServer),
				options: {
					SAVINGS_MCP_URL: { type: 'string', value: input.savingsMcpUrl },
					SMOKE_TASK: { type: 'string', value: input.task }
				}
			})),
			groups: [SAVINGS_SPECIALISTS.map((specialist) => specialist.instanceName)],
			customTools: {}
		},
		namespaceProvider: {
			type: 'create_if_not_exists',
			namespaceRequest: {
				name: input.namespace,
				deleteOnLastSessionExit: true,
				annotations: { app: 'fabrick', surface: 'savings-specialists' }
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
		annotations: {
			app: 'fabrick',
			smoke: 'savings-specialists'
		}
	};
}

function buildRegistrySourceId(linkedServer?: string): RegistrySourceId {
	return linkedServer ? { type: 'linked', linkedServerId: linkedServer } : { type: 'local' };
}

function buildSpecialistProvider(linkedServer?: string): AgentProvider {
	return linkedServer
		? { type: 'linked', linkedServerName: linkedServer, runtime: 'prototype' }
		: { type: 'local', runtime: 'prototype' };
}

export function buildBuiltinCoordinationRequest(namespace: string): CoralSessionRequest {
	return {
		agentGraphRequest: {
			agents: [
				{
					id: {
						name: 'seed',
						version: '1.0.0',
						registrySourceId: { type: 'local' }
					},
					name: 'seed',
					description: 'Creates a thread and mentions echo to verify Coral Cloud coordination.',
					blocking: true,
					provider: { type: 'local', runtime: 'function' },
					options: {
						SEED_THREAD_COUNT: { type: 'u32', value: 1 },
						SEED_MESSAGE_COUNT: { type: 'u32', value: 1 },
						OPERATION_DELAY: { type: 'u32', value: 100 },
						PARTICIPANTS: { type: 'list[string]', value: ['seed', 'echo'] },
						MENTIONS: { type: 'list[string]', value: ['echo'] }
					}
				},
				{
					id: {
						name: 'echo',
						version: '1.0.0',
						registrySourceId: { type: 'local' }
					},
					name: 'echo',
					description: 'Echoes mentioned messages to verify thread/message flow.',
					blocking: true,
					provider: { type: 'local', runtime: 'function' },
					options: {
						ITERATION_COUNT: { type: 'u32', value: 2 },
						MENTIONS: { type: 'bool', value: true }
					}
				}
			],
			groups: [['seed', 'echo']],
			customTools: {}
		},
		namespaceProvider: {
			type: 'create_if_not_exists',
			namespaceRequest: {
				name: namespace,
				deleteOnLastSessionExit: true,
				annotations: { app: 'fabrick', surface: 'coral-cloud-builtin-smoke' }
			}
		},
		execution: {
			mode: 'immediate',
			runtimeSettings: {
				ttl: 120_000,
				extendedEndReport: true,
				persistenceMode: { mode: 'hold_after_exit', duration: 120_000 }
			}
		},
		annotations: {
			app: 'fabrick',
			smoke: 'coral-cloud-builtin'
		}
	};
}

export function findMissingRegistryAgents(registry: RegistryGroup[], linkedServer?: string): string[] {
	const matchingGroups = registry.filter((group) => {
		const identifier = group.identifier;
		if (!linkedServer) return identifier?.type === 'local';
		return identifier?.type === 'linked' && identifier.linkedServerId === linkedServer;
	});
	return SAVINGS_SPECIALISTS.filter((specialist) => {
		return !matchingGroups.some((group) =>
			group.agents?.some(
				(agent) =>
					agent.name === specialist.registryName && agent.versions?.includes(specialist.version)
			)
		);
	}).map((agent) => `${agent.registryName}@${agent.version}`);
}

export function buildLocalAgentRegistryPaths(appRoot = APP_ROOT): string[] {
	return SAVINGS_SPECIALISTS.map((specialist) =>
		join(appRoot, 'agents', 'savings-specialists', specialist.directory)
	);
}

export function buildReportSmokeTask(input: {
	amountUsd: number;
	opportunities: SmokeOpportunity[];
	allocation: SmokeAllocationPayload;
	riskPreference: string;
}): string {
	return [
		'Build a Fabrick Advanced Account Composition Report for this fixed preview.',
		'The user already selected these pools. Do not recommend different pools.',
		'Coordinate specialist findings for: opportunity semantics, rate quality, exit liquidity, capacity/concentration, exposure, and narrator copy.',
		'Return preview-safe report content only. Do not prepare, sign, submit, or mutate anything.',
		'Report input:',
		JSON.stringify(
			{
				amountUsd: input.amountUsd,
				riskPreference: input.riskPreference,
				opportunities: input.opportunities,
				allocation: input.allocation.allocation
			},
			null,
			2
		)
	].join('\n\n');
}

function formatLocalAgentRegistryPaths(): string {
	return buildLocalAgentRegistryPaths()
		.map((agentPath) => `  - ${agentPath}`)
		.join('\n');
}

function missingRegistryNextAction(apiUrl: string, linkedServer?: string): string {
	const target = linkedServer
		? `the Coral linked registry source "${linkedServer}" used by ${apiUrl}`
		: `the Coral registry used by ${apiUrl}`;
	return [
		`Expose the six Fabrick prototype agents to ${target}.`,
		'For a self-hosted/local Coral Server, add these directories to [registry].local_agents:',
		`\n${formatLocalAgentRegistryPaths()}\n`,
		'For Coral Cloud, use --linked-server=<name> after the linked source exists, or Cloud custom-agent registration once available, then rerun this smoke command.'
	].join(' ');
}

function parseArgs(argv: string[]): SmokeConfig {
	const config: SmokeConfig = {
		apiUrl: process.env.CORAL_CLOUD_API_URL || CORAL_CLOUD_API_URL,
		envFile: join(APP_ROOT, '.env'),
		mcpDir: process.env.SAVINGS_MCP_DIR || DEFAULT_MCP_DIR,
		mcpUrl: process.env.SAVINGS_MCP_URL || DEFAULT_MCP_URL,
		namespace: DEFAULT_NAMESPACE,
		startMcp: true,
		task: DEFAULT_TASK,
		linkedServer: process.env.CORAL_LINKED_SERVER_NAME || undefined
	};

	for (const arg of argv) {
		if (arg === '--no-start-mcp') config.startMcp = false;
		else if (arg.startsWith('--api-url=')) config.apiUrl = arg.slice('--api-url='.length);
		else if (arg.startsWith('--env-file=')) config.envFile = arg.slice('--env-file='.length);
		else if (arg.startsWith('--mcp-dir=')) config.mcpDir = arg.slice('--mcp-dir='.length);
		else if (arg.startsWith('--mcp-url=')) config.mcpUrl = arg.slice('--mcp-url='.length);
		else if (arg.startsWith('--namespace=')) config.namespace = arg.slice('--namespace='.length);
		else if (arg.startsWith('--task=')) config.task = arg.slice('--task='.length);
		else if (arg.startsWith('--linked-server=')) {
			const value = arg.slice('--linked-server='.length).trim();
			if (!value) throw new Error('--linked-server requires a non-empty server name');
			config.linkedServer = value;
		}
		else if (arg === '--help' || arg === '-h') {
			printHelp();
			process.exit(0);
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return config;
}

function printHelp(): void {
	console.log(`Usage: npm run smoke:coral:savings -- [options]

Options:
  --namespace=<name>    Coral namespace (default: ${DEFAULT_NAMESPACE})
  --mcp-dir=<path>     Savings MCP repo path (default: ${DEFAULT_MCP_DIR})
  --mcp-url=<url>      Savings MCP endpoint (default: ${DEFAULT_MCP_URL})
  --task=<text>        Smoke task passed to prototype agents
  --linked-server=<n>  Use a Coral linked registry/provider instead of Cloud local registry
  --no-start-mcp       Reuse an already-running Savings MCP server
  --api-url=<url>      Coral Cloud API URL (default: ${CORAL_CLOUD_API_URL})
  --env-file=<path>    Env file to load before reading CORAL_API_KEY
  -h, --help           Show this help text`);
}

function pipeChildLogs(label: string, child: ChildProcessWithoutNullStreams): void {
	const prefix = `[${label}] `;
	child.stdout.on('data', (chunk) => process.stdout.write(prefixLines(prefix, String(chunk))));
	child.stderr.on('data', (chunk) => process.stderr.write(prefixLines(prefix, String(chunk))));
}

function prefixLines(prefix: string, chunk: string): string {
	return chunk
		.split(/\r?\n/)
		.map((line) => (line ? `${prefix}${line}` : line))
		.join('\n');
}

function spawnSavingsMcp(config: SmokeConfig, env: NodeJS.ProcessEnv): ChildProcessWithoutNullStreams {
	if (!existsSync(join(config.mcpDir, 'package.json'))) {
		throw new Error(`Savings MCP directory is missing a package.json: ${config.mcpDir}`);
	}

	const child = spawn('npm', ['run', 'dev'], {
		cwd: config.mcpDir,
		detached: true,
		env: buildMcpEnv(env, config.mcpUrl),
		stdio: ['ignore', 'pipe', 'pipe']
	});
	pipeChildLogs('savings-mcp', child);
	return child;
}

function buildMcpEnv(base: NodeJS.ProcessEnv, mcpUrl: string): NodeJS.ProcessEnv {
	const env = { ...base };
	const url = new URL(mcpUrl);
	if (url.hostname) env.HOST = url.hostname;
	if (url.port) env.PORT = url.port;
	return env;
}

function terminateChild(label: string, child: ChildProcessWithoutNullStreams): void {
	if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
	try {
		process.kill(-child.pid, 'SIGTERM');
		console.log(`[smoke] Stopping ${label}`);
	} catch {
		return;
	}

	setTimeout(() => {
		if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
		try {
			process.kill(-child.pid, 'SIGKILL');
		} catch {
			// Already stopped.
		}
	}, CHILD_SHUTDOWN_GRACE_MS).unref();
}

async function waitForSavingsMcp(
	mcpUrl: string,
	isProcessAlive: () => boolean = () => true
): Promise<string[]> {
	const deadline = Date.now() + MCP_READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (!isProcessAlive()) throw new Error('Savings MCP exited before it became ready');
		try {
			const response = await fetch(mcpUrl, {
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
				signal: AbortSignal.timeout(2_000)
			});
			const payload = (await response.json()) as { result?: { tools?: Array<{ name: string }> } };
			const tools = payload.result?.tools?.map((tool) => tool.name) ?? [];
			if (response.ok && tools.length > 0) return tools;
		} catch {
			// Retry while the MCP process boots.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Savings MCP did not become ready at ${mcpUrl}`);
}

async function callSavingsMcpTool<T>(
	mcpUrl: string,
	name: string,
	toolArguments: Record<string, unknown>
): Promise<T> {
	const response = await fetch(mcpUrl, {
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: `${name}-${Date.now()}`,
			method: 'tools/call',
			params: { name, arguments: toolArguments }
		}),
		headers: { 'content-type': 'application/json' },
		method: 'POST',
		signal: AbortSignal.timeout(20_000)
	});
	const payload = (await response.json()) as {
		result?: { structuredContent?: T };
		error?: { message: string };
	};
	if (!response.ok) throw new Error(`Savings MCP ${name} returned HTTP ${response.status}`);
	if (payload.error) throw new Error(`Savings MCP ${name}: ${payload.error.message}`);
	if (!payload.result?.structuredContent) throw new Error(`Savings MCP ${name} returned no data`);
	return payload.result.structuredContent;
}

async function coralFetch(
	apiUrl: string,
	apiKey: string,
	path: string,
	options: RequestInit = {}
): Promise<HttpResult> {
	const response = await fetch(`${apiUrl}${path}`, {
		...options,
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${apiKey}`,
			...options.headers
		},
		signal: options.signal ?? AbortSignal.timeout(30_000)
	});
	const text = await response.text();
	let body: unknown = text;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		// Keep raw text.
	}
	return { ok: response.ok, status: response.status, statusText: response.statusText, body };
}

async function listRegistry(apiUrl: string, apiKey: string): Promise<RegistryGroup[]> {
	const result = await coralFetch(apiUrl, apiKey, '/api/v1/registry');
	if (!result.ok) {
		throw new Error(`Coral registry list failed: HTTP ${result.status} ${formatBody(result.body)}`);
	}
	return Array.isArray(result.body) ? (result.body as RegistryGroup[]) : [];
}

async function createNamespace(config: SmokeConfig, apiKey: string): Promise<HttpResult> {
	return coralFetch(config.apiUrl, apiKey, '/api/v1/local/namespace', {
		method: 'POST',
		body: JSON.stringify({
			name: config.namespace,
			deleteOnLastSessionExit: true,
			annotations: { app: 'fabrick', smoke: 'savings-specialists' }
		})
	});
}

async function createSession(config: SmokeConfig, apiKey: string): Promise<HttpResult> {
	return coralFetch(config.apiUrl, apiKey, '/api/v1/local/session', {
		method: 'POST',
		body: JSON.stringify(
			buildSessionRequest({
				namespace: config.namespace,
				savingsMcpUrl: config.mcpUrl,
				task: config.task,
				linkedServer: config.linkedServer
			})
		)
	});
}

async function createBuiltinCoordinationSession(
	config: SmokeConfig,
	apiKey: string,
	namespace: string
): Promise<HttpResult> {
	return coralFetch(config.apiUrl, apiKey, '/api/v1/local/session', {
		method: 'POST',
		body: JSON.stringify(buildBuiltinCoordinationRequest(namespace))
	});
}

async function pollSessionState(
	config: SmokeConfig,
	apiKey: string,
	sessionId: string,
	options: SessionPollOptions = {}
): Promise<unknown> {
	const minMessages = options.minMessages ?? 0;
	const requireTerminal = options.requireTerminal ?? false;
	const deadline = Date.now() + (options.timeoutMs ?? CORAL_READY_TIMEOUT_MS);
	let lastState: unknown = null;
	while (Date.now() < deadline) {
		const result = await coralFetch(
			config.apiUrl,
			apiKey,
			`/api/v1/local/session/${encodeURIComponent(config.namespace)}/${encodeURIComponent(sessionId)}/extended`,
			{ method: 'GET', signal: AbortSignal.timeout(10_000) }
		);
		if (!result.ok) {
			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
			continue;
		}

		lastState = result.body;
		const state = result.body as { agents?: Array<{ isConnected?: boolean }>; threads?: unknown[] };
		const connected = state.agents?.every((agent) => agent.isConnected) ?? false;
		const hasThreads = Boolean(state.threads?.length);
		const messageCount = countMessages(result.body);
		const terminal = isTerminalSessionState(result.body);

		if (minMessages > 0) {
			if (messageCount >= minMessages && (!requireTerminal || terminal)) return result.body;
			if (terminal && messageCount < minMessages) {
				throw new Error(
					`Coral session ended before producing ${minMessages} messages. ${summarizeSessionState(result.body)}`
				);
			}
		} else if (connected || hasThreads) {
			return result.body;
		}

		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
	if (minMessages > 0) {
		throw new Error(
			`Timed out waiting for Coral session output. Expected ${minMessages} messages${
				requireTerminal ? ' and terminal state' : ''
			}. ${summarizeSessionState(lastState)}`
		);
	}
	return lastState;
}

function formatBody(body: unknown): string {
	return typeof body === 'string' ? body : JSON.stringify(body, null, 2);
}

export function countMessages(state: unknown): number {
	const threads = (state as { threads?: Array<{ messages?: unknown[] }> })?.threads ?? [];
	return threads.reduce((count, thread) => count + (thread.messages?.length ?? 0), 0);
}

export function isTerminalSessionState(state: unknown): boolean {
	const baseStatus = (state as { base?: { status?: { type?: string } } })?.base?.status?.type;
	if (baseStatus && ['closed', 'completed', 'failed', 'timed_out'].includes(baseStatus)) {
		return true;
	}

	const agents = (state as { agents?: Array<{ status?: { type?: string } }> })?.agents ?? [];
	return agents.length > 0 && agents.every((agent) => agent.status?.type === 'stopped');
}

function summarizeSessionState(state: unknown): string {
	if (!state) return 'No session state was returned.';
	const baseStatus = (state as { base?: { status?: { type?: string } } })?.base?.status?.type ?? 'unknown';
	const threads = (state as { threads?: unknown[] })?.threads?.length ?? 0;
	const messages = countMessages(state);
	return `Last state: status=${baseStatus}, threads=${threads}, messages=${messages}.`;
}

async function runBuiltinFallback(config: SmokeConfig, apiKey: string): Promise<void> {
	const namespace = `${config.namespace}-builtin`;
	const sessionResult = await createBuiltinCoordinationSession(config, apiKey, namespace);
	console.log(
		`[smoke] Built-in fallback session create: HTTP ${sessionResult.status} ${formatBody(sessionResult.body)}`
	);
	if (!sessionResult.ok) return;

	const sessionId = (sessionResult.body as { sessionId?: string }).sessionId;
	if (!sessionId) return;
	const fallbackConfig = { ...config, namespace };
	const state = await pollSessionState(fallbackConfig, apiKey, sessionId, {
		minMessages: 1,
		timeoutMs: CORAL_READY_TIMEOUT_MS
	});
	console.log(`[smoke] Built-in fallback messages: ${countMessages(state)}`);
	console.log(`[smoke] Built-in fallback Cloud namespace=${namespace} session=${sessionId}`);
}

async function main(argv = process.argv.slice(2)): Promise<void> {
	const config = parseArgs(argv);
	const env = loadEnv(config.envFile);
	const apiKey = env.CORAL_API_KEY;
	if (!apiKey) throw new Error(`CORAL_API_KEY is missing. Checked ${config.envFile}`);

	let mcpProcess: ChildProcessWithoutNullStreams | null = null;
	try {
		console.log(`[smoke] Savings MCP URL: ${config.mcpUrl}`);
		if (config.startMcp) {
			console.log(`[smoke] Starting Savings MCP from ${config.mcpDir}`);
			mcpProcess = spawnSavingsMcp(config, env);
		} else {
			console.log('[smoke] Reusing already-running Savings MCP');
		}

		const tools = await waitForSavingsMcp(
			config.mcpUrl,
			() => !mcpProcess || (mcpProcess.exitCode === null && mcpProcess.signalCode === null)
		);
		console.log(`[smoke] Savings MCP ready. Tools: ${tools.join(', ')}`);

		const catalogue = await callSavingsMcpTool<{ opportunities?: SmokeOpportunity[] }>(
			config.mcpUrl,
			'get_usdc_opportunities',
			{ minTvlUsd: 1_000_000, refresh: false }
		);
		console.log(`[smoke] Savings MCP opportunities: ${catalogue.opportunities?.length ?? 0}`);

		const selected = (catalogue.opportunities ?? [])
			.filter(
				(opportunity): opportunity is SmokeOpportunity & { id: string } =>
					typeof opportunity.id === 'string' && Boolean(opportunity.id)
			)
			.slice(0, 3);
		if (selected.length >= 2) {
			const allocation = await callSavingsMcpTool<SmokeAllocationPayload>(
				config.mcpUrl,
				'propose_allocation',
				{
					opportunityIds: selected.map((opportunity) => opportunity.id),
					amountUsd: 1000,
					riskPreference: 'balanced',
					nudges: []
				}
			);
			console.log(
				`[smoke] Savings MCP allocation weights: ${allocation.allocation?.weights?.length ?? 0}`
			);
			if (config.task === DEFAULT_TASK) {
				config.task = buildReportSmokeTask({
					amountUsd: 1000,
					opportunities: selected,
					allocation,
					riskPreference: 'balanced'
				});
			}
		}

		const registry = await listRegistry(config.apiUrl, apiKey);
		const missing = findMissingRegistryAgents(registry, config.linkedServer);
		if (missing.length) {
			console.warn(`[smoke] Coral registry is missing: ${missing.join(', ')}`);
			console.warn(`[smoke] ${missingRegistryNextAction(config.apiUrl, config.linkedServer)}`);
		}

		const namespaceResult = await createNamespace(config, apiKey);
		console.log(
			`[smoke] Namespace create: HTTP ${namespaceResult.status} ${formatBody(namespaceResult.body)}`
		);

		const sessionResult = await createSession(config, apiKey);
		console.log(`[smoke] Session create: HTTP ${sessionResult.status} ${formatBody(sessionResult.body)}`);
		if (!sessionResult.ok) {
			if (missing.length) await runBuiltinFallback(config, apiKey);
			throw new Error(
				`Coral session create failed. Command: POST ${config.apiUrl}/api/v1/local/session. Response: HTTP ${sessionResult.status} ${formatBody(sessionResult.body)}. Next action: ${missingRegistryNextAction(config.apiUrl, config.linkedServer)}`
			);
		}

		const sessionId = (sessionResult.body as { sessionId?: string }).sessionId;
		if (!sessionId) throw new Error(`Coral session response did not include sessionId`);
		const state = await pollSessionState(config, apiKey, sessionId, {
			minMessages: CORAL_MIN_COORDINATION_MESSAGES,
			requireTerminal: true,
			timeoutMs: CORAL_OUTPUT_TIMEOUT_MS
		});
		console.log(`[smoke] Session state messages: ${countMessages(state)}`);
		console.log(`[smoke] View in Coral Cloud namespace=${config.namespace} session=${sessionId}`);
	} finally {
		if (mcpProcess) terminateChild('Savings MCP', mcpProcess);
	}
}

const isCliEntrypoint = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isCliEntrypoint) {
	main().catch((error) => {
		console.error(`[smoke] ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	});
}
