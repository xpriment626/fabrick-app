/**
 * Risk-decomposer agent (design.md §18) — assesses the selected pools' risk for
 * the saver's mandate. The first of the savings composition's two reasoning
 * agents; its `RiskAssessment` feeds the strategy-narrator.
 *
 * In-process today (one structured LLM call). At graduation this is the agent
 * that fans out into per-product analysts (lend/earn/multiply) — distinct
 * knowledge domains, the gap-of-context handoff Coral is for. Its contract
 * (`RiskAssessment`) stays the same; only the runtime behind it changes.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import type { SavingsModel } from '../model';
import type { OpportunityCard, RiskAssessment, RiskPreference } from '../contracts';

const SCHEMA = z.object({
	assessment: z
		.string()
		.describe('2-4 sentences assessing the pool set: concentration, liquidity/utilization, oracle/counterparty, leverage; flag the riskiest sleeve')
});

function brief(p: OpportunityCard): string {
	const apy = p.apy > 0 ? `${(p.apy * 100).toFixed(2)}% APY` : 'leverage (variable)';
	const util = p.utilizationPct != null ? `, ${p.utilizationPct.toFixed(0)}% util` : '';
	return `- ${p.title} (${p.product}/${p.asset}) | ${apy} | tier=${p.riskTier} | TVL $${Math.round(p.tvlUsd).toLocaleString()}${util}`;
}

export async function assessRisk(args: {
	model: SavingsModel;
	pools: OpportunityCard[];
	amountUsd: number;
	riskPreference: RiskPreference;
}): Promise<RiskAssessment> {
	const poolBrief = args.pools.map(brief).join('\n');
	const mandate = `a ${args.riskPreference} saver depositing $${args.amountUsd.toLocaleString()} (USDC/SOL only)`;

	const { object } = await generateObject({
		model: args.model,
		schema: SCHEMA,
		system:
			'You are a DeFi risk analyst for a Solana savings product. Be concise and quantitative. Assess concentration, liquidity/utilization, oracle/counterparty, and leverage risk across the candidate pools. No preamble.',
		prompt: `Assess the risk of this pool set for ${mandate}. Flag the riskiest sleeve. Pools:\n${poolBrief}`
	});

	return { assessment: object.assessment.trim() };
}
