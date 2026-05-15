/**
 * Privy client singleton (browser only).
 *
 * Initializes the `@privy-io/js-sdk-core` library, restores any
 * existing session, and exposes a thin reactive API the login modal
 * + connect button can read.
 *
 * Why singleton: the Privy SDK keeps internal session state and
 * refresh timers; multiple instances would race. Always import from
 * here, never call `new Privy(...)` directly.
 *
 * Why browser-only: this module imports `@privy-io/js-sdk-core` which
 * pokes at `window` / `localStorage` on construction. Server-side
 * code uses `$lib/server/auth` instead.
 */

import Privy, { LocalStorage } from '@privy-io/js-sdk-core';
import { PUBLIC_PRIVY_APP_ID } from '$env/static/public';
import { browser } from '$app/environment';

let _privy: Privy | null = null;
let _initPromise: Promise<void> | null = null;

/** Lazily construct + initialize. Safe to call repeatedly. */
export async function getPrivy(): Promise<Privy> {
	if (!browser) {
		throw new Error('getPrivy() called server-side — use $lib/server/auth instead');
	}
	if (!PUBLIC_PRIVY_APP_ID) {
		throw new Error('PUBLIC_PRIVY_APP_ID is not set');
	}
	if (!_privy) {
		_privy = new Privy({
			appId: PUBLIC_PRIVY_APP_ID,
			storage: new LocalStorage()
		});
	}
	if (!_initPromise) {
		_initPromise = _privy.initialize().catch((err) => {
			// Reset so subsequent attempts can retry. Storage blocked /
			// network issues shouldn't permanently lock us out.
			_initPromise = null;
			throw err;
		});
	}
	await _initPromise;
	return _privy;
}

/**
 * Send the freshly-issued Privy access token to our backend, which
 * verifies it, upserts the user, and sets the `fabrick-session`
 * cookie. Returns the user shape the server echoes back.
 */
export async function exchangeForFabrickSession(privy: Privy): Promise<{
	id: string;
	email: string | null;
	displayName: string | null;
	solanaAddress: string | null;
}> {
	const accessToken = await privy.getAccessToken();
	if (!accessToken) {
		throw new Error('No Privy access token available');
	}
	const res = await fetch('/api/auth/session', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ accessToken })
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`session exchange failed: ${res.status} ${text || res.statusText}`);
	}
	const body = (await res.json()) as {
		user: {
			id: string;
			email: string | null;
			displayName: string | null;
			solanaAddress: string | null;
		};
	};
	return body.user;
}

/**
 * Server-side sign-out: clears our `fabrick-session` cookie. Note:
 * this does NOT log the user out of Privy itself — call
 * `privy.logout()` separately if you want them re-prompted next time.
 */
export async function clearFabrickSession(): Promise<void> {
	await fetch('/api/auth/session', { method: 'DELETE' });
}
