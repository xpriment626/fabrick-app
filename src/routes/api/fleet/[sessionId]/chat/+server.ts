/**
 * POST /api/fleet/[sessionId]/chat
 *
 * Run-anchored chat (design.md §17). Lazily ensures a chat session
 * anchored to (anchor_type='fleet_run', anchor_value=<coral session_id>)
 * exists for this user, and seeds it with the user's first message in one
 * round trip. Returns the chat slug; the client then POSTs follow-up turns
 * to /api/chat/[chatSlug]/turn as usual.
 *
 * Mirror of /api/discover/[slug]/chat — the run is the anchor instead of a
 * story. The follow-up chat's system prompt seeds the run's synthesis (see
 * composeSystemPrompt's `fleet_run` branch).
 *
 * Ownership + "completed runs only" gate in one read: only completed runs
 * have a `fleet_runs_archive` row, and `getFleetRunBySessionId` is
 * per-user-scoped — so a missing row means either not-yours or not-done,
 * both of which should 404 here.
 *
 * Body: { content: string }
 * Response: { chatSlug, firstTurnId, created: boolean }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createChat, findChatByAnchor, appendTurn, resolveSlug } from '$lib/server/db/chats';
import { getFleetRunBySessionId } from '$lib/server/libsql';

/** Title for a fresh run chat: the run's query, trimmed for the sidebar. */
function runChatTitle(query: string): string {
	const q = query.trim();
	return q.length > 80 ? q.slice(0, 80).trimEnd() + '…' : q || 'Fleet run';
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');

	const sessionId = params.sessionId;
	if (!sessionId) throw error(400, 'session id required');

	let body: { content?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'expected JSON body');
	}

	const content = typeof body.content === 'string' ? body.content.trim() : '';
	if (!content) throw error(400, '`content` must be a non-empty string');

	// Gate: the run must be a completed, archived run owned by this user.
	const run = await getFleetRunBySessionId(sessionId, locals.user.id);
	if (!run) throw error(404, `no completed fleet run for session ${sessionId}`);

	const existing = await findChatByAnchor({
		userId: locals.user.id,
		anchorType: 'fleet_run',
		anchorValue: sessionId
	});

	if (existing) {
		const resolved = await resolveSlug(existing.slug);
		if (!resolved) throw error(500, 'anchor chat went missing mid-request');
		const turn = await appendTurn({
			sessionId: resolved.id,
			role: 'user',
			content
		});
		return json({ chatSlug: existing.slug, firstTurnId: turn.id, created: false });
	}

	const { slug: chatSlug, firstTurnId } = await createChat({
		userId: locals.user.id,
		firstUserMessage: content,
		title: runChatTitle(run.query),
		anchorType: 'fleet_run',
		anchorValue: sessionId
	});

	return json({ chatSlug, firstTurnId, created: true });
};
