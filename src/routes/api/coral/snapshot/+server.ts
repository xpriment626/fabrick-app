/**
 * GET /api/coral/snapshot?namespace=...&sessionId=...
 *
 * Thin client-callable proxy for coral-server's `/extended` snapshot.
 * Exists so the browser-side Session class can reconcile state after
 * the WebSocket opens — there's a small window between session
 * creation (SSR snapshot fetch) and WS subscription where events like
 * `thread_created` can fire, leaving the client without a thread to
 * attach incoming `thread_message_sent` events to.
 *
 * Auth: requires a signed-in user. We don't validate ownership of the
 * coral namespace here (coral-server doesn't expose that link); access
 * is gated only at the SvelteKit layer.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getExtendedSession } from '$lib/server/coral';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');

	const namespace = url.searchParams.get('namespace');
	const sessionId = url.searchParams.get('sessionId');
	if (!namespace || !sessionId) {
		throw error(400, 'namespace and sessionId are required');
	}

	try {
		const snapshot = await getExtendedSession(namespace, sessionId);
		return json(snapshot);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw error(502, msg);
	}
};
