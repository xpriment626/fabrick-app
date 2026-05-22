/**
 * Research session route — SSR load.
 *
 * Resolution order:
 *  1. Try the Turso archive (read-only frozen trace). If found, render
 *     in `archived` mode with no WS subscription.
 *  2. Fall back to coral-server `/extended` for an in-flight run.
 *  3. 404 if neither layer knows about the session.
 *
 * This makes /research URLs durable: once a run completes and the
 * client fires the archive call, the same URL keeps replaying the
 * full trace even after coral-server has GC'd the session.
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getExtendedSession } from '$lib/server/coral';
import { mintGatewayToken, gatewayEventsWsUrl } from '$lib/server/fleet-gateway';
import { getFleetRunBySessionId } from '$lib/server/libsql';
import { supabaseAdmin } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const { namespace, sessionId } = params;
	const query = url.searchParams.get('q') ?? '';

	// 1. Archive-first read. Requires an authed user — archives are
	//    per-user-scoped by libsql.ts.
	if (locals.user) {
		const archived = await getFleetRunBySessionId(sessionId, locals.user.id).catch(() => null);
		if (archived) {
			let trace: { agents?: unknown; threads?: unknown } = {};
			try {
				trace = JSON.parse(archived.traceJson);
			} catch {
				// fall through to live fetch if the blob is corrupt
				trace = {};
			}
			if (Array.isArray(trace.agents) && Array.isArray(trace.threads)) {
				return {
					namespace,
					sessionId,
					query: query || archived.query,
					eventsWsUrl: '',
					initialAgents: trace.agents,
					initialThreads: trace.threads,
					mode: 'archived' as const,
					archivedAt: archived.completedAt
				};
			}
		}
	}

	// 2. Live Coral session — streamed via the gateway, never direct-to-Coral.
	//    Requires auth (the gateway token is per-user) + an ownership check at
	//    mint time so a user can't stream a run linked to someone else's chat.
	if (!locals.user) throw error(401, 'sign in required');

	// Ownership: if this coral session is linked to a chat (research_runs row),
	// the linked research_session must belong to the caller. Unlinked runs
	// (dev / anonymous / not chat-dispatched) can't be attributed, so we allow
	// them — same posture as before, but a *foreign* linked run is now rejected.
	const { data: run } = await supabaseAdmin
		.from('research_runs')
		.select('session_id')
		.eq('coral_session_id', sessionId)
		.limit(1)
		.maybeSingle();
	if (run?.session_id) {
		const { data: sess } = await supabaseAdmin
			.from('research_sessions')
			.select('user_id')
			.eq('id', run.session_id)
			.maybeSingle();
		if (sess && sess.user_id !== locals.user.id) {
			throw error(403, 'not your session');
		}
	}

	try {
		const snapshot = await getExtendedSession(namespace, sessionId);
		const token = await mintGatewayToken({
			userId: locals.user.id,
			namespace,
			sessionId,
			query
		});
		return {
			namespace,
			sessionId,
			query,
			eventsWsUrl: gatewayEventsWsUrl(namespace, sessionId, token),
			initialAgents: snapshot.agents,
			initialThreads: snapshot.threads,
			mode: 'live' as const,
			archivedAt: null
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw error(404, `Session ${sessionId} not found in archive or live coral: ${msg}`);
	}
};
