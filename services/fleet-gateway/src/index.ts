/**
 * fleet-gateway — the fleet runtime's public edge.
 *
 * Stands between browsers and coral-server. Holds CORAL_AUTH_TOKEN so it
 * never reaches the client, and only relays a session's event stream to a
 * browser that presents a valid, session-scoped JWT minted by the SvelteKit
 * app. coral-server stays on a private network with no public port.
 *
 * FIRST ROLL scope (intentionally thin — prove the topology shift):
 *   - token custody: the shared Coral token lives here, never in the browser
 *   - WS relay: browser <-> gateway <-> coral-server event stream
 *   - per-session ownership: the JWT is a capability scoped to ONE session;
 *     a request for a different namespace/sessionId than the token was minted
 *     for is rejected, which closes the IDOR that direct-to-Coral had.
 *
 * NOT in this roll (next): server-side archive trigger + cost telemetry.
 * The client still archives for now.
 *
 * Runtime: a plain Node/Bun process. No SvelteKit, no Vercel, no Docker.
 * Config purely via env. Ports to a container later by adding a Dockerfile —
 * the code does not change. Binds 0.0.0.0, has /healthz, handles SIGTERM —
 * everything a container orchestrator expects.
 */

import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { WebSocketServer } from 'ws';
import { jwtVerify, type JWTPayload } from 'jose';

const PORT = Number(process.env.PORT ?? 8787);
const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL ?? 'http://localhost:5555';
const CORAL_AUTH_TOKEN = process.env.CORAL_AUTH_TOKEN ?? '';
const GATEWAY_JWT_SECRET = process.env.GATEWAY_JWT_SECRET ?? '';

if (!CORAL_AUTH_TOKEN) {
	console.error('[fleet-gateway] CORAL_AUTH_TOKEN is not set — refusing to start.');
	process.exit(1);
}
if (!GATEWAY_JWT_SECRET) {
	console.error('[fleet-gateway] GATEWAY_JWT_SECRET is not set — refusing to start.');
	process.exit(1);
}

const jwtKey = new TextEncoder().encode(GATEWAY_JWT_SECRET);

// Optional server-side archive. When GATEWAY_SERVICE_SECRET is set, the
// gateway fires an archive when it detects a run's synthesis — even if the
// browser tab has closed — by calling back into the SvelteKit app's
// /api/fleet/archive with the shared secret. If unset, the gateway only
// relays (roll-one behavior) and the client archives.
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:5173';
const GATEWAY_SERVICE_SECRET = process.env.GATEWAY_SERVICE_SECRET ?? '';

// Cap how long the gateway keeps an upstream subscription alive after the
// browser disconnects before synthesis, so a stuck run can't leak a socket.
const ORPHAN_WATCH_MS = 15 * 60 * 1000;

/** Build the upstream coral-server event-stream URL, with the shared token in
 *  the path (this is the leg the browser must never see). */
function coralEventsUrl(namespace: string, sessionId: string): string {
	const u = new URL(CORAL_SERVER_URL);
	const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${proto}//${u.host}/ws/v1/events/${encodeURIComponent(
		CORAL_AUTH_TOKEN
	)}/session/${encodeURIComponent(namespace)}/${encodeURIComponent(sessionId)}`;
}

const server = createServer((req, res) => {
	if (req.method === 'GET' && (req.url === '/healthz' || req.url?.startsWith('/healthz?'))) {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ ok: true, ts: Date.now() }));
		return;
	}
	res.writeHead(404, { 'content-type': 'text/plain' });
	res.end('not found');
});

const wss = new WebSocketServer({ noServer: true });

function rejectUpgrade(socket: Duplex, code: number, reason: string): void {
	socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`);
	socket.destroy();
}

