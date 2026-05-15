/**
 * POST /api/settings/openrouter-key — set the user's BYOK OpenRouter
 * key. The plaintext is encrypted with the Vault-stored master key by
 * the `set_openrouter_key` security-definer Postgres function; nothing
 * sensitive lands in app code.
 *
 * DELETE /api/settings/openrouter-key — clear via `clear_openrouter_key`.
 *
 * Both RPCs read `current_privy_user_id()` from the JWT claim — that's
 * what `supabaseFor(sessionToken)` provides via the Authorization
 * header. Using `supabaseAdmin` would bypass the JWT context and the
 * function would error with `No JWT claim found`.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE_NAME } from '$lib/server/auth';
import { supabaseFor } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');
	const token = cookies.get(SESSION_COOKIE_NAME);
	if (!token) throw error(401, 'missing session');

	let body: { key?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'expected JSON body');
	}

	const key = typeof body.key === 'string' ? body.key.trim() : '';
	if (!key) throw error(400, '`key` required');
	if (!key.startsWith('sk-or-')) {
		throw error(400, 'OpenRouter keys start with `sk-or-`');
	}

	const supabase = supabaseFor(token);
	const { error: rpcErr } = await supabase.rpc('set_openrouter_key', { plaintext: key });
	if (rpcErr) {
		throw error(500, `set_openrouter_key failed: ${rpcErr.message}`);
	}

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ cookies, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');
	const token = cookies.get(SESSION_COOKIE_NAME);
	if (!token) throw error(401, 'missing session');

	const supabase = supabaseFor(token);
	const { error: rpcErr } = await supabase.rpc('clear_openrouter_key');
	if (rpcErr) {
		throw error(500, `clear_openrouter_key failed: ${rpcErr.message}`);
	}
	return json({ ok: true });
};
