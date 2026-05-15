import type { LayoutServerLoad } from './$types';
import { listChats } from '$lib/server/db/chats';

/**
 * Root layout load. Threads the authenticated user (from
 * hooks.server.ts) into every page and prefetches the recent-chats
 * list for the sidebar.
 *
 * Anonymous browsing is supported — the home page renders, but the
 * sidebar history is empty and the chat composer routes the user
 * through the sign-in modal before persisting anything.
 *
 * Failures on `listChats` degrade gracefully — sidebar shows empty
 * history rather than failing the whole page.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	let recents: Awaited<ReturnType<typeof listChats>> = [];
	if (locals.user) {
		try {
			recents = await listChats(locals.user.id, 50);
		} catch (err) {
			console.error('[layout] listChats failed:', err);
		}
	}
	return {
		user: locals.user,
		recents
	};
};
