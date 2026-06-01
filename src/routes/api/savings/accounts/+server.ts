/**
 * POST /api/savings/accounts — create a savings account (§20 Slice 2).
 *
 * Junior accounts are created directly here (single-pool one-click — no
 * allocation needed). Senior accounts go through /api/savings/senior/propose
 * (which runs the agent sequence + persists). Proposal/persistence only.
 *
 * Body: { type: 'junior' | 'senior' }   (senior here = empty shell; prefer propose)
 * Response: { account: SavingsAccountRecord }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSavingsAccount } from '$lib/server/savings-accounts';
import type { SavingsAccountType } from '$lib/savings/types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');

	let body: { type?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'expected JSON body');
	}
	const type = body.type === 'senior' ? 'senior' : body.type === 'junior' ? 'junior' : null;
	if (!type) throw error(400, 'type must be junior or senior');

	const account = await createSavingsAccount({ userId: locals.user.id, type: type as SavingsAccountType });
	return json({ account });
};
