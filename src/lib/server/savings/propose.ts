/**
 * Senior-allocation orchestrator (design.md §18) — wires the composition.
 *
 *   allocate (deterministic library)
 *     → risk-decomposer (LLM, cached per pool-set)
 *     → strategy-narrator (LLM)
 *     → AllocationDecision
 *
 * The risk read depends only on the POOL SET + risk preference, not the
 * weights — so it's cached and a reroll (same pools, different nudge) skips it,
 * keeping reroll a single fast LLM call (the narrator).
 *
 * This orchestrator IS the swappable seam: the endpoint calls
 * `proposeSeniorAllocation(input)`; a Coral graduation re-implements this
 * behind the same signature (gateway-triggered run) without touching callers.
 */

import { allocate, blendedApy } from './allocator';
import { buildSavingsModel } from './model';
import { assessRisk } from './agents/risk-decomposer';
import { narrateStrategy } from './agents/strategy-narrator';
import type { AllocationDecision, ProposeInput, RiskAssessment } from './contracts';

const RISK_TTL_MS = 5 * 60 * 1000;
const riskCache = new Map<string, { value: RiskAssessment; at: number }>();

function riskKey(input: ProposeInput): string {
	return `${input.riskPreference}|${input.pools.map((p) => p.id).sort().join(',')}`;
}

export async function proposeSeniorAllocation(input: ProposeInput): Promise<AllocationDecision> {
	const nudges = input.nudges ?? [];
	const weights = allocate(input.pools, input.riskPreference, nudges); // deterministic — never the LLM
	const model = buildSavingsModel(input.apiKey);

	// risk-decomposer — cached per (pools, riskPreference); a reroll reuses it.
	const key = riskKey(input);
	const cached = riskCache.get(key);
	const now = Date.now();
	let risk: RiskAssessment;
	if (cached && now - cached.at < RISK_TTL_MS) {
		risk = cached.value;
	} else {
		risk = await assessRisk({
			model,
			pools: input.pools,
			amountUsd: input.amountUsd,
			riskPreference: input.riskPreference
		});
		riskCache.set(key, { value: risk, at: now });
	}

	// strategy-narrator — prose over the fixed allocation + risk read.
	const narration = await narrateStrategy({
		model,
		weights,
		amountUsd: input.amountUsd,
		riskPreference: input.riskPreference,
		nudges,
		risk
	});

	return {
		weights,
		blendedApyPct: blendedApy(weights),
		riskEnvelope: narration.riskEnvelope?.trim() || 'Balanced multi-pool allocation',
		rebalanceStrategy:
			narration.rebalanceStrategy?.trim() ||
			'Rebalance when a pool drifts >5% from target or its risk tier degrades; reviewed on the daily catalogue refresh.',
		rationale:
			narration.rationale?.trim() ||
			'Diversified across the selected pools to match the chosen risk preference.'
	};
}
