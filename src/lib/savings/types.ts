/**
 * Savings catalogue contract (design.md §20). Client-safe — shared by the
 * server builder (`$lib/server/kamino/catalogue`) and the UI. Lives outside
 * `$lib/server` so Svelte components can import these types freely.
 */

export type SavingsProduct = 'lend' | 'earn' | 'multiply';
export type SavingsAsset = 'SOL' | 'USDC';
export type RiskTier = 'conservative' | 'moderate' | 'elevated' | 'high';

export type OpportunityCard = {
	/** Stable id: `${product}:${reserve|vault|depositReserve}`. */
	id: string;
	product: SavingsProduct;
	asset: SavingsAsset;
	/** Headline, e.g. "USDC", a vault name, or "SOL → USDC". */
	title: string;
	/** Where it lives: market name / "Kamino Earn" / "Multiply". */
	venue: string;
	/** APY as a fraction (0.042 = 4.2%). */
	apy: number;
	tvlUsd: number;
	utilizationPct?: number;
	leverage?: number;
	riskTier: RiskTier;
	/** One-line plain-language risk synthesis. */
	riskSynthesis: string;
	/** True for the two Main Market reserves (the one-click defaults). */
	isDefault: boolean;
	/** Slice 1: only the Main Market defaults can actually be deposited into. */
	depositable: boolean;
	refs: {
		market?: string;
		reserve?: string;
		vault?: string;
		depositReserve?: string;
		borrowReserve?: string;
		assetMint?: string;
	};
};

export type SavingsCatalogue = {
	/** The two Main Market one-click cards (USDC, SOL). */
	defaults: OpportunityCard[];
	/** Rest of the curated LEND surface (excludes defaults). */
	lend: OpportunityCard[];
	earn: OpportunityCard[];
	multiply: OpportunityCard[];
	counts: { defaults: number; lend: number; earn: number; multiply: number; total: number };
	generatedAt: string;
};

// ---------------------------------------------------------------- Senior accounts (Slice 2)

export type SavingsAccountType = 'junior' | 'senior';
export type RiskPreference = 'conservative' | 'balanced' | 'aggressive';

/** Directional steer applied on reroll — the revealed-preference signal. Each
 *  one deterministically shifts the allocation; they accumulate across rerolls. */
export type SeniorNudge = 'more_conservative' | 'more_aggressive' | 'fewer_pools' | 'less_sol';

/** The senior-account config the user submits — the "mandate" the agents reason against. */
export type SeniorMandate = {
	selectedPoolIds: string[];
	intendedAmountUsd: number;
	riskPreference: RiskPreference;
	/** The accumulated reroll steers that produced the accepted allocation. */
	nudges?: SeniorNudge[];
};

export type AllocationWeight = {
	poolId: string;
	title: string;
	product: SavingsProduct;
	asset: SavingsAsset;
	/** Target weight 0–100. Weights across an allocation sum to ~100. */
	weightPct: number;
	/** This pool's APY (fraction) at proposal time, for the blended estimate. */
	apy: number;
};

/** The agent sequence's output — the proposed senior strategy. */
export type AllocationDecision = {
	weights: AllocationWeight[];
	/** Weight-blended expected APY (fraction). */
	blendedApyPct: number;
	/** One-line risk envelope, e.g. "Balanced — 3 blue-chip reserves + 1 managed vault". */
	riskEnvelope: string;
	/** Plain-language rebalancing strategy (triggers + cadence). */
	rebalanceStrategy: string;
	/** Why this allocation, given the mandate. */
	rationale: string;
};

export type SavingsAccountRecord = {
	id: string;
	type: SavingsAccountType;
	status: string;
	config: Partial<SeniorMandate> & Record<string, unknown>;
	proposedAllocation: AllocationDecision | null;
	createdAt: string;
};
