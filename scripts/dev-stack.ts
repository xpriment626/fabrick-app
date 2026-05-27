#!/usr/bin/env bun
/**
 * Fabrick local stack launcher (Bun). One command brings up the whole
 * local fleet stack so you don't juggle three terminals:
 *
 *   coral-server (local gradle)  :5555   ← supervised child; discovers + spawns the agents
 *   fleet-gateway                :8787   ← browser ⇄ coral relay + token custody + archive
 *   app (SvelteKit / Vite)       :5173   ← the only port you actually open
 *
 * Ctrl-C tears the entire process tree down cleanly (each child runs in its
 * own process group; we signal the group, then sweep the known ports — the
 * gradle-spawned JVM can outlive its wrapper).
 *
 * Run from fabrick-app/:  npm run dev:all   (or: bun run scripts/dev-stack.ts)
 *
 * Why local gradle and NOT npx coral (unlike the geostack launcher this is
 * modeled on): Fabrick's agents declare an `[[llm.proxies]]` block (the
 * DeepSeek-V4-via-coral-proxy "Option B"). The npx-distributed `coralos-dev`
 * builds carry a serializer regression that rejects that block
 * (`Cannot convert TomlTable to TomlLiteral` in AgentLlmProxy). Only the local
 * gradle clone parses it. The geostack agents are OpenRouter-direct (no proxy
 * block) so they're fine on npx — Fabrick is not. Verified 2026-05-26: local
 * gradle loads all 7 fabrick agents clean from ~/.coral/agents; npx rejects
 * all 7. See docs/notes (geostack npx-coral-server-port.md) for the lineage.
 *
 * Agent discovery is the "coralise" pattern: agents live in ~/.coral/agents
 * (symlinked by the coralizer, see ensureLinked), NOT config.toml's
 * local_agents — so the shared config.toml can point at other projects without
 * affecting Fabrick. The local gradle server scans ~/.coral/agents regardless.
 *
 * Config: coral reads its config.toml ([auth] keys + [llm-proxy] providers);
 * app + gateway read fabrick-app/.env; agents source their own env via each
 * agent's startup.sh. This launcher injects nothing — it just supervises.
 *
 * Deltas from geostack's launcher: Fabrick's git root IS fabrick-app/, so app +
 * gateway reuse the existing `dev` / `dev:gateway` package scripts verbatim
 * (cwd = ROOT) rather than living in sibling dirs.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

// Local coral-server clone (gradle). Absolute by necessity — it's a sibling
// repo outside fabrick-app. Override via CORAL_SERVER_DIR for other machines.
const CORAL_SERVER_DIR =
	process.env.CORAL_SERVER_DIR ??
	join(homedir(), 'Desktop', 'product-lab', 'coral-server-local', 'coral-server');
// config.toml supplies [auth] keys=["local"] (matches the gateway's
// CORAL_AUTH_TOKEN) + the [llm-proxy] providers the agents' proxy block needs.
const CORAL_CONFIG = process.env.CONFIG_FILE_PATH ?? join(CORAL_SERVER_DIR, 'config.toml');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS_DIR = join(ROOT, 'agents', 'fabrick-agents', 'coral');
const AGENTS = [
	'fabrick-research-orchestrator',
	'fabrick-exa-agent',
	'fabrick-grok-agent',
	'fabrick-news-agent',
	'fabrick-defillama-agent',
	'fabrick-token-info-agent',
	'fabrick-topledger-agent'
];
const PORTS = [5555, 8787, 5173];

// ---- pretty prefixed logging ------------------------------------------------
const C = {
	coral: '\x1b[36m', // cyan
	gateway: '\x1b[35m', // magenta
	app: '\x1b[32m', // green
	launcher: '\x1b[33m', // yellow
	reset: '\x1b[0m',
	dim: '\x1b[2m'
};
type Tag = 'coral' | 'gateway' | 'app' | 'launcher';
function log(tag: Tag, msg: string) {
	for (const line of msg.split('\n')) {
		if (line.trim() === '') continue;
		console.log(`${C[tag]}[${tag}]${C.reset} ${line}`);
	}
}
function pipe(tag: Tag, child: ChildProcess) {
	child.stdout?.on('data', (d) => log(tag, d.toString()));
	child.stderr?.on('data', (d) => log(tag, d.toString()));
}

// ---- 1. preflight: ensure agents are linked into ~/.coral/agents ------------
// No-op once linked; matters on a fresh clone. npx coral-server discovers
// agents from ~/.coral/agents, which the coralizer populates.
function ensureLinked() {
	for (const a of AGENTS) {
		if (existsSync(join(homedir(), '.coral', 'agents', a))) continue;
		log('launcher', `linking ${a} (coralizer)…`);
		const r = spawnSync('npx', ['-y', '@coral-protocol/coralizer@latest', 'link', '.'], {
			cwd: join(AGENTS_DIR, a),
			stdio: 'inherit'
		});
		if (r.status !== 0) log('launcher', `⚠ failed to link ${a} (status ${r.status})`);
	}
}

// ---- 2. spawn supervised children (own process group) -----------------------
const children: ChildProcess[] = [];
function start(
	tag: Tag,
	cmd: string,
	args: string[],
	cwd = ROOT,
	env: Record<string, string> = {}
) {
	const child = spawn(cmd, args, {
		cwd,
		env: { ...process.env, ...env },
		detached: true, // own process group → killable as a tree
		stdio: ['ignore', 'pipe', 'pipe']
	});
	pipe(tag, child);
	child.on('exit', (code, signal) =>
		log(
			'launcher',
			`${tag} exited${code != null ? ` (code ${code})` : ''}${signal ? ` (${signal})` : ''}`
		)
	);
	children.push(child);
	return child;
}

// ---- 3. teardown ------------------------------------------------------------
let shuttingDown = false;
function shutdown(reason: string) {
	if (shuttingDown) return;
	shuttingDown = true;
	log('launcher', `\n${reason} — shutting down the stack…`);
	for (const c of children) {
		if (c.pid) {
			try {
				process.kill(-c.pid, 'SIGTERM'); // negative pid = kill the group
			} catch {
				/* already gone */
			}
		}
	}
	// Belt-and-suspenders: sweep known ports for survivors (the JVM under npx
	// can outlive its npm/npx wrapper).
	setTimeout(() => {
		for (const p of PORTS) {
			const pids = spawnSync('lsof', ['-ti', `tcp:${p}`], { encoding: 'utf-8' }).stdout?.trim();
			if (pids)
				for (const pid of pids.split('\n'))
					try {
						process.kill(Number(pid), 'SIGKILL');
					} catch {
						/* gone */
					}
		}
		log('launcher', 'down. bye 👋');
		process.exit(0);
	}, 1500);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ---- go ---------------------------------------------------------------------
log('launcher', 'Fabrick — local stack starting. Ctrl-C stops everything.');
ensureLinked();

// coral-server first (slowest — gradle build + JVM boot); gateway + app
// tolerate it not being ready yet (they only need it once you dispatch a run).
if (!existsSync(join(CORAL_SERVER_DIR, 'gradlew'))) {
	log(
		'launcher',
		`⚠ coral-server not found at ${CORAL_SERVER_DIR} — set CORAL_SERVER_DIR. Skipping coral; app + gateway only.`
	);
} else {
	start('coral', join(CORAL_SERVER_DIR, 'gradlew'), ['run'], CORAL_SERVER_DIR, {
		CONFIG_FILE_PATH: CORAL_CONFIG
	});
}
start('gateway', 'npm', ['run', 'dev:gateway']);
start('app', 'npm', ['run', 'dev']);

log(
	'launcher',
	`${C.dim}UI → http://localhost:5173   gateway → http://localhost:8787   coral → http://localhost:5555${C.reset}`
);
