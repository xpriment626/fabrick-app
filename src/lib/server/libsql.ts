/**
 * libSQL (Turso) client for the fleet-run archive layer.
 *
 * Singleton client keyed on TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
 * Env vars are read via `$env/dynamic/private` so the type-checker
 * doesn't fail when they haven't been added yet — a runtime check
 * throws clearly on the first archive operation.
 *
 * Architecture note: this is the "Supabase = conversation, Turso =
 * memory" split. Supabase keeps `users`, `user_settings`, etc. Turso
 * holds the durable archive of completed fleet runs. Both DBs are
 * scoped by `user_id` (Privy DID) on every row; libSQL doesn't have
 * Postgres-style RLS so the server-side queries always include
 * `user_id = ?` to enforce isolation.
 */

import { createClient, type Client } from '@libsql/client';
import { env as privateEnv } from '$env/dynamic/private';

let client: Client | null = null;

/**
 * Shared libSQL client singleton. Exported so peer modules (fleet-memory,
 * dream-pass) reuse the same connection rather than opening their own.
 * Mastra's working memory uses a separate `LibSQLStore` against the same
 * DB url — that's fine, libSQL allows concurrent clients.
 */
export function getLibsqlClient(): Client {
	if (client) return client;

	const url = privateEnv.TURSO_DATABASE_URL;
	const authToken = privateEnv.TURSO_AUTH_TOKEN;

	if (!url) {
		throw new Error(
			'TURSO_DATABASE_URL is not set — add it to .env (see .env.example for the expected shape).'
		);
	}
	if (!authToken) {
		throw new Error('TURSO_AUTH_TOKEN is not set — add it to .env.');
	}

	client = createClient({ url, authToken });
	return client;
}

export type ArchivedFleetRun = {
	id: string;
	userId: string;
	namespace: string;
	sessionId: string;
	query: string;
	synthesisText: string | null;
	traceJson: string;
	messageCount: number;
	createdAt: number;
	completedAt: number;
	/** Per-agent LLM token usage (parsed from the model_usage JSON column).
	 *  Null for runs archived before cost telemetry, or non-chat dev runs. */
	modelUsage: unknown | null;
	/** §16 discriminator spine. */
	templateId: string;
	topicId: string | null;
	artifactId: string;
	version: number;
	supersedes: string | null;
};

export type ArchiveInput = {
	userId: string;
	namespace: string;
	sessionId: string;
	query: string;
	synthesisText: string | null;
	traceJson: string;
	messageCount: number;
	createdAt: number;
	/** Cost telemetry object (gateway's buildModelUsage output) or null. */
	modelUsage?: unknown;
	/** Composition/mode the run executed (FleetMode id). Defaults to 'research'
	 *  — the only mode that has ever shipped. The §16 linchpin: persisting this
	 *  is what lets the Fleet Archives tabs + composition-scoped dreaming work. */
	templateId?: string;
};

/**
 * Insert a fleet-run archive row. Idempotent on `session_id` — if a
 * row already exists for the same Coral session, the existing row is
 * returned unchanged. This lets the client-side trigger fire
 * fire-and-forget without worrying about duplicate dispatches.
 */
