/**
 * `dream_runs` — the dream-act log (design.md §16 Stage 1).
 *
 * Stage 0 dreaming left no record of the *act* of dreaming, only its outputs
 * (atoms in fleet_memory_items, the synthesis blob in Mastra). This module
 * records one row per dream invocation — on-completion OR manual re-dream —
 * so we can answer "when was this run last dreamed", show a per-run re-dream
 * timeline, and (later) power the §16 "inspect dreams over time" activity log
 * + Stage 2 scheduling (a recurring cycle is just rows here on a timer).
 *
 * Shares the multi-tenant libSQL client; every read is `user_id`-scoped.
 * The (scope, schedule, intent) triple is stored as plain columns (§16 axes)
 * so future scopes are a query, not a migration.
 */

import { getLibsqlClient } from '$lib/server/libsql';

export type DreamScope = 'run' | 'topic' | 'composition' | 'global';
export type DreamSchedule = 'on-completion' | 'manual' | 'recurring';
export type DreamIntent = 'extract' | 'refresh';
export type DreamStatus = 'ok' | 'error';

export type DreamRunLog = {
	id: string;
	userId: string;
	sourceRunId: string | null;
	scope: DreamScope;
	schedule: DreamSchedule;
	intent: DreamIntent;
	status: DreamStatus;
	topic: string | null;
	atomsWritten: number;
	atomsSuperseded: number;
	workingMemoryUpdated: boolean;
	error: string | null;
	durationMs: number | null;
	createdAt: number;
};

export type DreamRunLogInput = {
	userId: string;
	sourceRunId?: string | null;
	scope?: DreamScope;
	schedule?: DreamSchedule;
	intent?: DreamIntent;
	status: DreamStatus;
	topic?: string | null;
	atomsWritten?: number;
	atomsSuperseded?: number;
	workingMemoryUpdated?: boolean;
	error?: string | null;
	durationMs?: number | null;
};

/**
 * Record a single dream act. Best-effort: callers in the dream path wrap this
 * so a logging failure never masks the dream result itself.
 */
export async function logDreamRun(input: DreamRunLogInput): Promise<DreamRunLog> {
	const c = getLibsqlClient();
	const row: DreamRunLog = {
		id: crypto.randomUUID(),
		userId: input.userId,
		sourceRunId: input.sourceRunId ?? null,
		scope: input.scope ?? 'run',
		schedule: input.schedule ?? 'on-completion',
		intent: input.intent ?? 'extract',
		status: input.status,
		topic: input.topic ?? null,
		atomsWritten: input.atomsWritten ?? 0,
		atomsSuperseded: input.atomsSuperseded ?? 0,
		workingMemoryUpdated: input.workingMemoryUpdated ?? false,
		error: input.error ?? null,
		durationMs: input.durationMs ?? null,
		createdAt: Date.now()
	};

	await c.execute({
		sql: `INSERT INTO dream_runs
		      (id, user_id, source_run_id, scope, schedule, intent, status, topic,
		       atoms_written, atoms_superseded, working_memory_updated, error,
		       duration_ms, created_at)
		      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			row.id,
			row.userId,
			row.sourceRunId,
			row.scope,
			row.schedule,
			row.intent,
			row.status,
			row.topic,
			row.atomsWritten,
			row.atomsSuperseded,
			row.workingMemoryUpdated ? 1 : 0,
			row.error,
			row.durationMs,
			row.createdAt
		]
	});

	return row;
}

export type ListDreamRunsOpts = {
	/** Only dreams over this archive run id (the per-run timeline). */
	sourceRunId?: string;
	limit?: number;
};

/**
 * List a user's dream acts, newest first. Backs the §16 activity log + the
 * per-run re-dream timeline (pass `sourceRunId`). Always `user_id`-scoped.
 */
export async function listDreamRuns(
	userId: string,
	opts: ListDreamRunsOpts = {}
): Promise<DreamRunLog[]> {
	const c = getLibsqlClient();
	const where: string[] = ['user_id = ?'];
	const args: (string | number)[] = [userId];

	if (opts.sourceRunId) {
		where.push('source_run_id = ?');
		args.push(opts.sourceRunId);
	}

	const limit = opts.limit ?? 100;
	const res = await c.execute({
		sql: `SELECT id, user_id, source_run_id, scope, schedule, intent, status,
		             topic, atoms_written, atoms_superseded, working_memory_updated,
		             error, duration_ms, created_at
		      FROM dream_runs
		      WHERE ${where.join(' AND ')}
		      ORDER BY created_at DESC
		      LIMIT ?`,
		args: [...args, limit]
	});

	return res.rows.map(rowToDreamRun);
}

/**
 * The most recent dream act over a given run, or null if it has never been
 * dreamed. Powers the "Last dreamed …" label + "Dream now / Re-dream" toggle.
 */
export async function getLatestDreamRunForRun(
	userId: string,
	sourceRunId: string
): Promise<DreamRunLog | null> {
	const runs = await listDreamRuns(userId, { sourceRunId, limit: 1 });
	return runs[0] ?? null;
}

function rowToDreamRun(row: Record<string, unknown>): DreamRunLog {
	return {
		id: row.id as string,
		userId: row.user_id as string,
		sourceRunId: (row.source_run_id as string | null) ?? null,
		scope: row.scope as DreamScope,
		schedule: row.schedule as DreamSchedule,
		intent: row.intent as DreamIntent,
		status: row.status as DreamStatus,
		topic: (row.topic as string | null) ?? null,
		atomsWritten: Number(row.atoms_written),
		atomsSuperseded: Number(row.atoms_superseded),
		workingMemoryUpdated: Number(row.working_memory_updated) === 1,
		error: (row.error as string | null) ?? null,
		durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
		createdAt: Number(row.created_at)
	};
}
