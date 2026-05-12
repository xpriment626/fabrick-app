/**
 * Research session route — SSR load.
 *
 * Fetches the initial Coral session snapshot (/extended) and computes
 * the WS events URL server-side so the client Session class starts with
 * everything in hand and can begin applying events without race-gating.
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getExtendedSession, sessionEventsWsUrl } from '$lib/server/coral';

export const load: PageServerLoad = async ({ params, url }) => {
	const { namespace, sessionId } = params;
	const query = url.searchParams.get('q') ?? '';

	try {
		const snapshot = await getExtendedSession(namespace, sessionId);
		return {
			namespace,
			sessionId,
			query,
			eventsWsUrl: sessionEventsWsUrl(namespace, sessionId),
			initialAgents: snapshot.agents,
			initialThreads: snapshot.threads
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw error(502, `Failed to load session ${sessionId}: ${msg}`);
	}
};
