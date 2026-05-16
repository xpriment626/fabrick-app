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
import { getExtendedSession, sessionEventsWsUrl } from '$lib/server/coral';
import { getFleetRunBySessionId } from '$lib/server/libsql';

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

	// 2. Live Coral session.
	try {
		const snapshot = await getExtendedSession(namespace, sessionId);
		return {
			namespace,
			sessionId,
			query,
			eventsWsUrl: sessionEventsWsUrl(namespace, sessionId),
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
