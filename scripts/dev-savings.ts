#!/usr/bin/env tsx
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MCP_DIR = '/Users/bambozlor/Desktop/studio/savings-mcp';
const DEFAULT_MCP_URL = 'http://127.0.0.1:8788/mcp';
const DEFAULT_CORAL_API_URL = 'http://127.0.0.1:5555';
const DEFAULT_CORAL_AUTH_KEY = 'dev';
const DEFAULT_CORAL_CONFIG = join(APP_ROOT, 'agents', 'fabrick-coral-local.toml');
const DEFAULT_APP_HOST = '127.0.0.1';
const MCP_READY_TIMEOUT_MS = 30_000;
const CORAL_READY_TIMEOUT_MS = 120_000;
const MCP_READY_INTERVAL_MS = 500;
const CHILD_SHUTDOWN_GRACE_MS = 1_500;
const EXPECTED_CORAL_AGENTS = [
	'fabrick-opp-interpreter',
	'fabrick-rate-quality',
	'fabrick-exit-liquidity',
	'fabrick-capacity-risk',
	'fabrick-exposure',
	'fabrick-strategy-narrator'
];
const CODEX_BUNDLED_NODE_PATH_FRAGMENT = 'codex-runtimes/codex-primary-runtime/dependencies/node/bin';

export type LauncherConfig = {
	appHost: string;
	coralApiUrl: string;
	coralAuthKey: string;
	coralConfigPath: string;
	coralFromSource: boolean;
	detachedChildren: boolean;
	bypass: boolean;
	help: boolean;
	mcpDir: string;
	mcpUrl: string;
	startCoral: boolean;
};

