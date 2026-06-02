/**
 * Savings-account composition — public API (design.md §18).
 *
 * The extraction-ready boundary, mirroring `compositions/deep-research/index.ts`:
 * everything the rest of the app touches goes through here. A future Coral
 * graduation re-implements `proposeSeniorAllocation` behind this same contract
 * (a gateway-triggered fleet run instead of in-process calls) and nothing else
 * changes.
 *
 * Shape:
 *   - allocator (deterministic library — `allocate`, `blendedRisk`/`Apy`): stays
 *     in-process forever, never an agent.
 *   - agents (reasoning, graduate to Coral): `risk-decomposer`, `strategy-narrator`.
 *   - `proposeSeniorAllocation`: the orchestrator / swappable seam.
 */

import { proposeSeniorAllocation } from './propose';

export { proposeSeniorAllocation } from './propose';
export { allocate, blendedApy, blendedRisk, TIER_ORDINAL } from './allocator';
export type { ProposeInput, RiskAssessment } from './contracts';

export const savingsComposition = {
	id: 'savings-account',
	/** Deterministic execution library (not an agent). */
	library: ['allocator'] as const,
	/** Reasoning agents — what graduates to Coral; the allocator never does. */
	agents: ['risk-decomposer', 'strategy-narrator'] as const,
	/** The swappable orchestrator entry point. */
	propose: proposeSeniorAllocation
} as const;
