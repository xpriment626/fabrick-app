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
