/**
 * Kamino savings catalogue (design.md §20, Slice 1).
 *
 * Builds the fund-independent opportunity catalogue for the savings product:
 * SOL + USDC opportunities across Kamino's product surface, curated + risk-rated,
 * served to anyone (no funds, no auth required). Read-only against Kamino mainnet
 * REST (api.kamino.finance, no key). No signer, no SDK, zero money risk.
 *
 * Pre-curation (design §20): deposits are only ever SOL (native token) or USDC
 * (compliant stablecoin) — strict canonical-mint match. Two layers of gate:
 *   • asset gate — SOL/USDC mints only
 *   • venue gate — eligibility thresholds below (drops dust + test/junk vaults)
 *
 * Three product shapes, three risk models for the SAME two assets:
 *   • LEND     — supply into a Klend reserve. The two Main Market reserves are
 *                the one-click DEFAULTS (deepest liquidity); the rest are browsable.
 *   • EARN     — auto-allocating vaults (curator-managed); junk-filtered by AUM.
 *   • MULTIPLY — leveraged loops with SOL/USDC as collateral (advanced; high risk).
 *
 * Slice 1: only the two Main Market LEND reserves are `depositable`. Everything
 * else is catalogue-only (browsable card, deposit path not wired yet).
 */

import type {
	OpportunityCard,
	RiskTier,
	SavingsAsset,
	SavingsCatalogue
} from '../../savings/types';

export type { OpportunityCard, SavingsCatalogue, SavingsAsset, RiskTier } from '../../savings/types';

const BASE = 'https://api.kamino.finance';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TARGETS: Record<string, SavingsAsset> = { [SOL_MINT]: 'SOL', [USDC_MINT]: 'USDC' };

/** Eligibility thresholds (the venue gate). */
const LEND_MIN_TVL_USD = 1_000_000;
const EARN_MIN_AUM_USD = 50_000;
const MULTIPLY_MIN_TVL_USD = 50_000;
const SANE_APY_MAX = 0.5; // drop broken vaults (e.g. the 236,877% one) + obvious noise

// ---------------------------------------------------------------- http

async function getJson<T>(path: string, timeoutMs = 10_000): Promise<T | null> {
	try {
		const res = await fetch(`${BASE}${path}`, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		// timeout / network / parse — skip this source rather than block the build
		return null;
	}
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let i = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (i < items.length) {
			const idx = i++;
			out[idx] = await fn(items[idx]);
		}
	});
	await Promise.all(workers);
	return out;
}

// ---------------------------------------------------------------- risk model

function lendTier(isMain: boolean, tvlUsd: number, utilPct: number): RiskTier {
	if (isMain) return 'conservative';
	let tier: RiskTier = tvlUsd >= 20_000_000 ? 'moderate' : tvlUsd >= 5_000_000 ? 'elevated' : 'high';
	if (utilPct > 96 && tier === 'moderate') tier = 'elevated'; // withdrawal-liquidity risk
	return tier;
}

function fmtUsd(n: number): string {
	if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
	return `$${Math.round(n)}`;
}
const fmtPct = (frac: number) => `${(frac * 100).toFixed(2)}%`;

// ---------------------------------------------------------------- raw shapes

type Market = { name: string; lendingMarket: string; isPrimary: boolean };
type ReserveMetric = {
	reserve: string;
	liquidityToken: string;
	liquidityTokenMint: string;
	supplyApy: string;
	totalSupplyUsd: string;
	totalBorrowUsd: string;
};
type LeverageMetric = {
	depositReserve: string;
	borrowReserve: string;
	avgLeverage: string;
	totalDepositedUsd: string;
};
type VaultState = { tokenMint?: string; tokenMintDecimals?: number; name?: string; prevAum?: string };
type Vault = { address: string; state?: VaultState };
type VaultMetrics = { apy30d: string; apy: string; tokensInvestedUsd: string; tokensAvailableUsd: string };
type OraclePrice = { mint: string; price: string };

// ---------------------------------------------------------------- builders