server.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
	try {
		const { pathname, searchParams } = new URL(req.url ?? '', 'http://localhost');

		// Expected: /events/:namespace/:sessionId
		const match = pathname.match(/^\/events\/([^/]+)\/([^/]+)\/?$/);
		if (!match) return rejectUpgrade(socket, 404, 'unknown path');

		const namespace = decodeURIComponent(match[1]);
		const sessionId = decodeURIComponent(match[2]);

		const token = searchParams.get('token');
		if (!token) return rejectUpgrade(socket, 401, 'missing token');

		let claims: JWTPayload;
		try {
			const verified = await jwtVerify(token, jwtKey);
			claims = verified.payload;
		} catch {
			return rejectUpgrade(socket, 401, 'invalid token');
		}

		// The JWT is a capability scoped to exactly one session. Reject any
		// attempt to use it for a different session — this is the per-user
		// isolation Coral itself doesn't provide.
		if (claims.ns !== namespace || claims.sid !== sessionId) {
			return rejectUpgrade(socket, 403, 'token scope mismatch');
		}

		wss.handleUpgrade(req, socket, head, (browserWs) => {
			attachRelay(
				browserWs,
				namespace,
				sessionId,
				String(claims.sub ?? 'unknown'),
				typeof claims.q === 'string' ? claims.q : ''
			);
		});
	} catch (err) {
		console.warn('[fleet-gateway] upgrade error:', err instanceof Error ? err.message : err);
		rejectUpgrade(socket, 500, 'upgrade error');
	}
});

type AgentUsage = { model: string; input_tokens: number; output_tokens: number; calls: number };

/** Fold the per-agent usage accumulator into the model_usage JSON shape
 *  stored on research_runs. USD is left null — rate tables are volatile
 *  (and provider-promo-dependent); the UI can price tokens when it wants. */
function buildModelUsage(usage: Map<string, AgentUsage>): {
	agents: Record<string, AgentUsage>;
	totals: { input_tokens: number; output_tokens: number; calls: number };
	estimated_usd: number | null;
} {
	const agents: Record<string, AgentUsage> = {};
	let input = 0;
	let output = 0;
	let calls = 0;
	for (const [name, u] of usage) {
		agents[name] = { ...u };
		input += u.input_tokens;
		output += u.output_tokens;
		calls += u.calls;
	}
	return {
		agents,
		totals: { input_tokens: input, output_tokens: output, calls },
		estimated_usd: null
	};
}

type RelayThread = { id: string; name?: string; participants: string[]; messages: unknown[] };

/** Unwrap the fabrick synthesis envelope to its human-readable body, falling
 *  back to the raw text for non-enveloped messages. */
function unwrapSynthesis(text: string): string {
	if (!text || text[0] !== '{') return text;
	try {
		const parsed = JSON.parse(text) as { __fabrick_synthesis__?: { type?: string; body?: unknown } };
		const inner = parsed.__fabrick_synthesis__;
		if (inner?.type === 'text' && typeof inner.body === 'string') return inner.body;
	} catch {
		/* not JSON */
	}
	return text;
}

/** Fire the server-side archive by calling back into the SvelteKit app with
 *  the shared service secret. Fire-and-forget — failures are logged, never
 *  thrown. No-op (with a warning) when the secret isn't configured. */
async function triggerArchive(
	payload: {
		namespace: string;
		sessionId: string;
		userId: string;
		query: string;
		synthesisText: string;
		modelUsage: ReturnType<typeof buildModelUsage>;
		threads: RelayThread[];
	},
	tag: string
): Promise<void> {
	if (!GATEWAY_SERVICE_SECRET) {
		console.warn(`${tag} synthesis detected but GATEWAY_SERVICE_SECRET unset — skipping archive`);
		return;
	}
	try {
		const res = await fetch(`${APP_BASE_URL}/api/fleet/archive`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-gateway-service': GATEWAY_SERVICE_SECRET
			},
			body: JSON.stringify(payload)
		});
		if (!res.ok) {
			const t = await res.text().catch(() => '');
			console.warn(`${tag} archive trigger failed ${res.status}: ${t}`);
		} else {
			console.log(`${tag} archived server-side`);
		}
	} catch (e) {
		console.warn(`${tag} archive trigger error: ${e instanceof Error ? e.message : e}`);
	}
}

/** Report a failed run to the SvelteKit app so research_runs flips to `failed`
 *  with a descriptive reason. Fail loudly: always logs, even when the callback
 *  can't be made. */
