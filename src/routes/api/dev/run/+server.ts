/**
 * Dev-only: kick off a Coral session against the orchestrator agent and
 * return its coordinates so the client can subscribe to live events.
 *
 * Lives under /api/dev/* until we wire session-backbone persistence
 * (Supabase research_sessions + research_runs) in a later reroll.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSession } from '$lib/server/coral';
import { mintGatewayToken, gatewayEventsWsUrl } from '$lib/server/fleet-gateway';
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
		// Route the dev harness through the gateway too (no direct-to-Coral
		// anywhere). Dev runs aren't user-owned, so mint with a fixed subject.
		const token = await mintGatewayToken({
			userId: 'dev-harness',
			namespace,
			sessionId,
			query: body.query.trim()
		});
		return json({
			namespace,
			sessionId,
			eventsWsUrl: gatewayEventsWsUrl(namespace, sessionId, token)
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw error(502, `coral createSession: ${msg}`);
	}
};