export async function archiveFleetRun(
	input: ArchiveInput
): Promise<{ row: ArchivedFleetRun; inserted: boolean }> {
	const c = getLibsqlClient();
	const id = crypto.randomUUID();
	const completedAt = Date.now();

	// SQLite INSERT OR IGNORE preserves an existing row; the SELECT
	// after always returns whichever row currently owns the session_id.
	// New runs are their own artifact v1 (artifact_id = id); a refresh
	// dream (§16 Stage 3) would later write a v2 row sharing artifact_id.
	const insertRes = await c.execute({
		sql: `INSERT OR IGNORE INTO fleet_runs_archive
		      (id, user_id, namespace, session_id, query, synthesis_text,
		       trace_json, message_count, created_at, completed_at, model_usage,
		       template_id, topic_id, artifact_id, version, supersedes)
		      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			id,
			input.userId,
			input.namespace,
			input.sessionId,
			input.query,
			input.synthesisText,
			input.traceJson,
			input.messageCount,
			input.createdAt,
			completedAt,
			input.modelUsage != null ? JSON.stringify(input.modelUsage) : null,
			input.templateId ?? 'research',
			null, // topic_id — backfilled by the dream pass once it derives a topic
			id, // artifact_id — self; this run is artifact v1
			1, // version
			null // supersedes
		]
	});

	const row = await getFleetRunBySessionId(input.sessionId, input.userId);
	if (!row) throw new Error(`archiveFleetRun: row not found after insert for ${input.sessionId}`);
	// `inserted` distinguishes a fresh archive from an idempotent re-archive
	// (browser + gateway race): the dream pass should fire only on the former.
	return { row, inserted: insertRes.rowsAffected > 0 };
}

/**
 * Fetch a single fleet-run archive by Coral session id. `userId`
 * is required and enforced — protects against one user resolving
 * another user's archive via the URL.
 */
export async function getFleetRunBySessionId(
	sessionId: string,
	userId: string
): Promise<ArchivedFleetRun | null> {
	const c = getLibsqlClient();
	const res = await c.execute({
		sql: `SELECT id, user_id, namespace, session_id, query, synthesis_text,
		             trace_json, message_count, created_at, completed_at, model_usage,
		             template_id, topic_id, artifact_id, version, supersedes
		      FROM fleet_runs_archive
		      WHERE session_id = ? AND user_id = ?
		      LIMIT 1`,
		args: [sessionId, userId]
	});

	const r = res.rows[0];
	if (!r) return null;
	return rowToArchivedFleetRun(r);
}

/**
 * List a user's archived fleet runs, newest first. Used by a future
 * `/research` index page. Bounded by `limit` (default 50) to keep
 * payloads small until pagination lands.
 */
export async function listFleetRunsForUser(
	userId: string,
	limit = 50
): Promise<ArchivedFleetRun[]> {
	const c = getLibsqlClient();
	const res = await c.execute({
		sql: `SELECT id, user_id, namespace, session_id, query, synthesis_text,
		             trace_json, message_count, created_at, completed_at, model_usage,
		             template_id, topic_id, artifact_id, version, supersedes
		      FROM fleet_runs_archive
		      WHERE user_id = ?
		      ORDER BY completed_at DESC
		      LIMIT ?`,
		args: [userId, limit]
	});

	return res.rows.map(rowToArchivedFleetRun);
}

function rowToArchivedFleetRun(row: Record<string, unknown>): ArchivedFleetRun {
	return {
		id: row.id as string,
		userId: row.user_id as string,
		namespace: row.namespace as string,
		sessionId: row.session_id as string,
		query: row.query as string,
		synthesisText: (row.synthesis_text as string | null) ?? null,
		traceJson: row.trace_json as string,
		messageCount: Number(row.message_count),
		createdAt: Number(row.created_at),
		completedAt: Number(row.completed_at),
		modelUsage: parseModelUsage(row.model_usage),
		templateId: (row.template_id as string | null) ?? 'research',
		topicId: (row.topic_id as string | null) ?? null,
		artifactId: (row.artifact_id as string | null) ?? (row.id as string),
		version: row.version != null ? Number(row.version) : 1,
		supersedes: (row.supersedes as string | null) ?? null
	};
}

/**
 * Backfill the topic label on an archive row. Called by the dream pass once
 * it derives a topic for the run (§16: cheap LLM-derived label in v0). Scoped
 * by user_id so a stray call can't relabel another user's run.
 */
export async function setFleetRunTopic(
	runId: string,
	userId: string,
	topicId: string
): Promise<void> {
	const c = getLibsqlClient();
	await c.execute({
		sql: `UPDATE fleet_runs_archive SET topic_id = ? WHERE id = ? AND user_id = ?`,
		args: [topicId, runId, userId]
	});
}

function parseModelUsage(raw: unknown): unknown | null {
	if (typeof raw !== 'string' || raw.length === 0) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