async function reportFailure(
	payload: { namespace: string; sessionId: string; userId: string; reason: string },
	tag: string
): Promise<void> {
	if (!GATEWAY_SERVICE_SECRET) {
		console.warn(`${tag} RUN FAILED, not recorded (GATEWAY_SERVICE_SECRET unset): ${payload.reason}`);
		return;
	}
	try {
		const res = await fetch(`${APP_BASE_URL}/api/fleet/fail`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-gateway-service': GATEWAY_SERVICE_SECRET
			},
			body: JSON.stringify(payload)
		});
		if (!res.ok) {
			const t = await res.text().catch(() => '');
			console.warn(`${tag} fail report rejected ${res.status}: ${t}`);
		}
	} catch (e) {
		console.warn(`${tag} fail report error: ${e instanceof Error ? e.message : e}`);
	}
}

/** Wire a verified browser socket to a fresh coral-server subscription.
 *
 *  - Relays Coral -> browser (the stream is read-only browser-side; inbound
 *    browser frames are ignored).
 *  - Watches the relayed stream for the run's synthesis and fires a
 *    server-side archive once — independent of whether the browser is still
 *    connected. This is what makes archive survive a closed tab and what lets
 *    a run finish in the background.
 *  - If the browser leaves before synthesis, the upstream subscription is
 *    KEPT OPEN (capped by ORPHAN_WATCH_MS) so the archive still fires; if it
 *    leaves after, the subscription is torn down immediately. */
