/**
 * POST /api/chat — create a new chat (authenticated users only).
 *
 * Body: { content?: string }
 *   - If `content` is provided, persists it as the first user turn so the
 *     client can navigate straight to /chat/[slug] and trigger streaming
 *     without an extra round trip to insert the first message.
 *
 * Response: { slug, firstTurnId | null }
 * 401: anonymous request (no session cookie) — client should open the
 *      login modal before retrying.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createChat } from '$lib/server/db/chats';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');

	let body: { content?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		// Empty body is fine — caller may just want an empty chat.
	}

	const content =
		typeof body.content === 'string' && body.content.trim().length > 0
			? body.content.trim()
			: undefined;

	try {
		const { slug, firstTurnId } = await createChat({
			userId: locals.user.id,
			firstUserMessage: content
		});
		return json({ slug, firstTurnId });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw error(500, msg);
	}
};
