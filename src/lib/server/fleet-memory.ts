/**
 * `fleet_memory_items` — the queryable atom store (design.md §15 + §16).
 *
 * One row per extracted fact. The dream pass writes here; UI ("manage my
 * memory") and Stage-1 scoped reads query here. Same shared multi-tenant
 * libSQL DB as the archive — reuses the singleton client from libsql.ts.
 *
 * The discriminator spine (`kind`, `template_id`, `topic_id`,
 * `source_run_id`) is what makes every later dream scope a WHERE clause
 * rather than a migration. v0 dreaming writes `kind: 'dream_item'` atoms;
 * typed kinds (declared by a template's `memory_atoms`) slot in later
 * without a schema change.
 */

import { getLibsqlClient } from '$lib/server/libsql';

/** v0 kinds. Typed-atom kinds (from template `memory_atoms`) extend this. */
export type MemoryItemKind = 'observation' | 'dream_item' | (string & {});

export type FleetMemoryItem = {
	id: string;
	userId: string;
	sourceRunId: string | null;
	kind: MemoryItemKind;
	content: string;
	salience: number | null;
	templateId: string | null;
	topicId: string | null;
	extractedAt: number;
	dismissedAt: number | null;
};

export type MemoryItemInput = {
	userId: string;
	kind: MemoryItemKind;
	content: string;
	sourceRunId?: string | null;
	salience?: number | null;
	templateId?: string | null;
	topicId?: string | null;
};

/**
 * Batch-insert extracted atoms. Returns the inserted rows. Each gets a
 * fresh uuid + `extracted_at = now`. A zero-length input is a no-op.
 */
export async function insertMemoryItems(items: MemoryItemInput[]): Promise<FleetMemoryItem[]> {
	if (items.length === 0) return [];
	const c = getLibsqlClient();
	const now = Date.now();

	const rows: FleetMemoryItem[] = items.map((it) => ({
		id: crypto.randomUUID(),
		userId: it.userId,
		sourceRunId: it.sourceRunId ?? null,
		kind: it.kind,
		content: it.content,
		salience: it.salience ?? null,
		templateId: it.templateId ?? null,
		topicId: it.topicId ?? null,
		extractedAt: now,
		dismissedAt: null
	}));

	await c.batch(
		rows.map((r) => ({
			sql: `INSERT INTO fleet_memory_items
			      (id, user_id, source_run_id, kind, content, salience,
			       template_id, topic_id, extracted_at, dismissed_at)
			      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				r.id,
				r.userId,
				r.sourceRunId,
				r.kind,
				r.content,
				r.salience,
				r.templateId,
				r.topicId,
				r.extractedAt,
				r.dismissedAt
			]
		})),
		'write'
	);

	return rows;
}

export type ListMemoryOpts = {
	/** Filter by atom kind. */
	kind?: MemoryItemKind;
	/** Composition scope (§16): only atoms from runs of this template. */
	templateId?: string;
	/** Topic scope (§16). */
	topicId?: string;
	/** Provenance scope: only atoms extracted from this archive run id.
	 *  Powers the per-run dream inspector (§17 B.5). */
	sourceRunId?: string;
	/** Include dismissed rows (default false — dismissed are hidden). */
	includeDismissed?: boolean;
	limit?: number;
};

/**
 * List a user's atoms, newest first. Every optional filter is an indexed
 * column — this is the read path Stage 1 scoped dreaming + the memory UI
 * both build on. Always scoped by `user_id` (no libSQL RLS).
 */
export async function listMemoryItems(
	userId: string,
	opts: ListMemoryOpts = {}
): Promise<FleetMemoryItem[]> {
	const c = getLibsqlClient();
	const where: string[] = ['user_id = ?'];
	const args: (string | number)[] = [userId];

	if (opts.kind) {
		where.push('kind = ?');
		args.push(opts.kind);
	}
	if (opts.templateId) {
		where.push('template_id = ?');
		args.push(opts.templateId);
	}
	if (opts.topicId) {
		where.push('topic_id = ?');
		args.push(opts.topicId);
	}
	if (opts.sourceRunId) {
		where.push('source_run_id = ?');
		args.push(opts.sourceRunId);
	}
	if (!opts.includeDismissed) {
		where.push('dismissed_at IS NULL');
	}

	const limit = opts.limit ?? 200;
	const res = await c.execute({
		sql: `SELECT id, user_id, source_run_id, kind, content, salience,
		             template_id, topic_id, extracted_at, dismissed_at
		      FROM fleet_memory_items
		      WHERE ${where.join(' AND ')}
		      ORDER BY extracted_at DESC
		      LIMIT ?`,
		args: [...args, limit]
	});

	return res.rows.map(rowToMemoryItem);
}

/**
 * Soft-dismiss an atom (sets `dismissed_at`). Scoped by user_id. Returns
 * true if a row was affected. Dismissed atoms are excluded from the
 * default list + the working-memory rebuild.
 */
export async function dismissMemoryItem(id: string, userId: string): Promise<boolean> {
	const c = getLibsqlClient();
	const res = await c.execute({
		sql: `UPDATE fleet_memory_items SET dismissed_at = ?
		      WHERE id = ? AND user_id = ? AND dismissed_at IS NULL`,
		args: [Date.now(), id, userId]
	});
	return res.rowsAffected > 0;
}

function rowToMemoryItem(row: Record<string, unknown>): FleetMemoryItem {
	return {
		id: row.id as string,
		userId: row.user_id as string,
		sourceRunId: (row.source_run_id as string | null) ?? null,
		kind: row.kind as MemoryItemKind,
		content: row.content as string,
		salience: row.salience != null ? Number(row.salience) : null,
		templateId: (row.template_id as string | null) ?? null,
		topicId: (row.topic_id as string | null) ?? null,
		extractedAt: Number(row.extracted_at),
		dismissedAt: row.dismissed_at != null ? Number(row.dismissed_at) : null
	};
}
