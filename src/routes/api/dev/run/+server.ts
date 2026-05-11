/**
 * Dev-only: kick off a Coral session against the orchestrator agent and
 * return its coordinates so the client can subscribe to live events.
 *
 * Lives under /api/dev/* until we wire session-backbone persistence
 * (Supabase research_sessions + research_runs) in a later reroll.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSession, sessionEventsWsUrl } from '$lib/server/coral';
import { buildOrchestratorSessionRequest } from '$lib/server/session-request';

export const POST: RequestHandler = async ({ request }) => {
	let body: { query?: unknown; slug?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'expected JSON body with { query: string, slug?: string }');
	}

	if (typeof body.query !== 'string' || body.query.trim().length === 0) {
		throw error(400, '`query` must be a non-empty string');
	}

	const sessionSlug = typeof body.slug === 'string' && body.slug ? body.slug : 'dev';
	const sessionRequest = buildOrchestratorSessionRequest({
		sessionSlug,
		userQuery: body.query.trim()
	});

	try {
		const { namespace, sessionId } = await createSession(sessionRequest);
		return json({
			namespace,
			sessionId,
			eventsWsUrl: sessionEventsWsUrl(namespace, sessionId)
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw error(502, `coral createSession: ${msg}`);
	}
};
