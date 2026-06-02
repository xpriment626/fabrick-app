/**
 * Savings allocator — the deterministic execution library (design.md §18).
 *
 * This is LIBRARY CODE, never an agent: weights are pure math, a function of
 * {pools, riskPreference, nudges}. Same inputs → identical weights. When the
 * reasoning agents graduate to Coral, THIS stays in-process (mechanical
 * execution doesn't belong in a fleet — §18's "agents reason, library executes"
 * rule). Kept separate from the agents/ so that seam is explicit.
 */

import type { AllocationWeight, OpportunityCard, RiskPreference, SeniorNudge } from './contracts';

/** Risk-tier → ordinal (the objective risk axis). conservative safest. */
export const TIER_ORDINAL: Record<string, number> = {
	conservative: 0,
	moderate: 1,
	elevated: 2,
	high: 3
};

/** Base tier-affinity by risk preference: affinity(tier) = base − slope·tier.
 *  conservative/balanced tilt toward low tiers; aggressive (negative slope)
 *  tilts toward high tiers. */
const PREF_AFFINITY: Record<RiskPreference, { base: number; slope: number }> = {
	conservative: { base: 3, slope: 0.8 },
	balanced: { base: 3, slope: 0.4 },
	aggressive: { base: 1.5, slope: -0.5 }
};

/**
 * Deterministic target allocation. Pure: identical (pools, riskPreference,
 * nudges) → identical weights. Weights are affinity-proportional, rounded to
 * 0.1%, sorted by weight desc then poolId (stable order).
 */
export function allocate(
	pools: OpportunityCard[],
	riskPreference: RiskPreference,
	nudges: SeniorNudge[] = []
): AllocationWeight[] {
	const { base, slope } = PREF_AFFINITY[riskPreference];

	let entries = pools.map((p) => {
		const tier = TIER_ORDINAL[p.riskTier] ?? 1;
		let aff = Math.max(0.1, base - slope * tier);
		for (const n of nudges) {
			if (n === 'more_conservative') aff *= Math.max(0.05, 1 - 0.4 * tier);
			else if (n === 'more_aggressive') aff *= 1 + 0.4 * tier;
			else if (n === 'less_sol' && p.asset === 'SOL') aff *= 0.4;
		}
		return { p, aff: Math.max(0.001, aff) };
	});

	// fewer_pools: drop the N lowest-affinity pools (floor at 2)
	const drops = nudges.filter((n) => n === 'fewer_pools').length;
	if (drops > 0 && entries.length - drops >= 2) {
		entries = [...entries].sort((a, b) => b.aff - a.aff).slice(0, entries.length - drops);
	}

	const total = entries.reduce((s, e) => s + e.aff, 0) || 1;
	return entries
		.map((e) => ({ e, w: Math.round((e.aff / total) * 1000) / 10 }))
		.sort((a, b) => b.w - a.w || a.e.p.id.localeCompare(b.e.p.id))
		.map(({ e, w }) => ({
			poolId: e.p.id,
			title: e.p.title,
			product: e.p.product,
			asset: e.p.asset,
			weightPct: w,
			apy: e.p.apy
		}));
}

/** Weight-blended APY (fraction → percent). */
export function blendedApy(weights: AllocationWeight[]): number {
	return Math.round(weights.reduce((s, w) => s + (w.weightPct / 100) * w.apy, 0) * 100 * 100) / 100;
}

/** Objective blended risk = Σ(weightPct·tierOrdinal)/100. Lower = safer. */
export function blendedRisk(weights: AllocationWeight[], pools: OpportunityCard[]): number {
	const tierById = new Map(pools.map((p) => [p.id, TIER_ORDINAL[p.riskTier] ?? 1]));
	return (
		Math.round((weights.reduce((s, w) => s + w.weightPct * (tierById.get(w.poolId) ?? 1), 0) / 100) * 1000) /
		1000
	);
}
