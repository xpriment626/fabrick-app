/**
 * Fleet — the control panel for a user's fleet runs (design.md §17).
 *
 * Reads the durable Turso archive (per-user scoped). Each row carries the
 * query, synthesis, message count, cost telemetry, and the §16 composition
 * spine. Cards are grouped into composition tabs; run-anchored follow-up
 * chats are badged via per-run counts. Failed/in-progress runs aren't here —
 * this surface is completed runs.
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listFleetRunsForUser } from '$lib/server/libsql';
import { getFleetRunFollowupCounts } from '$lib/server/db/chats';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/');

	const runs = await listFleetRunsForUser(locals.user.id, 100).catch((err) => {
		console.error('[fleet] listFleetRunsForUser failed:', err);
		return [];
	});

	// Per-run follow-up counts (§17) — badge cards that have an anchored chat.
	const followups = await getFleetRunFollowupCounts(locals.user.id).catch((err) => {
		console.error('[fleet] getFleetRunFollowupCounts failed:', err);
		return {} as Record<string, number>;
	});

	const mapped = runs.map((r) => ({
		id: r.id,
		namespace: r.namespace,
		sessionId: r.sessionId,
		query: r.query,
		synthesisText: r.synthesisText,
		messageCount: r.messageCount,
		completedAt: r.completedAt,
		modelUsage: r.modelUsage,
		templateId: r.templateId,
		topicId: r.topicId,
		followupCount: followups[r.sessionId] ?? 0
	}));

	// Compositions present, each with its run count — drives the tabs (§16).
	// Data-driven so new modes appear automatically once they ship.
	const counts = new Map<string, number>();
	for (const r of mapped) counts.set(r.templateId, (counts.get(r.templateId) ?? 0) + 1);
	const compositions = [...counts.entries()]
		.map(([id, count]) => ({ id, count }))
		.sort((a, b) => b.count - a.count);

	return { runs: mapped, compositions };
};