export function parseLauncherArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): LauncherConfig {
	const config: LauncherConfig = {
		appHost: env.FABRICK_DEV_HOST || DEFAULT_APP_HOST,
		coralApiUrl: env.FABRICK_CORAL_API_URL || DEFAULT_CORAL_API_URL,
		coralAuthKey: env.CORAL_LOCAL_API_KEY || DEFAULT_CORAL_AUTH_KEY,
		coralConfigPath: env.FABRICK_CORAL_CONFIG || DEFAULT_CORAL_CONFIG,
		coralFromSource: env.FABRICK_CORAL_FROM_SOURCE !== '0',
		detachedChildren: env.FABRICK_DEV_ATTACHED !== '1',
		bypass: false,
		help: false,
		mcpDir: env.SAVINGS_MCP_DIR || DEFAULT_MCP_DIR,
		mcpUrl: env.SAVINGS_MCP_URL || DEFAULT_MCP_URL,
		startCoral: env.FABRICK_DEV_NO_CORAL !== '1'
	};

	for (const arg of argv) {
		if (arg === '--bypass') {
			config.bypass = true;
		} else if (arg === '--no-start-coral') {
			config.startCoral = false;
		} else if (arg === '--coral-prebuilt') {
			config.coralFromSource = false;
		} else if (arg === '--help' || arg === '-h') {
			config.help = true;
		} else if (arg.startsWith('--coral-api-url=')) {
			config.coralApiUrl = arg.slice('--coral-api-url='.length);
		} else if (arg.startsWith('--coral-auth-key=')) {
			config.coralAuthKey = arg.slice('--coral-auth-key='.length);
		} else if (arg.startsWith('--coral-config=')) {
			config.coralConfigPath = arg.slice('--coral-config='.length);
		} else if (arg.startsWith('--host=')) {
			config.appHost = arg.slice('--host='.length);
		} else if (arg.startsWith('--mcp-dir=')) {
			config.mcpDir = arg.slice('--mcp-dir='.length);
		} else if (arg.startsWith('--mcp-url=')) {
			config.mcpUrl = arg.slice('--mcp-url='.length);
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return config;
}

export function buildAppEnv(
	base: NodeJS.ProcessEnv,
	options: { bypass: boolean; coralApiUrl: string; coralAuthKey: string; mcpUrl: string }
): NodeJS.ProcessEnv {
	return {
		...base,
		CORAL_API_KEY: options.coralAuthKey,
		CORAL_CLOUD_API_URL: options.coralApiUrl,
		DEV_AUTH_PRIVY_DID: options.bypass ? '*' : '',
		SAVINGS_MCP_URL: options.mcpUrl
	};
}

export function buildCoralEnv(
	base: NodeJS.ProcessEnv,
	options: { coralConfigPath: string }
): NodeJS.ProcessEnv {
	const env = {
		...base,
		CONFIG_FILE_PATH: options.coralConfigPath,
		PATH: sanitizeCoralPath(base.PATH)
	};
	for (const key of Object.keys(env)) {
		if (key.startsWith('npm_')) delete env[key];
	}
	const cloudApiKey = base.CORAL_CLOUD_API_KEY || base.CORAL_API_KEY;
	if (cloudApiKey && !env['config.override.cloud.apiKey']) {
		env['config.override.cloud.apiKey'] = cloudApiKey;
	}
	return env;
}

export function sanitizeCoralPath(pathValue: string | undefined): string | undefined {
	if (!pathValue) return pathValue;
	const entries = pathValue
		.split(':')
		.filter((entry) => !entry.includes(CODEX_BUNDLED_NODE_PATH_FRAGMENT));
	return entries.length ? entries.join(':') : pathValue;
}

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

function buildMcpEnv(base: NodeJS.ProcessEnv, mcpUrl: string): NodeJS.ProcessEnv {
	const env = { ...base };
	const url = new URL(mcpUrl);

	if (url.hostname) env.HOST = url.hostname;
	if (url.port) env.PORT = url.port;

	return env;
}

function printHelp(): void {
	console.log(`Usage: npm run dev:savings -- [options]

Options:
  --bypass              Start Fabrick with DEV_AUTH_PRIVY_DID=*
  --coral-api-url=<url> Local Coral API URL (default: ${DEFAULT_CORAL_API_URL})
  --coral-auth-key=<k>  Local Coral API auth key for Fabrick (default: ${DEFAULT_CORAL_AUTH_KEY})
  --coral-config=<path> Coral server config path (default: ${DEFAULT_CORAL_CONFIG})
  --coral-prebuilt      Use coralos-dev prebuilt server instead of --from-source
  --host=<host>         Vite host for Fabrick (default: ${DEFAULT_APP_HOST})
  --mcp-dir=<path>      Savings MCP repo path (default: ${DEFAULT_MCP_DIR})
  --mcp-url=<url>       Savings MCP endpoint (default: ${DEFAULT_MCP_URL})
  --no-start-coral      Reuse an already-running Coral server
  -h, --help            Show this help text

Environment overrides:
  CORAL_CLOUD_API_KEY or CORAL_API_KEY (used only by the Coral server LLM proxy)
  CORAL_LOCAL_API_KEY
  FABRICK_CORAL_API_URL
  FABRICK_CORAL_CONFIG
  FABRICK_CORAL_FROM_SOURCE=0
  FABRICK_DEV_HOST
  FABRICK_DEV_NO_CORAL=1
  SAVINGS_MCP_DIR
  SAVINGS_MCP_URL`);
}

function pipeChildLogs(label: string, child: ChildProcessWithoutNullStreams): void {
	const prefix = `[${label}] `;
	child.stdout.on('data', (chunk) => {
		process.stdout.write(
			String(chunk)
				.split(/\r?\n/)
				.map((line) => (line ? `${prefix}${line}` : line))
				.join('\n')
		);
	});
	child.stderr.on('data', (chunk) => {
		process.stderr.write(
			String(chunk)
				.split(/\r?\n/)
				.map((line) => (line ? `${prefix}${line}` : line))
				.join('\n')
		);
	});
}

function spawnChild(
	label: string,
	command: string,
	args: string[],
	options: { cwd: string; detached: boolean; env: NodeJS.ProcessEnv }
): ChildProcessWithoutNullStreams {
	const child = spawn(command, args, {
		cwd: options.cwd,
		detached: options.detached,
		env: options.env,
		stdio: ['ignore', 'pipe', 'pipe']
	});

	pipeChildLogs(label, child);
	return child;
}

function terminateChild(
	label: string,
	child: ChildProcessWithoutNullStreams,
	detached: boolean
): void {
	if (child.exitCode !== null || child.signalCode !== null) return;
	if (!child.pid) return;

	try {
		if (detached) process.kill(-child.pid, 'SIGTERM');
		else child.kill('SIGTERM');
	} catch {
		return;
	}

	setTimeout(() => {
		if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
		try {
			if (detached) process.kill(-child.pid, 'SIGKILL');
			else child.kill('SIGKILL');
		} catch {
			// The process group already exited.
		}
	}, CHILD_SHUTDOWN_GRACE_MS).unref();

	console.log(`[launcher] Stopping ${label}`);
}

function childExitMessage(label: string, code: number | null, signal: NodeJS.Signals | null): string {
	const reason = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
	return `${label} exited with ${reason}`;
}

async function waitForSavingsMcp(mcpUrl: string, isProcessAlive: () => boolean): Promise<void> {
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
			const payload = (await response.json()) as { result?: { tools?: unknown[] } };
			if (response.ok && Array.isArray(payload.result?.tools)) return;
		} catch {
			// Retry until the MCP server is listening and answering JSON-RPC.
		}

		await new Promise((resolve) => setTimeout(resolve, MCP_READY_INTERVAL_MS));
	}

	throw new Error(`Savings MCP did not become ready at ${mcpUrl}`);
}

