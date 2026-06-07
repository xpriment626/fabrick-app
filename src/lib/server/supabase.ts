/**
 * Supabase admin client.
 *
 * Uses the secret key (`sb_secret_*`, formerly `service_role`) which bypasses
 * RLS. Server-only — never import from any module that ships to the browser.
 *
 * Backend writes such as Privy user upsert, savings-account persistence, and
 * savings-event logging use explicit user_id filters and the service key.
 * Per-request authed clients are still available when a route should respect
 * Supabase RLS directly.
 */

import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { Database } from './database.types';

if (!PUBLIC_SUPABASE_URL) {
	throw new Error('PUBLIC_SUPABASE_URL is not set');
}
if (!PUBLIC_SUPABASE_ANON_KEY) {
	throw new Error('PUBLIC_SUPABASE_ANON_KEY is not set');
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

/**
 * Per-request authed client — attaches the user's minted Fabrick session
 * JWT (the Supabase-compatible bridge token) as the Authorization header.
 * Supabase's request handler pulls the JWT into `request.jwt.claims`, and
 * RLS via `current_privy_user_id()` reads `sub` from there.
 *
 * Use this from any route handler that should respect RLS directly. Reserve
 * `supabaseAdmin` for backend operations with explicit user_id filtering.
 *
 * Note: anon key + JWT header is what the Supabase JS client expects for
 * authed requests. The anon key passes the API gateway; the JWT
 * establishes user identity.
 */
export function supabaseFor(sessionToken: string) {
	return createClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
			detectSessionInUrl: false
		},
		global: {
			headers: { Authorization: `Bearer ${sessionToken}` }
		},
		realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket }
	});
}