async function buildLendAndMultiply(markets: Market[]): Promise<{
	defaults: OpportunityCard[];
	lend: OpportunityCard[];
	multiply: OpportunityCard[];
}> {
	const defaults: OpportunityCard[] = [];
	const lend: OpportunityCard[] = [];
	const multiply: OpportunityCard[] = [];

	// Only the Main Market's reserve map is needed (to resolve leverage pairs).
	let mainMarket: Market | null = null;
	const mainReserveMap = new Map<string, { asset?: SavingsAsset; symbol: string }>();

	// Pass 1 — LEND across all markets (the ~14 SOL/USDC reserves >$1M TVL).
	await mapLimit(markets, 8, async (m) => {
		const reserves = (await getJson<ReserveMetric[]>(`/kamino-market/${m.lendingMarket}/reserves/metrics`)) ?? [];
		const isMain = m.isPrimary || /^main market$/i.test(m.name);
		if (isMain) mainMarket = m;

		for (const r of reserves) {
			if (isMain) mainReserveMap.set(r.reserve, { asset: TARGETS[r.liquidityTokenMint], symbol: r.liquidityToken });
			const asset = TARGETS[r.liquidityTokenMint];
			if (!asset) continue;
			const tvlUsd = Number(r.totalSupplyUsd) || 0;
			if (tvlUsd < LEND_MIN_TVL_USD) continue;
			const borrow = Number(r.totalBorrowUsd) || 0;
			const utilPct = tvlUsd > 0 ? (borrow / tvlUsd) * 100 : 0;
			const apy = Number(r.supplyApy) || 0;
			const isDefault = isMain;
			const card: OpportunityCard = {
				id: `lend:${r.reserve}`,
				product: 'lend',
				asset,
				title: asset,
				venue: m.name,
				apy,
				tvlUsd,
				utilizationPct: utilPct,
				riskTier: lendTier(isMain, tvlUsd, utilPct),
				riskSynthesis: isMain
					? `Blue-chip ${asset} lending on Kamino's deepest market — ${fmtUsd(tvlUsd)} supplied, ${utilPct.toFixed(0)}% utilized. Yield from borrower demand; withdrawals draw on the ~${Math.max(0, 100 - utilPct).toFixed(0)}% idle buffer.`
					: `${asset} supply in ${m.name} — ${fmtUsd(tvlUsd)} TVL, ${utilPct.toFixed(0)}% utilized.${utilPct > 96 ? ' High utilization: withdrawals may queue until borrows repay.' : ''} Isolated market — higher yield, thinner backing than Main.`,
				isDefault,
				depositable: isDefault, // Slice 1: only Main Market reserves are wired
				refs: { market: m.lendingMarket, reserve: r.reserve, assetMint: r.liquidityTokenMint }
			};
			(isDefault ? defaults : lend).push(card);
		}
	});

	// Pass 2 — MULTIPLY: real activity concentrates in Main Market (per the scan).
	// Fetched separately (NOT racing the fan-out) with a generous timeout so this
	// single important call doesn't transiently drop under concurrent load.
	if (mainMarket) {
		const mm: Market = mainMarket;
		const levs = (await getJson<LeverageMetric[]>(`/kamino-market/${mm.lendingMarket}/leverage/metrics`, 20_000)) ?? [];
		for (const l of levs) {
			const dep = mainReserveMap.get(l.depositReserve);
			const asset = dep?.asset;
			if (!asset) continue; // only SOL/USDC collateral
			const tvlUsd = Number(l.totalDepositedUsd) || 0;
			if (tvlUsd < MULTIPLY_MIN_TVL_USD) continue;
			const borrowSym = mainReserveMap.get(l.borrowReserve)?.symbol ?? `${l.borrowReserve.slice(0, 4)}…`;
			const lev = Number(l.avgLeverage) || 0;
			multiply.push({
				// include running index — multiple distinct leverage configs can share
				// the same deposit/borrow reserve pair (different elevation groups).
				id: `multiply:${l.depositReserve}:${l.borrowReserve}:${multiply.length}`,
				product: 'multiply',
				asset,
				title: `${asset} → ${borrowSym}`,
				venue: mm.name,
				apy: 0, // leverage APY is position-dependent; not a flat supply rate
				tvlUsd,
				leverage: lev,
				riskTier: 'high',
				riskSynthesis: `Leveraged ${asset}→${borrowSym} loop (~${lev.toFixed(2)}x). Amplified yield with liquidation risk — an advanced position, not a simple save.`,
				isDefault: false,
				depositable: false,
				refs: { market: mm.lendingMarket, depositReserve: l.depositReserve, borrowReserve: l.borrowReserve }
			});
		}
	}

	// Order defaults USDC-first (stable), lend + multiply by TVL desc
	defaults.sort((a, b) => (a.asset === 'USDC' ? -1 : 1));
	lend.sort((a, b) => b.tvlUsd - a.tvlUsd);
	multiply.sort((a, b) => b.tvlUsd - a.tvlUsd);
	return { defaults, lend, multiply };
}