function spawnCoralServer(
	config: LauncherConfig,
	env: NodeJS.ProcessEnv
): ChildProcessWithoutNullStreams {
	if (!existsSync(config.coralConfigPath)) {
		throw new Error(`Coral config is missing: ${config.coralConfigPath}`);
	}

	const args = ['-y', 'coralos-dev@latest', 'server', 'start'];
	if (config.coralFromSource) args.push('--from-source');

	return spawnChild('coral', coralNpxCommand(), args, {
		cwd: APP_ROOT,
		detached: config.detachedChildren,
		env: buildCoralEnv(env, { coralConfigPath: config.coralConfigPath })
	});
}

export function coralNpxCommand(): string {
	return existsSync('/usr/local/bin/npx') ? '/usr/local/bin/npx' : 'npx';
}

async function fetchCoralRegistry(
	coralApiUrl: string,
	coralAuthKey: string,
	timeoutMs: number
): Promise<unknown[] | null> {
	try {
		const response = await fetch(`${coralApiUrl}/api/v1/registry`, {
			headers: { authorization: `Bearer ${coralAuthKey}` },
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (!response.ok) return null;
		const body = (await response.json()) as unknown;
		return Array.isArray(body) ? body : null;
	} catch {
		return null;
	}
}

function registryHasFabrickAgents(registry: unknown[]): boolean {
	const groups = registry as Array<{ agents?: Array<{ name?: string }> }>;
	const names = new Set(
		groups.flatMap((group) => group.agents?.map((agent) => String(agent.name)) ?? [])
	);
	return EXPECTED_CORAL_AGENTS.every((agentName) => names.has(agentName));
}

async function waitForCoral(
	config: LauncherConfig,
	isProcessAlive: () => boolean,
	timeoutMs = CORAL_READY_TIMEOUT_MS
): Promise<void> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if (!isProcessAlive()) throw new Error('Coral server exited before it became ready');

		const registry = await fetchCoralRegistry(config.coralApiUrl, config.coralAuthKey, 2_000);
		if (registry && registryHasFabrickAgents(registry)) return;

		await new Promise((resolve) => setTimeout(resolve, MCP_READY_INTERVAL_MS));
	}

	throw new Error(
		`Coral server did not become ready with Fabrick agents at ${config.coralApiUrl}`
	);
}

