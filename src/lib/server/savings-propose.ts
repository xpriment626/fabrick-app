/**
 * Senior-account allocation proposer (design.md §20, Slice 2) — the brain.
 *
 * A two-step LLM agent sequence over OpenRouter (the §18 observer+risk →
 * planner shape), proposal-only and fund-independent:
 *   1. risk-decomposer (generateText) — assess each selected pool's risk for
 *      this saver's mandate.
 *   2. strategy-planner (generateObject) — propose target weights + a
 *      rebalancing strategy + rationale, reasoning over step 1.
 *
 * The LLM proposes *weights + qualitative reasoning*; the arithmetic (weight
 * normalization, blended APY) is computed deterministically here — never trust
 * the model for the numbers. No execution, no signing, no broadcast.
 */

import { generateObject, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import type {
	AllocationDecision,
	AllocationWeight,
	OpportunityCard,
	RiskPreference
} from '$lib/savings/types';

/**
 * Fast, non-reasoning model for the proposal sequence. The chat default
 * (deepseek-v4-pro) is a reasoning model — too slow for a responsive
 * "generation experience" here, and less reliable for structured output
 * (generateObject) via OpenRouter. gpt-5.4-mini is fast + solid at JSON.
 */
const PROPOSE_MODEL_ID = 'openai/gpt-5.4-mini';

function model(apiKey: string) {
	return createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey }).chat(PROPOSE_MODEL_ID);
}

function brief(pool: OpportunityCard): string {
	const apy = pool.apy > 0 ? `${(pool.apy * 100).toFixed(2)}% APY` : 'leverage (variable)';
	const util = pool.utilizationPct != null ? `, ${pool.utilizationPct.toFixed(0)}% util` : '';
	return `- id=${pool.id} | ${pool.title} (${pool.product}/${pool.asset}) | ${apy} | tier=${pool.riskTier} | TVL $${Math.round(pool.tvlUsd).toLocaleString()}${util} | ${pool.riskSynthesis}`;
}

const PLAN_SCHEMA = z.object({
	weights: z
		.array(
			z.object({
				poolId: z.string().describe('must be one of the provided pool ids'),
				weightPct: z.number().describe('0-100; weights across all pools should sum to ~100')
			})
		)
		.describe('target allocation weights across the selected pools'),
	riskEnvelope: z.string().describe('one line, e.g. "Balanced — 2 blue-chip reserves + 1 managed vault"'),
	rebalanceStrategy: z.string().describe('plain-language rebalancing triggers + cadence'),
	rationale: z.string().describe('2-3 sentences on why this allocation fits the mandate')
});

export async function proposeSeniorAllocation(args: {
	apiKey: string;
	pools: OpportunityCard[];
	amountUsd: number;
	riskPreference: RiskPreference;
}): Promise<AllocationDecision> {
	const m = model(args.apiKey);
	const poolBrief = args.pools.map(brief).join('\n');
	const mandate = `a ${args.riskPreference} saver depositing $${args.amountUsd.toLocaleString()} (USDC/SOL only)`;

	// Step 1 — risk-decomposer
	const risk = await generateText({
		model: m,
		system:
			'You are a DeFi risk analyst for a Solana savings product. Be concise and quantitative. Assess concentration, liquidity/utilization, oracle/counterparty, and leverage risk. No preamble.',
		prompt: `Assess the risk of each candidate pool for ${mandate}. One or two sentences per pool, flag the riskiest. Pools:\n${poolBrief}`
	});

	// Step 2 — strategy-planner (structured)
	const planned = await generateObject({
		model: m,
		schema: PLAN_SCHEMA,
		system:
			'You are a portfolio strategist for an automated savings product. Propose a weighted allocation that matches the saver risk preference: conservative favors deepest-liquidity blue-chip lend reserves and underweights elevated/high-risk pools; aggressive tolerates more yield-seeking weight. Use ONLY the provided pool ids. Weights are 0-100 and should sum to ~100.',
		prompt: `Mandate: ${mandate}.\n\nRisk assessment:\n${risk.text}\n\nCandidate pools:\n${poolBrief}\n\nPropose target weights + a rebalancing strategy + a short rationale.`
	});

	return finalize(planned.object, args.pools);
}

/** Validate against the real pools, normalize weights to 100, compute blended APY. */
function finalize(
	raw: z.infer<typeof PLAN_SCHEMA>,
	pools: OpportunityCard[]
): AllocationDecision {
	const byId = new Map(pools.map((p) => [p.id, p]));
	// keep only weights pointing at real selected pools, positive weight
	const valid = raw.weights.filter((w) => byId.has(w.poolId) && w.weightPct > 0);
	const total = valid.reduce((s, w) => s + w.weightPct, 0);

	// normalize to 100; if the model returned nothing usable, fall back to equal-weight
	const normalized: AllocationWeight[] =
		total > 0
			? valid.map((w) => {
					const p = byId.get(w.poolId)!;
					return {
						poolId: w.poolId,
						title: p.title,
						product: p.product,
						asset: p.asset,
						weightPct: Math.round((w.weightPct / total) * 1000) / 10,
						apy: p.apy
					};
				})
			: pools.map((p) => ({
					poolId: p.id,
					title: p.title,
					product: p.product,
					asset: p.asset,
					weightPct: Math.round((100 / pools.length) * 10) / 10,
					apy: p.apy
				}));

	const blendedApyPct =
		normalized.reduce((s, w) => s + (w.weightPct / 100) * w.apy, 0) * 100;

	return {
		weights: normalized,
		blendedApyPct: Math.round(blendedApyPct * 100) / 100,
		riskEnvelope: raw.riskEnvelope?.trim() || 'Balanced multi-pool allocation',
		rebalanceStrategy:
			raw.rebalanceStrategy?.trim() ||
			'Rebalance when a pool drifts >5% from target or its risk tier degrades; reviewed on the daily catalogue refresh.',
		rationale: raw.rationale?.trim() || 'Diversified across the selected pools to match the chosen risk preference.'
	};
}
