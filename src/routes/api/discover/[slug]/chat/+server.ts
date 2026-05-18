/**
 * POST /api/discover/[slug]/chat
 *
 * Lazily ensures a chat session anchored to (anchor_type='story',
 * anchor_value=storySlug) exists for this user, and seeds it with the
 * user's first message in one round trip. Returns the chat slug; the
 * client then POSTs follow-up turns to /api/chat/[chatSlug]/turn as
 * usual.
 *
 * One chat per user per story by default — repeat visits reuse the
 * existing thread. If somehow two slipped through (race), we use the
 * most recently updated one (per `findChatByAnchor`).
 *
 * Body: { content: string }
 * Response: { chatSlug, firstTurnId, created: boolean }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createChat, findChatByAnchor, appendTurn, resolveSlug } from '$lib/server/db/chats';
import { resolveStory } from '$lib/server/discover-stories';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');

	const storySlug = params.slug;
	if (!storySlug) throw error(400, 'story slug required');

	let body: { content?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'expected JSON body');
	}

	const content = typeof body.content === 'string' ? body.content.trim() : '';
	if (!content) throw error(400, '`content` must be a non-empty string');

	// Confirm the story actually exists before creating a session for
	// it — avoids ghost chats anchored to slugs that 404.
	const story = await resolveStory(storySlug);
	if (!story) throw error(404, `story not found: ${storySlug}`);

	const existing = await findChatByAnchor({
		userId: locals.user.id,
		anchorType: 'story',
		anchorValue: storySlug
	});

	if (existing) {
		// Reuse — append the new user turn and return.
		const resolved = await resolveSlug(existing.slug);
		if (!resolved) throw error(500, 'anchor chat went missing mid-request');
		const turn = await appendTurn({
			sessionId: resolved.id,
			role: 'user',
			content
		});
		return json({ chatSlug: existing.slug, firstTurnId: turn.id, created: false });
	}

	// Fresh — title is the story headline so the sidebar groups well.
	const { slug: chatSlug, firstTurnId } = await createChat({
		userId: locals.user.id,
		firstUserMessage: content,
		title: story.story.headline,
		anchorType: 'story',
		anchorValue: storySlug
	});

	return json({ chatSlug, firstTurnId, created: true });
};
