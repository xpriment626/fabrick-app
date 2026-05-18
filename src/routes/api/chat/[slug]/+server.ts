/**
 * DELETE /api/chat/[slug] — soft-archive a chat.
 *
 * Sets `archived_at = now()` on the `research_sessions` row, which
 * removes it from sidebar history, the chat-page loader, and any
 * future lookups. Existing turns + linked fleet runs are preserved in
 * the DB but become unreachable through the UI.
 *
 * 401 if anonymous; 404 if slug doesn't exist for this user.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { archiveChat } from '$lib/server/db/chats';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');

	const slug = params.slug;
	if (!slug) throw error(400, 'slug required');

	const archived = await archiveChat(slug, locals.user.id);
	if (!archived) throw error(404, `chat not found: ${slug}`);

	return json({ ok: true });
};
