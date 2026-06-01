/**
 * POST /api/savings/senior/propose — run the agent sequence to propose a
 * weighted allocation for a senior account, then persist the account (§20 Slice 2).
 *
 * Proposal-only + fund-independent: no deposit execution, no signing, no broadcast.
 *
 * Body: { selectedPoolIds: string[], amountUsd: number, riskPreference }
 * Response: { account: SavingsAccountRecord }  (type 'senior', with proposedAllocation)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSavingsCatalogue } from '$lib/server/kamino/catalogue';
import { proposeSeniorAllocation } from '$lib/server/savings-propose';
import { createSavingsAccount } from '$lib/server/savings-accounts';
import { resolveOpenrouterKey } from '$lib/server/chat-model';
import type { OpportunityCard, RiskPreference } from '$lib/savings/types';

const RISK: RiskPreference[] = ['conservative', 'balanced', 'aggressive'];

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');
	const userId = locals.user.id;

	let body: { selectedPoolIds?: unknown; amountUsd?: unknown; riskPreference?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'expected JSON body');
	}

	const selectedPoolIds = Array.isArray(body.selectedPoolIds)
		? body.selectedPoolIds.filter((x): x is string => typeof x === 'string')
		: [];
	const amountUsd = Number(body.amountUsd);
	const riskPreference = RISK.includes(body.riskPreference as RiskPreference)
		? (body.riskPreference as RiskPreference)
		: 'balanced';

	if (selectedPoolIds.length < 2) throw error(400, 'select at least 2 pools for a senior account');
	if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw error(400, 'amountUsd must be positive');

	// Resolve the selected pools from the catalogue.
	const cat = await getSavingsCatalogue();
	const all: OpportunityCard[] = [...cat.defaults, ...cat.lend, ...cat.earn, ...cat.multiply];
	const byId = new Map(all.map((c) => [c.id, c]));
	const pools = selectedPoolIds.map((id) => byId.get(id)).filter((c): c is OpportunityCard => Boolean(c));
	if (pools.length < 2) throw error(400, 'selected pools not found in the current catalogue');

	const apiKey = await resolveOpenrouterKey(userId);

	try {
		const allocation = await proposeSeniorAllocation({
			apiKey,
			pools,
			amountUsd,
			riskPreference
		});
		const account = await createSavingsAccount({
			userId,
			type: 'senior',
			config: { selectedPoolIds: pools.map((p) => p.id), intendedAmountUsd: amountUsd, riskPreference },
			proposedAllocation: allocation
		});
		return json({ account });
	} catch (err) {
		console.warn('[savings/senior/propose] failed:', err);
		throw error(502, `allocation proposal failed: ${err instanceof Error ? err.message : String(err)}`);
	}
};
