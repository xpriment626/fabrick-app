/**
 * POST /api/fleet/fail — mark a fleet run failed (loudly, descriptively).
 *
 * Called by the fleet-gateway (service-authed) when a run settles without a
 * synthesis — coral session closed early, connection errored, or the gateway's
 * orphan-watch timed out. Flips research_runs to `failed` with a descriptive
 * `error_message` so the run stops hanging on `running` forever and the chat
 * re-entry strip shows it in red. Best-effort: a missing row (non-chat run) is
 * expected and logged, not fatal.
 *
 * Auth: the shared `x-gateway-service` secret only — no user session, since
 * the gateway runs server-side with no cookie.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { env as privateEnv } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
	const serviceSecret = privateEnv.GATEWAY_SERVICE_SECRET;
	const presented = request.headers.get('x-gateway-service');
	if (!serviceSecret || presented !== serviceSecret) {
		throw error(401, 'service auth required');
	}

	let body: Record<string, unknown> = {};
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'expected JSON body');
	}

	const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
	const reason =
		typeof body.reason === 'string' && body.reason.trim()
			? body.reason.trim().slice(0, 500)
			: 'fleet run failed (no reason supplied)';
	if (!sessionId) throw error(400, 'sessionId is required');

	console.warn(`[fleet/fail] marking run failed (${sessionId}): ${reason}`);

	const updateRes = await supabaseAdmin
		.from('research_runs')
		.update({ status: 'failed', error_message: reason, finished_at: new Date().toISOString() })
		.eq('coral_session_id', sessionId)
		.in('status', ['running', 'queued']);

	if (updateRes.error) {
		console.warn(`[fleet/fail] research_runs update failed for ${sessionId}:`, updateRes.error.message);
	}

	return json({ ok: true });
};
