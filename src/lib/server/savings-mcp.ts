import type {
	AllocationDecision,
	IntegrationStatus,
	OpportunityCard,
	RiskTier,
	SavingsCatalogue,
	SavingsProduct
} from '../savings/types';

const DEFAULT_SAVINGS_MCP_URL = 'http://127.0.0.1:8788/mcp';
const CANONICAL_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

type McpProductType = 'lending_reserve' | 'vault';

type McpOpportunity = {
	id: string;
	venue: string;
	protocol: string;
	product_type: McpProductType;
	title: string;
	asset: { symbol: 'USDC'; mint: string; principal: 'canonical_solana_usdc' };
	apy: { current: number; source: string; window: string };
	tvl: { usd: number };
	liquidity: { utilizationPct: number | null; withdrawalBufferPct: number | null };
	risk: { tier: RiskTier; score: number; factors: string[]; synthesis: string };
	capabilities: {
		marketData: boolean;
		riskData: boolean;
		depositTxKnown: boolean;
		simulationSupported: boolean;
		executionSupported: boolean;
	};
	integrationStatus: IntegrationStatus;
	limitations: string[];
	refs: {
		market?: string;
		reserve?: string;
		vault?: string;
		assetMint?: string;
	};
	display?: {
		displayTitle?: string;
		headlineApyPct?: number;
		riskBadge?: string;
		liquidityBadge?: string;
		status?: string;
		primaryWarnings?: string[];
		availableFollowups?: string[];
	};
	generated_at?: string;
};

type McpCataloguePayload = {
	generated_at?: string;
	opportunities?: McpOpportunity[];
};

type McpAllocationPayload = {
	allocation?: {
		weights?: Array<{
			opportunityId: string;
			title: string;
			venue: string;
			productType: McpProductType;
			riskTier: RiskTier;
			weightPct: number;
			apy: number;
		}>;
		blendedApyPct?: number;
		blendedRiskScore?: number;
		riskEnvelope?: string;
		rebalanceStrategy?: string;
		rationale?: string;
	};
};

type JsonRpcResponse<T> = {
	jsonrpc: '2.0';
	id: string | number | null;
	result?: {
		content?: Array<{ type: string; text?: string }>;
		structuredContent?: T;
	};
	error?: { code: number; message: string };
};

function savingsMcpUrl(): string {
	return process.env.SAVINGS_MCP_URL?.trim() || DEFAULT_SAVINGS_MCP_URL;
}

async function callSavingsMcpTool<T>(
	name: string,
	toolArguments: Record<string, unknown>
): Promise<T> {
	const response = await fetch(savingsMcpUrl(), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: `${name}-${Date.now()}`,
			method: 'tools/call',
			params: { name, arguments: toolArguments }
		}),
		signal: AbortSignal.timeout(20_000)
	});
	if (!response.ok) throw new Error(`Savings MCP ${name} returned HTTP ${response.status}`);

	const body = (await response.json()) as JsonRpcResponse<T>;
	if (body.error) throw new Error(`Savings MCP ${name}: ${body.error.message}`);
	if (!body.result?.structuredContent) {
		throw new Error(`Savings MCP ${name} returned no structuredContent`);
	}
	return body.result.structuredContent;
}

function productFromMcp(productType: McpProductType): SavingsProduct {
	return productType === 'lending_reserve' ? 'lend' : 'earn';
}

function isFabrickDepositable(opportunity: McpOpportunity): boolean {
	return (
		opportunity.asset.symbol === 'USDC' &&
		opportunity.asset.mint === CANONICAL_USDC_MINT &&
		opportunity.protocol === 'kamino' &&
		opportunity.product_type === 'lending_reserve' &&
		opportunity.capabilities.depositTxKnown &&
		Boolean(opportunity.refs.market && opportunity.refs.reserve)
	);
}

