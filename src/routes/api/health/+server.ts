/**
 * GET /api/health
 *
 * Lightweight liveness check that proves the Supabase admin client can
 * reach the database. Returns row counts for each public table so we can
 * also see at a glance whether seed data exists. No secrets in the
 * response — table names + counts are inert.
 *
 * Useful for:
 *   - smoke-testing a fresh deployment
 *   - confirming env vars are wired correctly after a `vercel env pull`
 *   - one-shot debugging when something feels wrong upstream
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';

const TABLES = [
	'users',
	'user_settings',
	'research_sessions',
	'research_runs',
	'research_turns',
	'research_citations'
] as const;

export const GET: RequestHandler = async () => {
	const started = Date.now();
	const counts: Record<string, number | string> = {};

	for (const table of TABLES) {
		const { count, error } = await supabaseAdmin
			.from(table)
			.select('*', { count: 'exact', head: true });
		counts[table] = error ? `error: ${error.message}` : (count ?? 0);
	}

	const ok = Object.values(counts).every((v) => typeof v === 'number');
	const latencyMs = Date.now() - started;

	return json(
		{
			ok,
			latencyMs,
			tables: counts
		},
		{ status: ok ? 200 : 503 }
	);
};
