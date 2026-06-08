/**
 * Savings catalogue contract. Client-safe — shared by the Savings MCP adapter
 * and the UI. Lives outside `$lib/server` so Svelte components can import these
 * types freely.
 */

export type SavingsProduct = 'lend' | 'earn';
export type SavingsAsset = 'USDC';
export type RiskTier = 'conservative' | 'moderate' | 'elevated' | 'high';
export type IntegrationStatus =
	| 'market_data_only'
	| 'tx_blueprint_known'
	| 'simulation_supported'
	| 'execution_supported';

export type OpportunityCard = {
	/** Stable Savings MCP opportunity id. */
	id: string;
	mcpOpportunityId: string;
	product: SavingsProduct;
	asset: SavingsAsset;
	/** Headline, e.g. "USDC Main Market" or a vault name. */
	title: string;
	/** Where it lives: venue/protocol display label. */
	venue: string;
	/** APY as a fraction (0.042 = 4.2%). */
	apy: number;
	tvlUsd: number;
	utilizationPct?: number;
	leverage?: number;
	riskTier: RiskTier;
	/** One-line plain-language risk synthesis. */
	riskSynthesis: string;
	/** True for primary one-click cards. */
	isDefault: boolean;
	/** True only when Fabrick has an app-side USDC deposit path for this opportunity. */
	depositable: boolean;
	integrationStatus: IntegrationStatus;
	limitations: string[];
	availableFollowups: string[];
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
	/** Primary one-click USDC cards. */
	defaults: OpportunityCard[];
	/** Rest of the curated lending surface (excludes defaults). */
	lend: OpportunityCard[];
	earn: OpportunityCard[];
	counts: { defaults: number; lend: number; earn: number; total: number };
	generatedAt: string;
};

// ---------------------------------------------------------------- Savings accounts

export type SavingsAccountType = 'simple' | 'advanced';
export type RiskPreference = 'conservative' | 'balanced' | 'aggressive';

/** Directional steer applied on reroll — the revealed-preference signal. Each
 *  one deterministically shifts the allocation; they accumulate across rerolls. */
export type SeniorNudge = 'more_conservative' | 'more_aggressive' | 'fewer_pools';

/** The advanced-account config the user submits — the "mandate" the agents reason against. */
export type SeniorMandate = {
	selectedPoolIds: string[];
	intendedAmountUsd: number;
	riskPreference: RiskPreference;
	name?: string;
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

/** The agent sequence's output — the proposed advanced strategy. */
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
