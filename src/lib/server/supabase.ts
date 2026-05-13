/**
 * Supabase admin client.
 *
 * Uses the secret key (`sb_secret_*`, formerly `service_role`) which bypasses
 * RLS. Server-only — never import from any module that ships to the browser.
 *
 * Two reasons we run server-side as admin instead of as the authed user:
 *   1. Privy is the IdP, not Supabase Auth. Until step 3.5.b lands the
 *      JWT-minting bridge, there's no Supabase-compatible JWT to attach.
 *   2. Backend operations like the Privy webhook user upsert and BYOK key
 *      decryption (`get_openrouter_key`) need privileged access regardless.
 *
 * Per-request authed clients (using a minted Supabase JWT for RLS-enforced
 * client-side queries) come in step 3.5.b with the auth wiring.
 */

import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { Database } from './database.types';

if (!PUBLIC_SUPABASE_URL) {
	throw new Error('PUBLIC_SUPABASE_URL is not set');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
	throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
}

/**
 * Singleton admin client. Reuse across requests — supabase-js caches the
 * underlying fetch/connection layer, so creating one per request would
 * waste resources without buying anything.
 *
 * Note: `auth.persistSession: false` because there's no user session on
 * the admin client; we're acting as the backend, not as a user.
 */
export const supabaseAdmin = createClient<Database>(
	PUBLIC_SUPABASE_URL,
	SUPABASE_SERVICE_ROLE_KEY,
	{
		auth: {
			persistSession: false,
			autoRefreshToken: false,
			detectSessionInUrl: false
		},
		// Node 20 has no native WebSocket. supabase-js initializes its
		// realtime client at construction (even when we never use it) and
		// crashes without a transport. Inject `ws`. When we eventually
		// run on Node 22+ or full Bun runtime, this can come out.
		realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket }
	}
);
