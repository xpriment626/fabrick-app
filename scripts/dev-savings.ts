#!/usr/bin/env tsx
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MCP_DIR = '/Users/bambozlor/Desktop/studio/savings-mcp';
const DEFAULT_MCP_URL = 'http://127.0.0.1:8788/mcp';
const DEFAULT_APP_HOST = '127.0.0.1';
const MCP_READY_TIMEOUT_MS = 30_000;
const MCP_READY_INTERVAL_MS = 500;
const CHILD_SHUTDOWN_GRACE_MS = 1_500;

export type LauncherConfig = {
	appHost: string;
	bypass: boolean;
	help: boolean;
	mcpDir: string;
	mcpUrl: string;
};

export function parseLauncherArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): LauncherConfig {
	const config: LauncherConfig = {
		appHost: env.FABRICK_DEV_HOST || DEFAULT_APP_HOST,
		bypass: false,
		help: false,
		mcpDir: env.SAVINGS_MCP_DIR || DEFAULT_MCP_DIR,
		mcpUrl: env.SAVINGS_MCP_URL || DEFAULT_MCP_URL
	};

	for (const arg of argv) {
		if (arg === '--bypass') {
			config.bypass = true;
		} else if (arg === '--help' || arg === '-h') {
			config.help = true;
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
	options: { bypass: boolean; mcpUrl: string }
): NodeJS.ProcessEnv {
	return {
		...base,
		DEV_AUTH_PRIVY_DID: options.bypass ? '*' : '',
		SAVINGS_MCP_URL: options.mcpUrl
	};
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
  --host=<host>         Vite host for Fabrick (default: ${DEFAULT_APP_HOST})
  --mcp-dir=<path>      Savings MCP repo path (default: ${DEFAULT_MCP_DIR})
  --mcp-url=<url>       Savings MCP endpoint (default: ${DEFAULT_MCP_URL})
  -h, --help            Show this help text

Environment overrides:
  FABRICK_DEV_HOST
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
	options: { cwd: string; env: NodeJS.ProcessEnv }
): ChildProcessWithoutNullStreams {
	const child = spawn(command, args, {
		cwd: options.cwd,
		detached: true,
		env: options.env,
		stdio: ['ignore', 'pipe', 'pipe']
	});

	pipeChildLogs(label, child);
	return child;
}

function terminateChild(label: string, child: ChildProcessWithoutNullStreams): void {
	if (child.exitCode !== null || child.signalCode !== null) return;
	if (!child.pid) return;

	try {
		process.kill(-child.pid, 'SIGTERM');
	} catch {
		return;
	}

	setTimeout(() => {
		if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
		try {
			process.kill(-child.pid, 'SIGKILL');
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

async function main(argv = process.argv.slice(2)): Promise<void> {
	const config = parseLauncherArgs(argv);
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
		for (const child of children.toReversed()) terminateChild(child.label, child.process);
		setTimeout(() => process.exit(exitCode), CHILD_SHUTDOWN_GRACE_MS + 100).unref();
	};

	process.on('SIGINT', () => shutdown('Received SIGINT'));
	process.on('SIGTERM', () => shutdown('Received SIGTERM'));

	console.log(`[launcher] Savings MCP URL: ${config.mcpUrl}`);
	console.log(`[launcher] Savings MCP dir: ${config.mcpDir}`);
	console.log(`[launcher] Fabrick auth: ${config.bypass ? 'dev bypass' : 'login'}`);

	const mcpProcess = spawnChild('savings-mcp', 'npm', ['run', 'dev'], {
		cwd: config.mcpDir,
		env: buildMcpEnv(process.env, config.mcpUrl)
	});
	children.push({ label: 'Savings MCP', process: mcpProcess });

	mcpProcess.on('exit', (code, signal) => {
		if (!shuttingDown) shutdown(childExitMessage('Savings MCP', code, signal), code ?? 1);
	});

	await waitForSavingsMcp(config.mcpUrl, () => mcpProcess.exitCode === null && mcpProcess.signalCode === null);
	console.log('[launcher] Savings MCP is ready');

	const appProcess = spawnChild('fabrick', 'npm', ['run', 'dev', '--', '--host', config.appHost], {
		cwd: APP_ROOT,
		env: buildAppEnv(process.env, { bypass: config.bypass, mcpUrl: config.mcpUrl })
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
