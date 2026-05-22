/**
 * Minimal idempotent Turso/libSQL migration runner.
 *
 * Applies every `.sql` file in `migrations/turso/` that hasn't been applied
 * yet, tracked in a `_migrations` table. Statements are split on `;` after
 * stripping `--` comment lines. ADD COLUMN re-runs are tolerated (SQLite has
 * no `IF NOT EXISTS` for columns) so the runner is safe to re-invoke.
 *
 * Run from fabrick-app/ so Bun auto-loads `.env`:
 *   bun run scripts/migrate-turso.ts        (or: npm run migrate:turso)
 */

import { createClient } from '@libsql/client';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
	console.error('[migrate-turso] TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set — aborting.');
	process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', 'turso');
const client = createClient({ url, authToken });

await client.execute(
	`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`
);
const appliedRows = await client.execute('SELECT name FROM _migrations');
const applied = new Set(appliedRows.rows.map((r) => String(r.name)));

const files = readdirSync(migrationsDir)
	.filter((f) => f.endsWith('.sql'))
	.sort();

let appliedCount = 0;
for (const file of files) {
	if (applied.has(file)) {
		console.log(`[migrate-turso] skip ${file} (already applied)`);
		continue;
	}
	const raw = readFileSync(join(migrationsDir, file), 'utf8');
	const cleaned = raw
		.split('\n')
		.filter((l) => !l.trim().startsWith('--'))
		.join('\n');
	const statements = cleaned
		.split(';')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	console.log(`[migrate-turso] applying ${file}:`);
	for (const stmt of statements) {
		console.log(`  > ${stmt.replace(/\s+/g, ' ').slice(0, 140)}`);
		try {
			await client.execute(stmt);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (/duplicate column name/i.test(msg)) {
				console.log('    (column already exists — tolerated)');
				continue;
			}
			throw err;
		}
	}
	await client.execute({
		sql: 'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
		args: [file, Date.now()]
	});
	console.log(`[migrate-turso] done ${file}`);
	appliedCount += 1;
}

console.log(`[migrate-turso] complete (${appliedCount} migration(s) applied)`);
process.exit(0);