async function main(argv = process.argv.slice(2)): Promise<void> {
	const env = loadEnv(join(APP_ROOT, '.env'));
	const config = parseLauncherArgs(argv, env);
	if (config.help) {
		printHelp();
		return;
	}

	if (!existsSync(join(config.mcpDir, 'package.json'))) {
		throw new Error(`Savings MCP directory is missing a package.json: ${config.mcpDir}`);
	}

	let shuttingDown = false;
	const children: Array<{ label: string; process: ChildProcessWithoutNullStreams }> = [];
	const shutdown = (reason: string, exitCode = 0) => {
		if (shuttingDown) return;
		shuttingDown = true;
		process.exitCode = exitCode;
		console.log(`[launcher] ${reason}`);
		for (const child of children.toReversed()) {
			terminateChild(child.label, child.process, config.detachedChildren);
		}
		setTimeout(() => process.exit(exitCode), CHILD_SHUTDOWN_GRACE_MS + 100).unref();
	};

	process.on('SIGINT', () => shutdown('Received SIGINT'));
	process.on('SIGTERM', () => shutdown('Received SIGTERM'));

	console.log(`[launcher] Savings MCP URL: ${config.mcpUrl}`);
	console.log(`[launcher] Savings MCP dir: ${config.mcpDir}`);
	console.log(`[launcher] Coral API URL: ${config.coralApiUrl}`);
	console.log(`[launcher] Coral config: ${config.coralConfigPath}`);
	console.log(`[launcher] Fabrick auth: ${config.bypass ? 'dev bypass' : 'login'}`);

	const mcpProcess = spawnChild('savings-mcp', 'npm', ['run', 'dev'], {
		cwd: config.mcpDir,
		detached: config.detachedChildren,
		env: buildMcpEnv(env, config.mcpUrl)
	});
	children.push({ label: 'Savings MCP', process: mcpProcess });

	mcpProcess.on('exit', (code, signal) => {
		if (!shuttingDown) shutdown(childExitMessage('Savings MCP', code, signal), code ?? 1);
	});

	await waitForSavingsMcp(config.mcpUrl, () => mcpProcess.exitCode === null && mcpProcess.signalCode === null);
	console.log('[launcher] Savings MCP is ready');

	const existingCoral = await fetchCoralRegistry(config.coralApiUrl, config.coralAuthKey, 1_000);
	if (existingCoral && registryHasFabrickAgents(existingCoral)) {
		console.log('[launcher] Coral server is already ready');
	} else if (config.startCoral) {
		const coralProcess = spawnCoralServer(config, env);
		children.push({ label: 'Coral server', process: coralProcess });

		coralProcess.on('exit', (code, signal) => {
			if (!shuttingDown) shutdown(childExitMessage('Coral server', code, signal), code ?? 1);
		});

		await waitForCoral(config, () => coralProcess.exitCode === null && coralProcess.signalCode === null);
		console.log('[launcher] Coral server is ready');
	} else {
		await waitForCoral(config, () => true, 5_000);
		console.log('[launcher] Coral server is ready');
	}

	const appProcess = spawnChild('fabrick', 'npm', ['run', 'dev', '--', '--host', config.appHost], {
		cwd: APP_ROOT,
		detached: config.detachedChildren,
		env: buildAppEnv(env, {
			bypass: config.bypass,
			coralApiUrl: config.coralApiUrl,
			coralAuthKey: config.coralAuthKey,
			mcpUrl: config.mcpUrl
		})
	});
	children.push({ label: 'Fabrick app', process: appProcess });

	appProcess.on('exit', (code, signal) => {
		if (!shuttingDown) shutdown(childExitMessage('Fabrick app', code, signal), code ?? 1);
	});
}

const isCliEntrypoint = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isCliEntrypoint) {
	main().catch((error) => {
		console.error(`[launcher] ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	});
}
