/**
 * Server-side auth primitives — verify Privy access tokens, mint
 * Supabase-compatible JWTs, parse the session cookie.
 *
 * Flow:
 *   client logs in via Privy → gets Privy access token
 *   POST /api/auth/session with the token
 *     → verifyPrivyAccessToken (locally against Privy's JWKS)
 *     → upsert into `users` (admin client, bypasses RLS)
 *     → mintSupabaseJwt — signs an HS256 JWT with SUPABASE_JWT_SECRET,
 *       `sub` = Privy DID, claim shape Supabase's RLS expects
 *     → set httpOnly cookie
 *   subsequent requests: hooks.server.ts reads cookie, calls
 *   verifyFabrickSessionToken to populate `event.locals.user`.
 *
 * Why two JWTs:
 *   - Privy access token = proof the user logged in with Privy
 *   - Fabrick session JWT = a Supabase-compatible bearer token whose
 *     `sub` claim is what `current_privy_user_id()` reads to enforce RLS.
 *   Bridging the two lets Privy be the IdP while Supabase enforces row
 *   ownership without learning anything about Privy.
 */

import { PrivyClient, type AuthTokenClaims } from '@privy-io/server-auth';
import { SignJWT, jwtVerify } from 'jose';
import { PRIVY_APP_SECRET } from '$env/static/private';
import { env as privateEnv } from '$env/dynamic/private';
import { PUBLIC_PRIVY_APP_ID } from '$env/static/public';

if (!PUBLIC_PRIVY_APP_ID) {
	throw new Error('PUBLIC_PRIVY_APP_ID is not set');
}
if (!PRIVY_APP_SECRET) {
	throw new Error('PRIVY_APP_SECRET is not set');
}

/**
 * Read SUPABASE_JWT_SECRET via dynamic env so the type-checker doesn't
 * fail when the variable hasn't been added to `.env` yet. Runtime check
 * below still throws clearly if it's missing.
 */
const SUPABASE_JWT_SECRET = privateEnv.SUPABASE_JWT_SECRET;
if (!SUPABASE_JWT_SECRET) {
	throw new Error('SUPABASE_JWT_SECRET is not set');
}

/** Cookie name carrying our minted Supabase-compatible JWT. */
export const SESSION_COOKIE_NAME = 'fabrick-session';

/** Bridge JWT lifetime. Renewed transparently on the next /api/auth/session call. */
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h

const supabaseJwtKey = new TextEncoder().encode(SUPABASE_JWT_SECRET);

export const privyClient = new PrivyClient(PUBLIC_PRIVY_APP_ID, PRIVY_APP_SECRET);

export type AuthedUser = {
	/** Privy DID, e.g. `did:privy:cmp...` — matches `users.privy_user_id`. */
	id: string;
	email: string | null;
	displayName: string | null;
	/** User's Privy embedded Solana wallet address, if provisioned. */
	solanaAddress: string | null;
};

/**
 * Verify a Privy access token against Privy's JWKS. Returns the
 * decoded claims (userId, sessionId, etc.) or throws on failure.
 *
 * Local verification — no network call to Privy. The SDK caches JWKS.
 */
export async function verifyPrivyAccessToken(token: string): Promise<AuthTokenClaims> {
	return await privyClient.verifyAuthToken(token);
}

/**
 * Fetch the full Privy user object by DID. Network call — pulls
 * linked accounts (email, wallets, etc.) so we can populate our
 * `users` table mirror.
 */
export async function fetchPrivyUser(privyDid: string) {
	return await privyClient.getUserById(privyDid);
}

/**
 * Ensure the user has a Solana embedded wallet provisioned. The
 * dashboard's `createOnLogin: 'users-without-wallets'` setting kicks
 * off wallet creation during login, but it's async — `getUserById`
 * can race past it and return a user with no Solana wallet in
 * `linkedAccounts`. This idempotent call explicitly provisions one
 * server-side (no-op if a wallet already exists). Returns the
 * (refreshed) user object.
 */
export async function ensureSolanaWallet(privyDid: string) {
	return await privyClient.createWallets({
		userId: privyDid,
		createSolanaWallet: true
	});
}

/**
 * Extract the canonical email + display name + Solana embedded wallet
 * address from a Privy user object. Privy stores everything as
 * `linkedAccounts` of various types; we flatten to the fields we need.
 */
export function flattenPrivyUser(user: Awaited<ReturnType<typeof fetchPrivyUser>>): {
	email: string | null;
	displayName: string | null;
	solanaAddress: string | null;
} {
	const linked = user.linkedAccounts ?? [];

	const emailAccount = linked.find(
		(a): a is Extract<typeof a, { type: 'email' }> => a.type === 'email'
	);
	const email = emailAccount?.address ?? null;

	const solanaWallet = linked.find(
		(a): a is Extract<typeof a, { type: 'wallet' }> =>
			a.type === 'wallet' && (a as { chainType?: string }).chainType === 'solana'
	);
	const solanaAddress = solanaWallet?.address ?? null;

	// Display name: prefer email local-part, fall back to truncated DID.
	const displayName = email
		? email.split('@')[0]
		: user.id.slice('did:privy:'.length, 'did:privy:'.length + 8);

	return { email, displayName, solanaAddress };
}

/**
 * Mint a Supabase-compatible JWT for the given Privy DID. Sign with
 * the Supabase project's JWT secret (HS256) and set claims Supabase's
 * RLS context expects:
 *   - `sub` (read by `current_privy_user_id()`)
 *   - `aud: 'authenticated'`
 *   - `role: 'authenticated'`
 */
export async function mintFabrickSessionToken(privyDid: string): Promise<string> {
	return await new SignJWT({ role: 'authenticated' })
		.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
		.setSubject(privyDid)
		.setAudience('authenticated')
		.setIssuedAt()
		.setExpirationTime(`${SESSION_TTL_SECONDS}s`)
		.sign(supabaseJwtKey);
}

/**
 * Verify a previously-minted Fabrick session token (our own JWT bridge),
 * return the Privy DID it carries. Throws on signature failure or expiry.
 */
export async function verifyFabrickSessionToken(token: string): Promise<{ privyDid: string }> {
	const { payload } = await jwtVerify(token, supabaseJwtKey, {
		audience: 'authenticated'
	});
	if (typeof payload.sub !== 'string' || !payload.sub.startsWith('did:privy:')) {
		throw new Error('Invalid session token: missing or malformed sub claim');
	}
	return { privyDid: payload.sub };
}

export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
