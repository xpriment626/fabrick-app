/**
 * POST /api/savings/senior/propose — propose a weighted allocation for an advanced
 * account. PREVIEW ONLY — does NOT persist the account; the user accepts via
 * POST /api/savings/accounts.
 *
 * Reroll = re-calling this with an accumulated `nudges` array. Allocation math
 * and preview narration come from Savings MCP; Fabrick logs the user behavior
 * and persists only after explicit acceptance.
 *
 * Body: { selectedPoolIds: string[], amountUsd: number, riskPreference, nudges? }
 * Response: { allocation: AllocationDecision, mandate: SeniorMandate }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSavingsCatalogue, proposeSavingsAllocation } from '$lib/server/savings-mcp';
import { buildCompositionReport } from '$lib/server/savings-composition-report';
import { tryRunCoralCompositionSession } from '$lib/server/coral-composition-report';
import { logSavingsEvent } from '$lib/server/savings-events';
import type {
	AllocationDecision,
	OpportunityCard,
	RiskPreference,
	SeniorMandate,
	SeniorNudge
} from '$lib/savings/types';

const RISK: RiskPreference[] = ['conservative', 'balanced', 'aggressive'];
const NUDGES: SeniorNudge[] = ['more_conservative', 'more_aggressive', 'fewer_pools'];

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');
	const userId = locals.user.id;

	let body: {
		selectedPoolIds?: unknown;
		amountUsd?: unknown;
		accountName?: unknown;
		previousAllocation?: unknown;
		riskPreference?: unknown;
		nudges?: unknown;
	} = {};
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
	const accountName = typeof body.accountName === 'string' ? body.accountName.trim() : undefined;
	const previousAllocation =
		body.previousAllocation && typeof body.previousAllocation === 'object'
			? (body.previousAllocation as AllocationDecision)
			: null;
	const nudges = (Array.isArray(body.nudges) ? body.nudges : []).filter((n): n is SeniorNudge =>
		NUDGES.includes(n as SeniorNudge)
	);

	if (selectedPoolIds.length < 2) throw error(400, 'select at least 2 pools for an advanced account');
	if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw error(400, 'amountUsd must be positive');

	const cat = await getSavingsCatalogue();
	const all: OpportunityCard[] = [...cat.defaults, ...cat.lend, ...cat.earn];
	const byId = new Map(all.map((c) => [c.id, c]));
	const pools = selectedPoolIds.map((id) => byId.get(id)).filter((c): c is OpportunityCard => Boolean(c));
	if (pools.length < 2) throw error(400, 'selected pools not found in the current catalogue');

	try {
		const allocation = await proposeSavingsAllocation({
			opportunityIds: pools.map((pool) => pool.mcpOpportunityId),
			amountUsd,
			riskPreference,
			nudges
		});
		const mandate: SeniorMandate = {
			selectedPoolIds: pools.map((p) => p.id),
			intendedAmountUsd: amountUsd,
			name: accountName,
			riskPreference,
			nudges
		};
		const coralReport = await tryRunCoralCompositionSession({
			accountName,
			allocation,
			amountUsd,
			pools,
			previousAllocation,
			riskPreference
		});
		const report = buildCompositionReport({
			accountName,
			allocation,
			amountUsd,
			agentOutput: coralReport.output,
			coordination: coralReport.coordination,
			pools,
			previousAllocation,
			riskPreference
		});

		// Behavioral event: first proposal vs a directional reroll.
		await logSavingsEvent({
			userId,
			kind: nudges.length ? 'senior_rerolled' : 'senior_proposed',
			direction: nudges.length ? nudges[nudges.length - 1] : null,
			payload: {
				selectedPoolIds: mandate.selectedPoolIds,
				amountUsd,
				reportId: report.id,
				riskPreference,
				nudges,
				blendedApyPct: allocation.blendedApyPct
			}
		});

		return json({ allocation, mandate, report });
	} catch (err) {
		console.warn('[savings/senior/propose] failed:', err);
		throw error(502, `allocation proposal failed: ${err instanceof Error ? err.message : String(err)}`);
	}
};