async function buildEarn(): Promise<OpportunityCard[]> {
	const [vaults, prices] = await Promise.all([
		getJson<Vault[]>('/kvaults/vaults'),
		getJson<OraclePrice[]>('/oracles/prices')
	]);
	if (!vaults) return [];
	const solPrice = Number(prices?.find((p) => p.mint === SOL_MINT)?.price) || 0;
	const priceFor = (mint: string) => (mint === USDC_MINT ? 1 : mint === SOL_MINT ? solPrice : 0);

	// Pre-filter by AUM from the vault LIST (state.prevAum) — no per-vault call yet.
	const candidates = vaults
		.filter((v) => v.state?.tokenMint && TARGETS[v.state.tokenMint])
		.map((v) => {
			const dec = v.state!.tokenMintDecimals ?? (v.state!.tokenMint === USDC_MINT ? 6 : 9);
			const aumTokens = Number(v.state!.prevAum ?? 0) / 10 ** dec;
			const aumUsd = aumTokens * priceFor(v.state!.tokenMint!);
			return { v, asset: TARGETS[v.state!.tokenMint!], aumUsd };
		})
		.filter((c) => c.aumUsd >= EARN_MIN_AUM_USD);

	// Fetch metrics only for the survivors (for live APY).
	const cards = await mapLimit(candidates, 8, async ({ v, asset, aumUsd }) => {
		const mt = await getJson<VaultMetrics>(`/kvaults/vaults/${v.address}/metrics`);
		if (!mt) return null;
		const apy = Number(mt.apy30d) || Number(mt.apy) || 0;
		if (apy <= 0 || apy > SANE_APY_MAX) return null; // drop dead + broken-APY vaults
		// Prefer live invested+available USD if present; fall back to prevAum estimate.
		const liveAum = (Number(mt.tokensInvestedUsd) || 0) + (Number(mt.tokensAvailableUsd) || 0);
		const tvlUsd = liveAum >= EARN_MIN_AUM_USD ? liveAum : aumUsd;
		const name = v.state?.name?.trim() || 'Kamino vault';
		return {
			id: `earn:${v.address}`,
			product: 'earn',
			asset,
			title: name,
			venue: 'Kamino Earn',
			apy,
			tvlUsd,
			riskTier: tvlUsd >= 1_000_000 ? 'moderate' : 'elevated',
			riskSynthesis: `Auto-allocating ${asset} vault (${name}) spreading across Kamino reserves — ${fmtUsd(tvlUsd)} AUM, ${fmtPct(apy)} 30d APY. Managed strategy; risk follows its underlying allocations + curator.`,
			isDefault: false,
			depositable: false,
			refs: { vault: v.address, assetMint: v.state!.tokenMint }
		} as OpportunityCard;
	});

	return cards.filter((c): c is OpportunityCard => c !== null).sort((a, b) => b.tvlUsd - a.tvlUsd);
}

// ---------------------------------------------------------------- entry + cache

async function build(generatedAt: string): Promise<SavingsCatalogue> {
	const markets = (await getJson<Market[]>('/v2/kamino-market')) ?? [];
	const [{ defaults, lend, multiply }, earn] = await Promise.all([
		buildLendAndMultiply(markets),
		buildEarn()
	]);
	return {
		defaults,
		lend,
		earn,
		multiply,
		counts: {
			defaults: defaults.length,
			lend: lend.length,
			earn: earn.length,
			multiply: multiply.length,
			total: defaults.length + lend.length + earn.length + multiply.length
		},
		generatedAt
	};
}

// In-memory cache — the "daily refresh" knob (TTL kept short for dev; bump later).
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { data: SavingsCatalogue; at: number } | null = null;

/** Cached catalogue getter. Pass force=true to bypass the cache. */
export async function getSavingsCatalogue(force = false): Promise<SavingsCatalogue> {
	const now = Date.now();
	if (!force && cache && now - cache.at < CACHE_TTL_MS) return cache.data;
	const data = await build(new Date(now).toISOString());
	cache = { data, at: now };
	return data;
}
