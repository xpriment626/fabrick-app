/**
 * POST /api/chat — create a new chat.
 *
 * Body: { content?: string }
 *   - If `content` is provided, persists it as the first user turn so the
 *     client can navigate straight to /chat/[slug] and trigger streaming
 *     without an extra round trip to insert the first message.
 *
 * Response: { slug, firstTurnId | null }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createChat, DEV_USER_ID } from '$lib/server/db/chats';

export const POST: RequestHandler = async ({ request }) => {
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
			userId: DEV_USER_ID,
			firstUserMessage: content
		});
		return json({ slug, firstTurnId });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw error(500, msg);
	}
};
