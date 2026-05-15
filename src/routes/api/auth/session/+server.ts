/**
 * POST /api/auth/session — exchange a Privy access token for a Fabrick
 * session cookie.
 *
 * Body: { accessToken: string }
 *
 * Steps:
 *   1. Verify the Privy access token (signature against Privy JWKS).
 *   2. Fetch the full Privy user (linkedAccounts) so we can read email
 *      + embedded Solana wallet address.
 *   3. Upsert into `users` via the admin client (RLS doesn't allow
 *      arbitrary INSERTs into `users`; user provisioning is privileged).
 *   4. Mint a Supabase-compatible JWT with `sub` = Privy DID.
 *   5. Set as httpOnly `fabrick-session` cookie.
 *
 * DELETE /api/auth/session — clears the cookie (sign out).
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	SESSION_COOKIE_NAME,
	SESSION_TTL_MS,
	verifyPrivyAccessToken,
	fetchPrivyUser,
	flattenPrivyUser,
	mintFabrickSessionToken,
	ensureSolanaWallet
} from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { dev } from '$app/environment';

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: { accessToken?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Body must be JSON');
	}

	if (typeof body.accessToken !== 'string' || body.accessToken.length < 10) {
		throw error(400, 'accessToken required');
	}

	// Step 1: verify the Privy access token.
	let claims: Awaited<ReturnType<typeof verifyPrivyAccessToken>>;
	try {
		claims = await verifyPrivyAccessToken(body.accessToken);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw error(401, `Invalid Privy access token: ${msg}`);
	}
	const privyDid = claims.userId;

	// Step 2: fetch full Privy user — gives us email + embedded Solana wallet.
	let privyUser: Awaited<ReturnType<typeof fetchPrivyUser>>;
	try {
		privyUser = await fetchPrivyUser(privyDid);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw error(502, `Could not fetch Privy user: ${msg}`);
	}
	let flattened = flattenPrivyUser(privyUser);

	// Step 2b: if the dashboard's `createOnLogin` hasn't propagated yet
	// (it's async — wallet creation kicks off in parallel with login),
	// explicitly provision a Solana embedded wallet server-side. The
	// call is idempotent — if a wallet already exists it just returns
	// the user unchanged.
	if (!flattened.solanaAddress) {
		console.log(
			`[auth/session] no Solana wallet on user ${privyDid} — calling ensureSolanaWallet`
		);
		try {
			const provisioned = await ensureSolanaWallet(privyDid);
			flattened = flattenPrivyUser(provisioned);
			console.log(
				`[auth/session] after ensureSolanaWallet, solanaAddress=${flattened.solanaAddress ?? '(still none)'}`
			);
		} catch (err) {
			console.error(
				`[auth/session] ensureSolanaWallet failed:`,
				err instanceof Error ? err.message : String(err)
			);
			// Continue without throwing — the user still gets a session;
			// the wallet column stays null and the UI will show the
			// "provisioning" placeholder until next sign-in.
		}
	}

	const { email, displayName, solanaAddress } = flattened;

	// Step 3: upsert into our users table.
	const upsert = await supabaseAdmin
		.from('users')
		.upsert(
			{
				privy_user_id: privyDid,
				email,
				display_name: displayName,
				solana_address: solanaAddress,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'privy_user_id' }
		)
		.select('privy_user_id, email, display_name, solana_address')
		.single();

	if (upsert.error || !upsert.data) {
		throw error(500, `users upsert failed: ${upsert.error?.message ?? 'no row'}`);
	}

	// Step 4: mint our Supabase-compatible JWT.
	const sessionToken = await mintFabrickSessionToken(privyDid);

	// Step 5: set httpOnly cookie.
	cookies.set(SESSION_COOKIE_NAME, sessionToken, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: Math.floor(SESSION_TTL_MS / 1000)
	});

	return json({
		user: {
			id: upsert.data.privy_user_id,
			email: upsert.data.email,
			displayName: upsert.data.display_name,
			solanaAddress: upsert.data.solana_address
		}
	});
};

export const DELETE: RequestHandler = async ({ cookies }) => {
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	return json({ ok: true });
};
