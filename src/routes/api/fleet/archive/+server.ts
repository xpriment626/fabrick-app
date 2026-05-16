/**
 * POST /api/fleet/archive — persist a completed fleet run to Turso.
 *
 * Fired client-side from the Session class when `finalSynthesis`
 * becomes non-null. Idempotent on (user_id, session_id): retrying
 * the same archive returns the existing row unchanged, so the
 * client can fire-and-forget without dedup logic.
 *
 * Body shape:
 * {
 *   namespace: string,        // Coral namespace
 *   sessionId: string,        // Coral session id
 *   query: string,            // user's original research question
 *   synthesisText: string | null,  // orchestrator's final message body
 *   trace: {
 *     agents: SessionAgent[],
 *     threads: SessionThread[]
 *   },
 *   startedAt: number         // ms epoch when the run kicked off
 * }
 *
 * Response: { id, completedAt }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { archiveFleetRun } from '$lib/server/libsql';

type Body = {
	namespace?: unknown;
	sessionId?: unknown;
	query?: unknown;
	synthesisText?: unknown;
	trace?: unknown;
	startedAt?: unknown;
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');

	let body: Body = {};
	try {
		body = (await request.json()) as Body;
	} catch {
		throw error(400, 'expected JSON body');
	}

	const namespace = typeof body.namespace === 'string' ? body.namespace.trim() : '';
	const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
	const query = typeof body.query === 'string' ? body.query.trim() : '';
	if (!namespace || !sessionId || !query) {
		throw error(400, 'namespace, sessionId, and query are required');
	}

	const synthesisText =
		typeof body.synthesisText === 'string' && body.synthesisText.trim()
			? body.synthesisText
			: null;

	const trace = body.trace;
	if (!trace || typeof trace !== 'object') {
		throw error(400, 'trace must be an object with agents[] and threads[]');
	}
	const traceObj = trace as { agents?: unknown[]; threads?: unknown[] };
	const agents = Array.isArray(traceObj.agents) ? traceObj.agents : [];
	const threads = Array.isArray(traceObj.threads) ? traceObj.threads : [];

	// Count messages across all threads — used as a quick "is this
	// run substantive enough to archive" guard and as a UI summary
	// field on the future /research index.
	let messageCount = 0;
	for (const t of threads) {
		const tt = t as { messages?: unknown[] };
		if (Array.isArray(tt.messages)) messageCount += tt.messages.length;
	}

	const startedAt =
		typeof body.startedAt === 'number' && Number.isFinite(body.startedAt) && body.startedAt > 0
			? body.startedAt
			: Date.now();

	try {
		const row = await archiveFleetRun({
			userId: locals.user.id,
			namespace,
			sessionId,
			query,
			synthesisText,
			traceJson: JSON.stringify({ agents, threads }),
			messageCount,
			createdAt: startedAt
		});
		return json({ id: row.id, completedAt: row.completedAt });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw error(500, `archive failed: ${msg}`);
	}
};
