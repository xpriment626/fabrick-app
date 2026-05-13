import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadChat, listChats, DEV_USER_ID } from '$lib/server/db/chats';

export const load: PageServerLoad = async ({ params, url }) => {
	const chat = await loadChat(params.slug);
	if (!chat) throw error(404, `chat not found: ${params.slug}`);

	// Side panel data (recent chats list).
	const recents = await listChats(DEV_USER_ID, 30);

	return {
		chat,
		recents,
		// If `?autosend=1`, the client knows the last user turn is fresh
		// and needs to be sent to the model. Set by AmbientChatBar after
		// creating a new chat with a seeded first message.
		autosend: url.searchParams.get('autosend') === '1'
	};
};
