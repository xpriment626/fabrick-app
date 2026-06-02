/**
 * POST /api/savings/accounts — create (accept) a savings account (§20 Slice 2).
 *
 * Junior: one-click, no allocation. Senior: the user ACCEPTS a previously
 * previewed allocation (from /api/savings/senior/propose) — we persist the
 * config (mandate incl. the accumulated nudges) + the accepted allocation here,
 * and log the accept event. Proposal/persistence only — no execution/signing.
 *
 * Body:
 *   junior → { type: 'junior' }
 *   senior → { type: 'senior', config: SeniorMandate, proposedAllocation: AllocationDecision }
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
	const type = body.type === 'senior' ? 'senior' : body.type === 'junior' ? 'junior' : null;
	if (!type) throw error(400, 'type must be junior or senior');

	if (type === 'junior') {
		const account = await createSavingsAccount({ userId, type: 'junior' });
		await logSavingsEvent({ userId, kind: 'junior_created', accountId: account.id });
		return json({ account });
	}

	// senior — persist the accepted allocation + its mandate
	const config =
		body.config && typeof body.config === 'object'
			? (body.config as Partial<SeniorMandate> & Record<string, unknown>)
			: undefined;
	const proposedAllocation = (body.proposedAllocation ?? null) as AllocationDecision | null;
	if (!proposedAllocation || !Array.isArray(proposedAllocation.weights)) {
		throw error(400, 'senior accept requires a proposedAllocation');
	}

	const account = await createSavingsAccount({ userId, type: 'senior', config, proposedAllocation });
	await logSavingsEvent({
		userId,
		kind: 'senior_accepted',
		accountId: account.id,
		payload: {
			riskPreference: config?.riskPreference,
			nudges: config?.nudges ?? [],
			poolCount: proposedAllocation.weights.length,
			blendedApyPct: proposedAllocation.blendedApyPct
		}
	});
	return json({ account });
};
