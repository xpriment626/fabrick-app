import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadChat } from '$lib/server/db/chats';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	if (!locals.user) throw redirect(302, '/');

	const chat = await loadChat(params.slug);
	if (!chat) throw error(404, `chat not found: ${params.slug}`);
	if (chat.userId !== locals.user.id) throw error(403, 'not your chat');

	// Recents now come from the root +layout.server.ts (global sidebar
	// reads them via $page.data). No per-route fetch needed here.

	return {
		chat,
		// If `?autosend=1`, the client knows the last user turn is fresh
		// and needs to be sent to the model. Set by AmbientChatBar after
		// creating a new chat with a seeded first message.
		autosend: url.searchParams.get('autosend') === '1'
	};
};
