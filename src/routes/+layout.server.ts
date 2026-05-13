import type { LayoutServerLoad } from './$types';
import { listChats, DEV_USER_ID } from '$lib/server/db/chats';

/**
 * Root layout load. Fetches the recent-chats list once so the sidebar
 * is populated on every page without each route having to re-fetch.
 *
 * Failures degrade gracefully — sidebar renders with empty history if
 * Supabase is unreachable, rather than failing the whole page.
 */
export const load: LayoutServerLoad = async () => {
	let recents: Awaited<ReturnType<typeof listChats>> = [];
	try {
		recents = await listChats(DEV_USER_ID, 50);
	} catch (err) {
		console.error('[layout] listChats failed:', err);
	}
	return { recents };
};
