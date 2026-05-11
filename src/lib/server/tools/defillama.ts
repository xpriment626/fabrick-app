/**
 * DefiLlama-backed tools — multichain by design, no Solana fence.
 *
 * All endpoints called here are on DefiLlama's free `https://api.llama.fi`
 * surface (no key required). The pro-only API key is only relevant for
 * rate-limit bypass + specialty data (treasuries, ETFs, hacks, unlocks),
 * none of which we expose.
 *
 * Docs: https://api-docs.defillama.com/
 */

import { z } from 'zod';

const TVL_BASE = 'https://api.llama.fi';
const YIELDS_BASE = 'https://yields.llama.fi';
const COINS_BASE = 'https://coins.llama.fi';

async function fetchJson<T>(url: string, hint: string): Promise<T> {
	const res = await fetch(url, { headers: { accept: 'application/json' } });
	if (!res.ok) {
		throw new Error(`${hint} ${res.status}: ${await res.text()}`);
	}
	return (await res.json()) as T;
}

/* ---- defillama_get_protocols ----------------------------------------- */

export const defillamaGetProtocolsInput = z
	.object({
		chain: z
			.string()
			.optional()
			.describe('Filter to protocols active on this chain (e.g. "Solana", "Ethereum")'),
		category: z
			.string()
			.optional()
			.describe('Filter by category (e.g. "Lending", "DEX", "Liquid Staking")'),
		minTvlUsd: z
			.number()
			.nonnegative()
			.optional()
			.describe('Drop protocols with TVL below this threshold'),
		limit: z.number().int().min(1).max(100).default(20),
		sortBy: z
			.enum(['tvl', 'change1d', 'change7d'])
			.default('tvl')
			.describe('Ranking metric')
	})
	.describe('Inputs for defillama_get_protocols');

export type DefillamaGetProtocolsInput = z.infer<typeof defillamaGetProtocolsInput>;

export const defillamaGetProtocolsOutput = z.object({
	protocols: z.array(
		z.object({
			name: z.string(),
			slug: z.string(),
			category: z.string(),
			chains: z.array(z.string()),
			tvlUsd: z.number(),
			change1dPct: z.number(),
			change7dPct: z.number()
		})
	)
});

type RawProtocol = {
	name: string;
	slug: string;
	category?: string;
	chains?: string[];
	tvl?: number;
	chainTvls?: Record<string, number>;
	change_1d?: number;
	change_7d?: number;
};

export async function defillamaGetProtocols(input: DefillamaGetProtocolsInput) {
	const all = await fetchJson<RawProtocol[]>(`${TVL_BASE}/protocols`, 'defillama /protocols');

	const filtered = all.filter((p) => {
		if (input.chain && !(p.chains ?? []).includes(input.chain)) return false;
		if (input.category && (p.category ?? '') !== input.category) return false;
		return true;
	});

	const mapped = filtered.map((p) => {
		const tvlUsd = input.chain
			? (p.chainTvls?.[input.chain] ?? 0)
			: (p.tvl ?? 0);
		return {
			name: p.name,
			slug: p.slug,
			category: p.category ?? 'Other',
			chains: p.chains ?? [],
			tvlUsd,
			change1dPct: p.change_1d ?? 0,
			change7dPct: p.change_7d ?? 0
		};
	});

	const minTvl = input.minTvlUsd ?? 0;
	const survivors = mapped.filter((p) => p.tvlUsd >= minTvl);

	const sortKey = input.sortBy;
	survivors.sort((a, b) => {
		if (sortKey === 'change1d') return b.change1dPct - a.change1dPct;
		if (sortKey === 'change7d') return b.change7dPct - a.change7dPct;
		return b.tvlUsd - a.tvlUsd;
	});

	return { protocols: survivors.slice(0, input.limit) };
}

/* ---- defillama_get_protocol_tvl -------------------------------------- */

export const defillamaGetProtocolTvlInput = z
	.object({
		slug: z
			.string()
			.min(1)
			.max(128)
			.describe('Protocol slug from DefiLlama (e.g. "aave", "kamino-lend")')
	})
	.describe('Inputs for defillama_get_protocol_tvl');

export type DefillamaGetProtocolTvlInput = z.infer<typeof defillamaGetProtocolTvlInput>;

export const defillamaGetProtocolTvlOutput = z.object({
	slug: z.string(),
	tvlUsd: z.number()
});

export async function defillamaGetProtocolTvl(input: DefillamaGetProtocolTvlInput) {
	const tvl = await fetchJson<number>(
		`${TVL_BASE}/tvl/${encodeURIComponent(input.slug)}`,
		`defillama /tvl/${input.slug}`
	);
	return { slug: input.slug, tvlUsd: tvl };
}

/* ---- defillama_get_yield_pools --------------------------------------- */

export const defillamaGetYieldPoolsInput = z
	.object({
		chain: z.string().optional().describe('Filter to pools on this chain'),
		project: z
			.string()
			.optional()
			.describe('Filter by project slug (e.g. "aave-v3", "kamino-lend")'),
		symbol: z
			.string()
			.optional()
			.describe('Filter by deposit symbol (e.g. "USDC", "SOL")'),
		minTvlUsd: z.number().nonnegative().optional(),
		minApy: z.number().optional().describe('Filter to pools with APY at least this %'),
		limit: z.number().int().min(1).max(50).default(15),
		sortBy: z
			.enum(['apy', 'tvl', 'apyMean30d'])
			.default('tvl')
			.describe('Ranking metric')
	})
	.describe('Inputs for defillama_get_yield_pools');

export type DefillamaGetYieldPoolsInput = z.infer<typeof defillamaGetYieldPoolsInput>;