function attachRelay(
	browserWs: WebSocket,
	namespace: string,
	sessionId: string,
	userId: string,
	query: string
): void {
	const tag = `[relay ${namespace}/${sessionId} u=${userId}]`;
	const coralWs = new WebSocket(coralEventsUrl(namespace, sessionId));
	// A run settles exactly once — either archived (synthesis) or failed.
	let settled = false;
	let orphanTimer: ReturnType<typeof setTimeout> | null = null;
	// Per-agent LLM usage, accumulated from llm_proxy_call events as they flow
	// through, then shipped with the archive trigger as cost telemetry.
	const usage = new Map<string, AgentUsage>();
	// Thread + message accumulation from the stream — coral /extended omits
	// thread messages, so the gateway is the source of the archived trace.
	const threads = new Map<string, RelayThread>();
	console.log(`${tag} open`);

	const cleanup = (): void => {
		if (orphanTimer) {
			clearTimeout(orphanTimer);
			orphanTimer = null;
		}
		try {
			coralWs.close();
		} catch {
			/* noop */
		}
	};

	/** Settle the run as failed: tell the browser (loud banner instead of an
	 *  endless timer), record it, tear down. Once-only via `settled`. */
	const failRun = (reason: string): void => {
		if (settled) return;
		settled = true;
		console.warn(`${tag} RUN FAILED: ${reason}`);
		if (browserWs.readyState === WebSocket.OPEN) {
			try {
				browserWs.send(
					JSON.stringify({ type: 'gateway_run_failed', reason, timestamp: new Date().toISOString() })
				);
				browserWs.close(1011, 'run failed');
			} catch {
				/* noop */
			}
		}
		void reportFailure({ namespace, sessionId, userId, reason }, tag);
		cleanup();
	};

	coralWs.on('message', (data: WebSocket.RawData) => {
		const frame = data.toString();
		if (browserWs.readyState === WebSocket.OPEN) browserWs.send(frame);

		// Parse once; relay is unaffected by parse failure.
		let parsed: {
			type?: string;
			agentName?: unknown;
			modelName?: unknown;
			usage?: { inputTokens?: unknown; outputTokens?: unknown };
			thread?: { id?: unknown; name?: unknown; participants?: unknown };
			message?: {
				id?: unknown;
				threadId?: unknown;
				senderName?: unknown;
				mentionNames?: unknown[];
				text?: unknown;
				timestamp?: unknown;
			};
		};
		try {
			parsed = JSON.parse(frame);
		} catch {
			return;
		}
		if (!parsed || typeof parsed !== 'object') return;

		// Accumulate per-agent token usage.
		if (parsed.type === 'llm_proxy_call' && parsed.usage) {
			const agentName = typeof parsed.agentName === 'string' ? parsed.agentName : 'unknown';
			const model = typeof parsed.modelName === 'string' ? parsed.modelName : 'unknown';
			const inTok = Number(parsed.usage.inputTokens) || 0;
			const outTok = Number(parsed.usage.outputTokens) || 0;
			const cur = usage.get(agentName) ?? {
				model,
				input_tokens: 0,
				output_tokens: 0,
				calls: 0
			};
			cur.model = model || cur.model;
			cur.input_tokens += inTok;
			cur.output_tokens += outTok;
			cur.calls += 1;
			usage.set(agentName, cur);
			return;
		}

		// Accumulate thread metadata + messages so the archive captures the full
		// trace (coral /extended omits thread messages).
		if (parsed.type === 'thread_created' && parsed.thread && typeof parsed.thread.id === 'string') {
			const id = parsed.thread.id;
			const existing = threads.get(id);
			threads.set(id, {
				id,
				name: typeof parsed.thread.name === 'string' ? parsed.thread.name : existing?.name,
				participants: Array.isArray(parsed.thread.participants)
					? (parsed.thread.participants as string[])
					: (existing?.participants ?? []),
				messages: existing?.messages ?? []
			});
		}
		if (
			parsed.type === 'thread_message_sent' &&
			parsed.message &&
			typeof parsed.message.threadId === 'string'
		) {
			const tid = parsed.message.threadId;
			const t = threads.get(tid) ?? { id: tid, participants: [], messages: [] };
			t.messages.push({
				id: parsed.message.id,
				threadId: tid,
				senderName: parsed.message.senderName,
				text: parsed.message.text,
				timestamp: parsed.message.timestamp,
				mentionNames: parsed.message.mentionNames ?? []
			});
			threads.set(tid, t);
		}

		// Synthesis = orchestrator message with no mentions. Archive once.
		if (!settled && parsed.type === 'thread_message_sent' && parsed.message) {
			const m = parsed.message;
			if (
				m.senderName === 'research-orchestrator' &&
				Array.isArray(m.mentionNames) &&
				m.mentionNames.length === 0
			) {
				settled = true;
				const synthesisText = unwrapSynthesis(typeof m.text === 'string' ? m.text : '');
				void triggerArchive(
					{
						namespace,
						sessionId,
						userId,
						query,
						synthesisText,
						modelUsage: buildModelUsage(usage),
						threads: Array.from(threads.values())
					},
					tag
				);
				// Run is done — tear the upstream subscription down.
				cleanup();
			}
		}
	});
	coralWs.on('close', () => {
		if (orphanTimer) {
			clearTimeout(orphanTimer);
			orphanTimer = null;
		}
		// Upstream closing before the run settled means it ended without a
		// synthesis — fail loudly rather than letting the UI hang forever.
		if (!settled) {
			failRun('coral session closed before synthesis');
			return;
		}
		try {
			browserWs.close();
		} catch {
			/* noop */
		}
	});
	coralWs.on('error', (e: Error) => {
		console.warn(`${tag} coral error: ${e.message}`);
		if (!settled) failRun(`coral connection error: ${e.message}`);
	});

	browserWs.on('close', () => {
		if (settled) {
			cleanup();
			console.log(`${tag} closed`);
			return;
		}
		// Browser left before the run settled — keep watching so it still
		// settles server-side (archive on synthesis, or fail on timeout). Cap
		// the orphan watch so a stuck run can't leak a socket.
		console.log(`${tag} browser left; watching in background`);
		orphanTimer = setTimeout(() => {
			failRun('no synthesis within orphan-watch window — run timed out or hung');
		}, ORPHAN_WATCH_MS);
	});
	browserWs.on('error', () => {
		// Let the close handler decide the upstream lifecycle.
	});
	// Read-only browser side: ignore anything the client sends.
	browserWs.on('message', () => {
		/* intentionally ignored */
	});
}

server.listen(PORT, '0.0.0.0', () => {
	console.log(`[fleet-gateway] listening on :${PORT} → coral ${CORAL_SERVER_URL}`);
});

// Graceful shutdown — close client sockets, stop accepting, exit.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
	process.on(sig, () => {
		console.log(`[fleet-gateway] ${sig} — shutting down`);
		for (const client of wss.clients) {
			try {
				client.close();
			} catch {
				/* noop */
			}
		}
		server.close(() => process.exit(0));
		setTimeout(() => process.exit(0), 3000).unref();
	});
}
