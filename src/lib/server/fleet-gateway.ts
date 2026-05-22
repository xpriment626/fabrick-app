/**
 * Fleet-gateway token minting (SvelteKit side).
 *
 * The browser no longer connects directly to coral-server with the shared
 * `CORAL_AUTH_TOKEN` in the URL. Instead, when we kick off a fleet run we
 * mint a short-lived, session-scoped JWT and hand the browser a gateway URL
 * carrying it. The gateway (a separate long-running process — see
 * `services/fleet-gateway/`) verifies the JWT, enforces that it matches the
 * requested session, and relays the event stream from a privately-networked
 * coral-server.
 *
 * The JWT is a capability: its `ns`/`sid` claims bind it to exactly one
 * session, so it grants no access to any other run. Ownership is established
 * here at mint time (the caller is the authenticated user who just created
 * the session) and carried in the signed token — the gateway needs no DB
 * lookup for the first roll.
 *
 * Env (read dynamically so a missing var fails clearly at runtime rather than
 * breaking the build before the gateway is wired):
 *  - GATEWAY_JWT_SECRET — HMAC secret shared with the gateway process
 *  - FLEET_GATEWAY_URL  — gateway base URL (http/https; converted to ws/wss)
 */

import { SignJWT } from 'jose';
import { env as privateEnv } from '$env/dynamic/private';

function gatewaySecret(): Uint8Array {
	const secret = privateEnv.GATEWAY_JWT_SECRET;
	if (!secret) {
		throw new Error('GATEWAY_JWT_SECRET is not set — add it to .env (see .env.example).');
	}
	return new TextEncoder().encode(secret);
}

/**
 * Mint a session-scoped JWT for the gateway. TTL defaults to 30 minutes —
 * long enough to cover a fleet run end-to-end; the browser only needs it at
 * connect time.
 */
export async function mintGatewayToken(opts: {
	userId: string;
	namespace: string;
	sessionId: string;
	query?: string;
	ttlSeconds?: number;
}): Promise<string> {
	const ttl = opts.ttlSeconds ?? 60 * 30;
	const nowSec = Math.floor(Date.now() / 1000);
	// `q` rides in the token so the gateway can pass the original query to the
	// server-side archive trigger without a DB lookup. Capped to bound URL size.
	const q = (opts.query ?? '').slice(0, 1000);
	return await new SignJWT({ ns: opts.namespace, sid: opts.sessionId, q })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(opts.userId)
		.setIssuedAt(nowSec)
		.setExpirationTime(nowSec + ttl)
		.sign(gatewaySecret());
}

/**
 * Build the browser-facing gateway WebSocket URL for a session's event
 * stream. http→ws / https→wss conversion mirrors `coral.ts`. The token rides
 * in the query string because browser WebSocket clients can't set headers —
 * but unlike the old direct-to-Coral URL, this is a short-lived, single-
 * session capability, not the shared infrastructure secret.
 */
export function gatewayEventsWsUrl(
	namespace: string,
	sessionId: string,
	token: string
): string {
	const base = privateEnv.FLEET_GATEWAY_URL ?? 'http://localhost:8787';
	const u = new URL(base);
	const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${proto}//${u.host}/events/${encodeURIComponent(namespace)}/${encodeURIComponent(
		sessionId
	)}?token=${encodeURIComponent(token)}`;
}
