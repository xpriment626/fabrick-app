/**
 * POST /api/memory/dismiss — soft-dismiss a memory atom (§17 dream inspector).
 *
 * The trust/control half of dream inspection: a user can drop an inference
 * the dream pass made about them. Scoped by user_id, so a stray id can't
 * dismiss another user's atom. Dismissed atoms drop out of the default
 * listings + the working-memory rebuild.
 *
 * Body: { id: string }
 * Response: { dismissed: boolean }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dismissMemoryItem } from '$lib/server/fleet-memory';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');

	let body: { id?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'expected JSON body');
	}

	const id = typeof body.id === 'string' ? body.id.trim() : '';
	if (!id) throw error(400, '`id` must be a non-empty string');

	const dismissed = await dismissMemoryItem(id, locals.user.id);
	return json({ dismissed });
};
