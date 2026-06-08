/**
 * POST /api/savings/accounts — create (accept) a savings account (§20 Slice 2).
 *
 * Simple: one selected conservative pool, no allocation. Advanced: the user ACCEPTS a previously
 * previewed allocation (from /api/savings/senior/propose) — we persist the
 * config (mandate incl. the accumulated nudges) + the accepted allocation here,
 * and log the accept event. Proposal/persistence only — no execution/signing.
 *
 * Body:
 *   simple → { type: 'simple', config: { name, selectedPoolId, poolSnapshot } }
 *   advanced → { type: 'advanced', config: SeniorMandate, proposedAllocation: AllocationDecision }
 * Response: { account: SavingsAccountRecord }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSavingsAccount } from '$lib/server/savings-accounts';
import { logSavingsEvent } from '$lib/server/savings-events';
import type { AllocationDecision, SeniorMandate } from '$lib/savings/types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');
	const userId = locals.user.id;

	let body: { type?: unknown; config?: unknown; proposedAllocation?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'expected JSON body');
	}
	const type =
		body.type === 'advanced' || body.type === 'senior'
			? 'advanced'
			: body.type === 'simple' || body.type === 'junior'
				? 'simple'
				: null;
	if (!type) throw error(400, 'type must be simple or advanced');

	if (type === 'simple') {
		const config =
			body.config && typeof body.config === 'object'
				? (body.config as Record<string, unknown>)
				: {};
		if (typeof config.selectedPoolId !== 'string' || !config.selectedPoolId.trim()) {
			throw error(400, 'simple account requires a selectedPoolId');
		}
		const account = await createSavingsAccount({ userId, type: 'simple', config });
		await logSavingsEvent({
			userId,
			kind: 'junior_created',
			accountId: account.id,
			payload: {
				mode: 'simple',
				name: typeof config.name === 'string' ? config.name : undefined,
				selectedPoolId: config.selectedPoolId
			}
		});
		return json({ account });
	}

	// advanced — persist the accepted allocation + its mandate
	const config =
		body.config && typeof body.config === 'object'
			? (body.config as Partial<SeniorMandate> & Record<string, unknown>)
			: undefined;
	const proposedAllocation = (body.proposedAllocation ?? null) as AllocationDecision | null;
	if (!proposedAllocation || !Array.isArray(proposedAllocation.weights)) {
		throw error(400, 'advanced accept requires a proposedAllocation');
	}

	const account = await createSavingsAccount({ userId, type: 'advanced', config, proposedAllocation });
	await logSavingsEvent({
		userId,
		kind: 'senior_accepted',
		accountId: account.id,
		payload: {
			mode: 'advanced',
			name: config?.name,
			riskPreference: config?.riskPreference,
			nudges: config?.nudges ?? [],
			poolCount: proposedAllocation.weights.length,
			blendedApyPct: proposedAllocation.blendedApyPct
		}
	});
	return json({ account });
};
