/**
 * Populate `event.locals.user` for every request by parsing the
 * `fabrick-session` cookie. The cookie carries our minted JWT, whose
 * `sub` claim is the user's Privy DID.
 *
 * If the cookie is missing / expired / tampered, `locals.user` stays
 * null and the request is treated as unauthenticated. Public savings catalogue
 * pages tolerate anonymous browsing; wallet/account routes require auth.
 */

import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
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

	// Dev-only auth bypass. Lets Playwright (and manual local browsing)
	// hit gated routes without the Privy login dance. Double-gated: only
	// fires under `vite dev` (compiled to false in any prod build) AND
	// when DEV_AUTH_PRIVY_DID is explicitly set. It resolves a REAL users
	// row (not a synthetic id) so downstream Supabase FK references hold.
	//   DEV_AUTH_PRIVY_DID=<did>  → impersonate that user
	//   DEV_AUTH_PRIVY_DID=*      → grab the first users row (zero-config)
	if (dev && !event.locals.user && env.DEV_AUTH_PRIVY_DID) {
		const wantsFirst = env.DEV_AUTH_PRIVY_DID === '*';
		const base = supabaseAdmin
			.from('users')
			.select('privy_user_id, email, display_name, solana_address');
		const { data: rows, error } = await (wantsFirst
			? base.limit(1)
			: base.eq('privy_user_id', env.DEV_AUTH_PRIVY_DID).limit(1));
		const row = rows?.[0];
		if (error) {
			console.warn('[hooks] dev auth bypass lookup failed:', error.message);
		} else if (row) {
			event.locals.user = {
				id: row.privy_user_id,
				email: row.email,
				displayName: row.display_name,
				solanaAddress: row.solana_address
			};
			console.warn(
				`[hooks] ⚠ DEV AUTH BYPASS active — authed as ${row.email ?? row.privy_user_id}`
			);
		} else {
			console.warn('[hooks] dev auth bypass set but no users row found');
		}
	}

	return resolve(event);
};
