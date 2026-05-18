/**
 * /discover/[slug] loader.
 *
 * Resolves the story (via cache → Firecrawl scrape → 404), and if the
 * user is signed in, loads any existing chat anchored to this story so
 * follow-ups continue the same conversation across visits.
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { resolveStory, listRelatedStories } from '$lib/server/discover-stories';
import { findChatByAnchor, loadChat } from '$lib/server/db/chats';

export const load: PageServerLoad = async ({ params, locals }) => {
	const slug = params.slug;
	const story = await resolveStory(slug);
	if (!story) throw error(404, 'Story not found');

	const related = await listRelatedStories(slug, 3);

	// Load any existing story-anchored chat for this user so follow-up
	// turns thread into a persistent conversation.
	let chat: Awaited<ReturnType<typeof loadChat>> | null = null;
	if (locals.user) {
		const existing = await findChatByAnchor({
			userId: locals.user.id,
			anchorType: 'story',
			anchorValue: slug
		});
		if (existing) chat = await loadChat(existing.slug);
	}

	return {
		story,
		related,
		chat,
		signedIn: !!locals.user
	};
};
