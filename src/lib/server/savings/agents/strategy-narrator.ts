/**
 * Strategy-narrator agent (design.md §18) — narrates the (already-computed,
 * deterministic) allocation: risk envelope, rebalancing strategy, rationale.
 *
 * It NEVER picks weights — those come from the allocator library. Given the
 * fixed allocation + the risk-decomposer's read, it writes the prose. This is
 * why "reroll" is a steer not a reseed: the model explains; it doesn't gamble.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import type { SavingsModel } from '../model';
import type { AllocationWeight, RiskAssessment, RiskPreference, SeniorNudge } from '../contracts';

const SCHEMA = z.object({
	riskEnvelope: z.string().describe('one line, e.g. "Balanced — 2 blue-chip reserves + 1 managed vault"'),
	rebalanceStrategy: z.string().describe('plain-language rebalancing triggers + cadence'),
	rationale: z.string().describe('2-3 sentences on why this allocation fits the mandate')
});

export type Narration = z.infer<typeof SCHEMA>;

export async function narrateStrategy(args: {
	model: SavingsModel;
	weights: AllocationWeight[];
	amountUsd: number;
	riskPreference: RiskPreference;
	nudges: SeniorNudge[];
	risk: RiskAssessment;
}): Promise<Narration> {
	const allocBrief = args.weights
		.map((w) => `- ${w.title} (${w.product}/${w.asset}, ${(w.apy * 100).toFixed(2)}% APY): ${w.weightPct}%`)
		.join('\n');
	const nudgeNote = args.nudges.length
		? `\nThe saver steered this proposal: ${args.nudges.join(', ')}. Reflect that in the rationale.`
		: '';

	const { object } = await generateObject({
		model: args.model,
		schema: SCHEMA,
		system:
			'You are a portfolio strategist for an automated Solana savings product. You are given a FIXED target allocation that has already been computed, plus a risk assessment of the pools. Explain the allocation — do NOT propose different weights. Be concise, quantitative, no preamble.',
		prompt: `Mandate: a ${args.riskPreference} saver depositing $${args.amountUsd.toLocaleString()} (USDC/SOL only).${nudgeNote}\n\nRisk assessment:\n${args.risk.assessment}\n\nFixed target allocation:\n${allocBrief}\n\nWrite the riskEnvelope (one line), rebalanceStrategy (triggers + cadence), and rationale (2-3 sentences) for THIS allocation.`
	});

	return object;
}
