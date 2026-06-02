/**
 * Savings composition contracts (design.md §18) — the typed seams.
 *
 * Every agent ↔ orchestrator boundary is a type here. That's the graduation
 * prerequisite: a future Coral agent that emits `RiskAssessment` (or consumes
 * `AllocationWeight[]`) is a drop-in for the in-process one — the contract
 * doesn't change, only the runtime behind it does.
 */

export type {
	AllocationDecision,
	AllocationWeight,
	OpportunityCard,
	RiskPreference,
	SeniorMandate,
	SeniorNudge
} from '$lib/savings/types';

import type { OpportunityCard, RiskPreference, SeniorNudge } from '$lib/savings/types';

/** Output of the risk-decomposer agent — a concise risk read of the selected
 *  pool set for the saver's mandate. Feeds the strategy-narrator. */
export type RiskAssessment = {
	/** 2–4 sentences: concentration, liquidity/utilization, oracle/counterparty,
	 *  leverage; flag the riskiest sleeve. */
	assessment: string;
};

/** Input to the composition's `proposeSeniorAllocation` orchestrator. */
export type ProposeInput = {
	apiKey: string;
	pools: OpportunityCard[];
	amountUsd: number;
	riskPreference: RiskPreference;
	nudges?: SeniorNudge[];
};
