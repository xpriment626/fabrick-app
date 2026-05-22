/**
 * Fleet Archives — the index of a user's completed fleet runs.
 *
 * Reads the durable Turso archive (per-user scoped). Each row carries the
 * query, synthesis, message count, and (post-002) cost telemetry, which the
 * page surfaces as cards. Failed/in-progress runs aren't here — they surface
 * on the chat re-entry strip via research_runs; this page is completed runs.
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listFleetRunsForUser } from '$lib/server/libsql';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/');

	const runs = await listFleetRunsForUser(locals.user.id, 100).catch((err) => {
		console.error('[archives] listFleetRunsForUser failed:', err);
		return [];
	});

	return {
		runs: runs.map((r) => ({
			id: r.id,
			namespace: r.namespace,
			sessionId: r.sessionId,
			query: r.query,
			synthesisText: r.synthesisText,
			messageCount: r.messageCount,
			completedAt: r.completedAt,
			modelUsage: r.modelUsage
		}))
	};
};
