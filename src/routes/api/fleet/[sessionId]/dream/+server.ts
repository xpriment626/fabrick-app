/**
 * POST /api/fleet/[sessionId]/dream
 *
 * Manual (re-)dream over a completed fleet run (design.md §16 Stage 1). Lets
 * the user fire the curator on demand from the run page's dream inspector —
 * "Dream now" for a run that's never been dreamed, "Re-dream" to re-extract.
 *
 * Unlike the archive path (`triggerDreamPass`, fire-and-forget), this awaits
 * `runDreamPass` so the UI can show the result and refresh the inspector. A
 * re-dream RETIRES the run's prior atoms (supersede, not append) — see
 * runDreamPass / supersedeMemoryItemsForRun. The act is logged to dream_runs
 * with schedule='manual' inside runDreamPass.
 *
 * Gate (mirrors .../chat): `getFleetRunBySessionId` is per-user-scoped and only
 * completed runs have an archive row — so a missing row means not-yours or
 * not-done, both 404.
 *
 * Body: none. Response: { topic, atomsWritten, atomsSuperseded,
 *   workingMemoryUpdated, atoms: Atom[] } — `atoms` is the fresh live set so
 *   the client can repaint the inspector without a reload.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFleetRunBySessionId } from '$lib/server/libsql';
import { runDreamPass } from '$lib/server/dream-pass';
import { listMemoryItems } from '$lib/server/fleet-memory';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');

	const sessionId = params.sessionId;
	if (!sessionId) throw error(400, 'session id required');

	// Gate: completed, archived run owned by this user.
	const run = await getFleetRunBySessionId(sessionId, locals.user.id);
	if (!run) throw error(404, `no completed fleet run for session ${sessionId}`);

	let result;
	try {
		result = await runDreamPass(run, { schedule: 'manual' });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.warn(`[fleet/dream] run ${run.id} failed:`, message);
		throw error(502, `dream pass failed: ${message}`);
	}

	// Return the fresh live atom set so the inspector repaints in place.
	const atoms = await listMemoryItems(locals.user.id, {
		sourceRunId: run.id,
		kind: 'dream_item'
	}).catch(() => []);

	return json({
		...result,
		atoms: atoms.map((a) => ({
			id: a.id,
			content: a.content,
			salience: a.salience,
			topicId: a.topicId
		}))
	});
};
