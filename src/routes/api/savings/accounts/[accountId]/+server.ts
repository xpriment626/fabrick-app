/**
 * PATCH /api/savings/accounts/:accountId — update account metadata.
 * DELETE /api/savings/accounts/:accountId — close an account only when no deposit remains.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	closeSavingsAccount,
	getSavingsAccount,
	updateSavingsAccountConfig
} from '$lib/server/savings-accounts';

export const PATCH: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) throw error(401, 'sign in required');
	const userId = locals.user.id;
	const accountId = params.accountId;

	let body: { name?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'expected JSON body');
	}

	const name = typeof body.name === 'string' ? body.name.trim() : '';
	if (!name) throw error(400, 'account name is required');

	const current = await getSavingsAccount(accountId, userId);
	if (!current || current.status === 'archived') throw error(404, 'savings account not found');

	const account = await updateSavingsAccountConfig({
		id: accountId,
		userId,
		config: { ...current.config, name }
	});

	return json({ account });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'sign in required');
	const userId = locals.user.id;
	const accountId = params.accountId;

	try {
		const result = await closeSavingsAccount({ id: accountId, userId });
		if (result.blocked) {
			return json(
				{
					blocked: result.blocked,
					account: result.account
				},
				{ status: 409 }
			);
		}

		return json({ account: result.account });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('not found')) throw error(404, 'savings account not found');
		throw err;
	}
};