function mapOpportunity(opportunity: McpOpportunity): OpportunityCard {
	const product = productFromMcp(opportunity.product_type);
	const depositable = isFabrickDepositable(opportunity);
	return {
		id: opportunity.id,
		mcpOpportunityId: opportunity.id,
		product,
		asset: 'USDC',
		title: opportunity.display?.displayTitle ?? opportunity.title,
		venue: opportunity.venue,
		apy: Number(opportunity.apy.current) || 0,
		tvlUsd: Number(opportunity.tvl.usd) || 0,
		utilizationPct: opportunity.liquidity.utilizationPct ?? undefined,
		riskTier: opportunity.risk.tier,
		riskSynthesis: opportunity.risk.synthesis,
		isDefault: false,
		depositable,
		integrationStatus: opportunity.integrationStatus,
		limitations: opportunity.limitations ?? [],
		availableFollowups: opportunity.display?.availableFollowups ?? [],
		refs: {
			market: opportunity.refs.market,
			reserve: opportunity.refs.reserve,
			vault: opportunity.refs.vault,
			assetMint: opportunity.refs.assetMint
		}
	};
}

function preferredDefaultCards(cards: OpportunityCard[]): OpportunityCard[] {
	const sorted = [...cards].sort((a, b) => {
		if (a.depositable !== b.depositable) return a.depositable ? -1 : 1;
		const riskOrder: Record<RiskTier, number> = {
			conservative: 0,
			moderate: 1,
			elevated: 2,
			high: 3
		};
		return riskOrder[a.riskTier] - riskOrder[b.riskTier] || b.tvlUsd - a.tvlUsd;
	});
	return sorted.filter((card) => card.depositable).slice(0, 2);
}

export function mapMcpCatalogueToSavingsCatalogue(payload: McpCataloguePayload): SavingsCatalogue {
	const cards = (payload.opportunities ?? [])
		.filter(
			(opportunity) =>
				opportunity.asset?.symbol === 'USDC' && opportunity.asset?.mint === CANONICAL_USDC_MINT
		)
		.map(mapOpportunity);
	const defaultIds = new Set(preferredDefaultCards(cards).map((card) => card.id));
	const withDefaults = cards.map((card) => ({ ...card, isDefault: defaultIds.has(card.id) }));
	const defaults = withDefaults.filter((card) => card.isDefault);
	const rest = withDefaults.filter((card) => !card.isDefault);
	const lend = rest.filter((card) => card.product === 'lend');
	const earn = rest.filter((card) => card.product === 'earn');

	return {
		defaults,
		lend,
		earn,
		counts: {
			defaults: defaults.length,
			lend: lend.length,
			earn: earn.length,
			total: defaults.length + lend.length + earn.length
		},
		generatedAt: payload.generated_at ?? new Date().toISOString()
	};
}

export function mapMcpAllocationToDecision(payload: McpAllocationPayload): AllocationDecision {
	const allocation = payload.allocation;
	if (!allocation?.weights?.length) throw new Error('Savings MCP allocation returned no weights');

	return {
		weights: allocation.weights.map((weight) => ({
			poolId: weight.opportunityId,
			title: weight.title,
			product: productFromMcp(weight.productType),
			asset: 'USDC',
			weightPct: weight.weightPct,
			apy: weight.apy
		})),
		blendedApyPct: allocation.blendedApyPct ?? 0,
		riskEnvelope: allocation.riskEnvelope ?? 'USDC savings allocation',
		rebalanceStrategy:
			allocation.rebalanceStrategy ??
			'Review on catalogue refresh; rebalance only after user approval or a policy-scoped automation.',
		rationale: allocation.rationale ?? 'Deterministic allocation from Savings MCP.'
	};
}

export async function getSavingsCatalogue(force = false): Promise<SavingsCatalogue> {
	const payload = await callSavingsMcpTool<McpCataloguePayload>('get_usdc_opportunities', {
		minTvlUsd: 1_000_000,
		refresh: force
	});
	return mapMcpCatalogueToSavingsCatalogue(payload);
}

export async function proposeSavingsAllocation(input: {
	opportunityIds: string[];
	amountUsd: number;
	riskPreference: 'conservative' | 'balanced' | 'aggressive';
	nudges?: Array<'more_conservative' | 'more_aggressive' | 'fewer_pools'>;
	refresh?: boolean;
}): Promise<AllocationDecision> {
	const payload = await callSavingsMcpTool<McpAllocationPayload>('propose_allocation', {
		opportunityIds: input.opportunityIds,
		amountUsd: input.amountUsd,
		riskPreference: input.riskPreference,
		nudges: input.nudges ?? [],
		refresh: input.refresh
	});
	return mapMcpAllocationToDecision(payload);
}
