/**
 * Populate `event.locals.user` for every request by parsing the
 * `fabrick-session` cookie. The cookie carries our minted JWT, whose
 * `sub` claim is the user's Privy DID.
 *
 * If the cookie is missing / expired / tampered, `locals.user` stays
 * null and the request is treated as unauthenticated. Route handlers
 * decide what to do with that (most chat routes require auth; the
 * home page tolerates anonymous browsing).
 */

import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME, verifyFabrickSessionToken } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	const token = event.cookies.get(SESSION_COOKIE_NAME);
	if (token) {
		try {
			const { privyDid } = await verifyFabrickSessionToken(token);
			const { data: row, error: rowErr } = await supabaseAdmin
				.from('users')
				.select('privy_user_id, email, display_name, solana_address')
				.eq('privy_user_id', privyDid)
				.maybeSingle();

			if (rowErr) {
				console.error('[hooks] users lookup failed:', rowErr.message);
			} else if (row) {
				event.locals.user = {
					id: row.privy_user_id,
					email: row.email,
					displayName: row.display_name,
					solanaAddress: row.solana_address
				};
			}
		} catch (err) {
			// Token verification failed (expired, bad signature, tampered).
			// Clear the cookie so the client knows to re-auth, and proceed
			// as anonymous.
			event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
			console.warn(
				'[hooks] session token rejected:',
				err instanceof Error ? err.message : String(err)
			);
		}
	}

	return resolve(event);
};
