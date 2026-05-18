/**
 * POST /api/fleet/run — kick off a Coral research session against the
 * 7-agent fleet. Auth-gated production sibling of /api/dev/run.
 *
 * Body: { query: string, slug?: string }
 *   - `query` is the user's research question; injected into the
 *     orchestrator via the INITIAL_QUERY agent option.
 *   - `slug` is an optional human-readable namespace tag (e.g. the
 *     originating chat slug). Defaults to a short timestamp slug.
 *
 * Response: { namespace, sessionId, eventsWsUrl, redirectTo }
 *   - `redirectTo` is the canonical /research/[ns]/[sid]?q=... path the
 *     client should navigate to. Server-built so the URL-encoding is
 *     consistent.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSession, sessionEventsWsUrl } from '$lib/server/coral';
import { buildOrchestratorSessionRequest } from '$lib/server/session-request';
import { resolveSlug } from '$lib/server/db/chats';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');

	let body: { query?: unknown; slug?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'expected JSON body { query: string, slug?: string }');
	}

	const query = typeof body.query === 'string' ? body.query.trim() : '';
	if (!query) throw error(400, '`query` must be a non-empty string');

	const slug =
		typeof body.slug === 'string' && body.slug.trim()
			? body.slug.trim().slice(0, 32)
			: `fleet-${Date.now().toString(36)}`;

	const sessionRequest = buildOrchestratorSessionRequest({
		sessionSlug: slug,
		userQuery: query
	});

	try {
		const { namespace, sessionId } = await createSession(sessionRequest);

		// If the dispatched slug maps to an actual chat owned by this
		// user, persist a research_runs row linking the Coral session to
		// the chat. The chat page reads these to surface "re-enter this
		// fleet run" cards — without this row, dispatched runs would be
		// reachable only from the URL the user just navigated to.
		const linkedChat = await resolveSlug(slug).catch(() => null);
		if (linkedChat && linkedChat.userId === locals.user.id) {
			const insertRes = await supabaseAdmin.from('research_runs').insert({
				session_id: linkedChat.id,
				coral_session_id: sessionId,
				status: 'running',
				started_at: new Date().toISOString()
			});
			if (insertRes.error) {
				// Non-fatal — the run is alive, the user just won't see a
				// chat-side re-entry card. Log + continue.
				console.warn('[fleet/run] research_runs insert failed:', insertRes.error.message);
			}
		}

		const redirectTo = `/research/${encodeURIComponent(namespace)}/${encodeURIComponent(
			sessionId
		)}?q=${encodeURIComponent(query)}`;
		return json({
			namespace,
			sessionId,
			eventsWsUrl: sessionEventsWsUrl(namespace, sessionId),
			redirectTo
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw error(502, `coral createSession: ${msg}`);
	}
};