export const defillamaGetYieldPoolsOutput = z.object({
	pools: z.array(
		z.object({
			pool: z.string(),
			project: z.string(),
			chain: z.string(),
			symbol: z.string(),
			tvlUsd: z.number(),
			apy: z.number(),
			apyMean30d: z.number().nullable(),
			ilRisk: z.string().nullable(),
			stablecoin: z.boolean()
		})
	)
});

type RawYieldPool = {
	pool: string;
	project: string;
	chain: string;
	symbol: string;
	tvlUsd: number;
	apy: number | null;
	apyMean30d?: number | null;
	ilRisk?: string | null;
	stablecoin?: boolean;
};

export async function defillamaGetYieldPools(input: DefillamaGetYieldPoolsInput) {
	const wrapper = await fetchJson<{ status: string; data: RawYieldPool[] }>(
		`${YIELDS_BASE}/pools`,
		'defillama /pools'
	);

	const all = wrapper.data ?? [];
	const filtered = all.filter((p) => {
		if (input.chain && p.chain !== input.chain) return false;
		if (input.project && p.project !== input.project) return false;
		if (input.symbol && p.symbol.toLowerCase() !== input.symbol.toLowerCase()) return false;
		if (input.minTvlUsd != null && p.tvlUsd < input.minTvlUsd) return false;
		if (input.minApy != null && (p.apy ?? 0) < input.minApy) return false;
		return true;
	});

	const sortKey = input.sortBy;
	filtered.sort((a, b) => {
		if (sortKey === 'apy') return (b.apy ?? 0) - (a.apy ?? 0);
		if (sortKey === 'apyMean30d') return (b.apyMean30d ?? 0) - (a.apyMean30d ?? 0);
		return b.tvlUsd - a.tvlUsd;
	});

	return {
		pools: filtered.slice(0, input.limit).map((p) => ({
			pool: p.pool,
			project: p.project,
			chain: p.chain,
			symbol: p.symbol,
			tvlUsd: p.tvlUsd,
			apy: p.apy ?? 0,
			apyMean30d: p.apyMean30d ?? null,
			ilRisk: p.ilRisk ?? null,
			stablecoin: p.stablecoin ?? false
		}))
	};
}

/* ---- defillama_get_dex_volume ---------------------------------------- */

export const defillamaGetDexVolumeInput = z
	.object({
		chain: z
			.string()
			.optional()
			.describe('Restrict to this chain (e.g. "Solana", "ethereum"). Omit for all chains aggregated.'),
		limit: z.number().int().min(1).max(50).default(10)
	})
	.describe('Inputs for defillama_get_dex_volume');

export type DefillamaGetDexVolumeInput = z.infer<typeof defillamaGetDexVolumeInput>;

export const defillamaGetDexVolumeOutput = z.object({
	chain: z.string().nullable(),
	totalVolume24h: z.number(),
	totalVolume7d: z.number(),
	dexes: z.array(
		z.object({
			name: z.string(),
			dailyVolume: z.number(),
			weeklyVolume: z.number(),
			change1d: z.number().nullable()
		})
	)
});

type RawDexOverview = {
	total24h?: number;
	total7d?: number;
	protocols?: Array<{
		name: string;
		total24h?: number;
		total7d?: number;
		change_1d?: number | null;
	}>;
};

export async function defillamaGetDexVolume(input: DefillamaGetDexVolumeInput) {
	const path = input.chain
		? `/overview/dexs/${encodeURIComponent(input.chain.toLowerCase())}`
		: '/overview/dexs';
	const raw = await fetchJson<RawDexOverview>(`${TVL_BASE}${path}`, `defillama ${path}`);

	const protocols = (raw.protocols ?? [])
		.map((p) => ({
			name: p.name,
			dailyVolume: p.total24h ?? 0,
			weeklyVolume: p.total7d ?? 0,
			change1d: p.change_1d ?? null
		}))
		.sort((a, b) => b.dailyVolume - a.dailyVolume)
		.slice(0, input.limit);

	return {
		chain: input.chain ?? null,
		totalVolume24h: raw.total24h ?? 0,
		totalVolume7d: raw.total7d ?? 0,
		dexes: protocols
	};
}

/* ---- defillama_get_coin_prices --------------------------------------- */

export const defillamaGetCoinPricesInput = z
	.object({
		coins: z
			.array(z.string().min(3).max(128))
			.min(1)
			.max(50)
			.describe(
				'Coin identifiers in DefiLlama format: "<chain>:<address>" for tokens, "coingecko:<id>" for CoinGecko IDs (e.g. "ethereum:0x...", "coingecko:bitcoin", "solana:So111...")'
			)
	})
	.describe('Inputs for defillama_get_coin_prices');

export type DefillamaGetCoinPricesInput = z.infer<typeof defillamaGetCoinPricesInput>;

export const defillamaGetCoinPricesOutput = z.object({
	prices: z.record(
		z.string(),
		z.object({
			price: z.number(),
			symbol: z.string().optional(),
			decimals: z.number().optional(),
			timestamp: z.number().optional(),
			confidence: z.number().optional()
		})
	)
});

type RawCoinPricesResponse = {
	coins: Record<
		string,
		{
			price: number;
			symbol?: string;
			decimals?: number;
			timestamp?: number;
			confidence?: number;
		}
	>;
};

export async function defillamaGetCoinPrices(input: DefillamaGetCoinPricesInput) {
	const ids = input.coins.map((c) => encodeURIComponent(c)).join(',');
	const raw = await fetchJson<RawCoinPricesResponse>(
		`${COINS_BASE}/prices/current/${ids}`,
		`defillama /prices/current`
	);
	return { prices: raw.coins ?? {} };
}

