/**
 * Mastra resource-scoped working memory (design.md §15).
 *
 * One markdown blob per user (resourceId = Privy DID), atomic replacement,
 * read at the start of every chat turn / fleet run, written by the dream
 * pass. Shared multi-tenant libSQL DB (spike-verified: resource scope
 * isolates tenants + survives instance teardown — see
 * scripts/spike-mastra-memory.ts).
 *
 * Mastra needs a thread to exist before read/write even though the data is
 * resource-scoped, so we lazily `saveThread` a single stable synthetic
 * thread per user (`wm:<userId>`). The thread is just a handle; the blob
 * lives at resource scope and is shared across all of the user's real
 * threads.
 */

import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { env as privateEnv } from '$env/dynamic/private';

/** The seed template Mastra returns before anything is written. We treat
 *  it (and empty) as "no memory yet" on read. */
const EMPTY_TEMPLATE = '# Fabrick memory\n\n<!-- empty -->';

let memo: Memory | null = null;

function getMemory(): Memory {
	if (memo) return memo;

	const url = privateEnv.TURSO_DATABASE_URL;
	const authToken = privateEnv.TURSO_AUTH_TOKEN;
	if (!url) throw new Error('TURSO_DATABASE_URL is not set — working memory unavailable.');
	if (!authToken) throw new Error('TURSO_AUTH_TOKEN is not set — working memory unavailable.');

	memo = new Memory({
		storage: new LibSQLStore({ id: 'fabrick-memory', url, authToken }),
		options: {
			workingMemory: {
				enabled: true,
				scope: 'resource',
				template: EMPTY_TEMPLATE
			}
		}
	});
	return memo;
}

/** Stable per-user thread handle for working-memory ops. */
function wmThreadId(userId: string): string {
	return `wm:${userId}`;
}

async function ensureThread(memory: Memory, userId: string): Promise<string> {
	const threadId = wmThreadId(userId);
	const now = new Date();
	await memory.saveThread({
		thread: {
			id: threadId,
			resourceId: userId,
			title: 'working-memory',
			createdAt: now,
			updatedAt: now,
			metadata: {}
		}
	});
	return threadId;
}

/**
 * Read a user's working-memory synthesis. Returns null when nothing has
 * been written yet (the dream pass hasn't run) — callers degrade
 * gracefully by simply not prepending memory context.
 */
export async function readWorkingMemory(userId: string): Promise<string | null> {
	const memory = getMemory();
	const threadId = await ensureThread(memory, userId);
	const wm = await memory.getWorkingMemory({ threadId, resourceId: userId });
	if (!wm) return null;
	const trimmed = wm.trim();
	if (trimmed === '' || trimmed === EMPTY_TEMPLATE.trim()) return null;
	return wm;
}

/**
 * Replace a user's working-memory synthesis (atomic). The dream pass calls
 * this after distilling new archive rows.
 */
export async function writeWorkingMemory(userId: string, markdown: string): Promise<void> {
	const memory = getMemory();
	const threadId = await ensureThread(memory, userId);
	await memory.updateWorkingMemory({ threadId, resourceId: userId, workingMemory: markdown });
}
