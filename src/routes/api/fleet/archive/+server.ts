/**
 * POST /api/fleet/archive — persist a completed fleet run to Turso.
 *
 * Two callers:
 *
 *  1. The browser (Session class), fire-and-forget when `finalSynthesis`
 *     lands. Requires an authed user; archives the client-assembled trace.
 *     Kept as an idempotent fallback while the gateway path is proven.
 *
 *  2. The fleet-gateway (server-side), when it detects synthesis in the relayed
 *     stream — even if no browser tab is alive. Authenticated by the shared
 *     `x-gateway-service` secret; trusts the secret for identity and fetches
 *     the CANONICAL `/extended` snapshot from Coral rather than a client blob.
 *
 * Idempotent on (user_id, session_id): whichever caller wins, a second write
 * is a no-op (INSERT OR IGNORE), so the two paths can race safely.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { archiveFleetRun } from '$lib/server/libsql';
import { getExtendedSession } from '$lib/server/coral';
import { supabaseAdmin } from '$lib/server/supabase';
import type { Json } from '$lib/server/database.types';
import { env as privateEnv } from '$env/dynamic/private';

/** Coral serializes message timestamps inconsistently (number or ISO string);
 *  coerce to epoch-ms so archived traces sort + render correctly. */
function toEpochMs(ts: unknown): number {
	if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
	if (typeof ts === 'string') {
		const parsed = Date.parse(ts);
		if (Number.isFinite(parsed)) return parsed;
	}
	return Date.now();
}

type ResolvedArchive = {
	userId: string;
	namespace: string;
	sessionId: string;
	query: string;
	synthesisText: string | null;
	agents: unknown[];
	threads: unknown[];
	messageCount: number;
	startedAt: number;
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const serviceSecret = privateEnv.GATEWAY_SERVICE_SECRET;
	const presented = request.headers.get('x-gateway-service');
	const isService = !!serviceSecret && presented === serviceSecret;

	let body: Record<string, unknown> = {};
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'expected JSON body');
	}

	const namespace = typeof body.namespace === 'string' ? body.namespace.trim() : '';
	const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
	let query = typeof body.query === 'string' ? body.query.trim() : '';
	const synthesisTextIn =
		typeof body.synthesisText === 'string' && body.synthesisText.trim() ? body.synthesisText : null;

	let resolved: ResolvedArchive;

	if (isService) {
		// --- Gateway-triggered: trust the service secret, fetch canonical state.
		const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
		if (!userId || !namespace || !sessionId) {
			throw error(400, 'service archive requires userId, namespace, sessionId');
		}

		let ext;
		try {
			ext = await getExtendedSession(namespace, sessionId);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			throw error(502, `canonical snapshot fetch failed: ${msg}`);
		}

		const agents = Array.isArray(ext.agents) ? ext.agents : [];
		const threads = (Array.isArray(ext.threads) ? ext.threads : []).map((t) => ({
			id: t.id,
			name: t.name,
			participants: t.participants ?? [],
			messages: (t.messages ?? []).map((m) => ({ ...m, timestamp: toEpochMs(m.timestamp) })),
			state: t.state,
			timestamp: t.timestamp
		}));

		let messageCount = 0;
		let earliest: number | null = null;
		let lastSynthesis: { text?: string; timestamp: number } | null = null;
		for (const t of threads) {
			for (const m of t.messages) {
				messageCount += 1;
				if (earliest === null || m.timestamp < earliest) earliest = m.timestamp;
				if (
					m.senderName === 'research-orchestrator' &&
					Array.isArray(m.mentionNames) &&
					m.mentionNames.length === 0
				) {
					if (!lastSynthesis || m.timestamp >= lastSynthesis.timestamp) lastSynthesis = m;
				}
			}
		}

		resolved = {
			userId,
			namespace,
			sessionId,
			query,
			synthesisText: synthesisTextIn ?? lastSynthesis?.text ?? null,
			agents,
			threads,
			messageCount,
			startedAt: earliest ?? Date.now()
		};
	} else {
		// --- Browser-triggered (legacy fallback): authed user + client trace.
		if (!locals.user) throw error(401, 'sign in required');
		if (!namespace || !sessionId || !query) {
			throw error(400, 'namespace, sessionId, and query are required');
		}

		const trace = body.trace;
		if (!trace || typeof trace !== 'object') {
			throw error(400, 'trace must be an object with agents[] and threads[]');
		}
		const traceObj = trace as { agents?: unknown[]; threads?: unknown[] };
		const agents = Array.isArray(traceObj.agents) ? traceObj.agents : [];
		const threads = Array.isArray(traceObj.threads) ? traceObj.threads : [];

		let messageCount = 0;
		for (const t of threads) {
			const tt = t as { messages?: unknown[] };
			if (Array.isArray(tt.messages)) messageCount += tt.messages.length;
		}

		const startedAt =
			typeof body.startedAt === 'number' && Number.isFinite(body.startedAt) && body.startedAt > 0
				? body.startedAt
				: Date.now();

		resolved = {
			userId: locals.user.id,
			namespace,
			sessionId,
			query,
			synthesisText: synthesisTextIn,
			agents,
			threads,
			messageCount,
			startedAt
		};
	}

	// `query` is NOT NULL in the archive schema; the gateway path may not have
	// it if the token predates query-in-claims.
	if (!resolved.query) resolved.query = '(query unavailable)';

	// Cost telemetry rides in on the gateway (service) path. It lands in the
	// Turso archive (durable, all-runs, dream-pass substrate) AND mirrors to
	// research_runs.model_usage for chat-linked runs.
	const modelUsage =
		isService && body.modelUsage && typeof body.modelUsage === 'object' ? body.modelUsage : null;

	try {
		const row = await archiveFleetRun({
			userId: resolved.userId,
			namespace: resolved.namespace,
			sessionId: resolved.sessionId,
			query: resolved.query,
			synthesisText: resolved.synthesisText,
			traceJson: JSON.stringify({ agents: resolved.agents, threads: resolved.threads }),
			messageCount: resolved.messageCount,
			createdAt: resolved.startedAt,
			modelUsage
		});

		// Flip the `research_runs` lifecycle to `complete` so the chat-side
		// re-entry cards stop showing "in progress", and persist cost telemetry
		// (gateway-supplied per-agent token usage) into `model_usage`.
		// Best-effort: a missing row (anonymous / non-chat runs) is expected and
		// silent — cost is only persisted for chat-linked runs for now.
		const runUpdate: { status: 'complete'; finished_at: string; model_usage?: Json } = {
			status: 'complete',
			finished_at: new Date().toISOString()
		};
		if (modelUsage) {
			runUpdate.model_usage = modelUsage as Json;
		}
		const updateRes = await supabaseAdmin
			.from('research_runs')
			.update(runUpdate)
			.eq('coral_session_id', resolved.sessionId)
			.in('status', ['running', 'queued']);
		if (updateRes.error) {
			console.warn(
				`[fleet/archive] research_runs status update failed for ${resolved.sessionId}:`,
				updateRes.error.message
			);
		}

		return json({ id: row.id, completedAt: row.completedAt, via: isService ? 'gateway' : 'client' });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw error(500, `archive failed: ${msg}`);
	}
};
