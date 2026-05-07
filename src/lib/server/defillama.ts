/**
 * DefiLlama adapter — Solana protocol leaderboard.
 *
 * Powers the home route's "Trending now" rail with the top Solana-native
 * protocols by Solana-resident TVL plus 24h change. No API key required.
 *
 * Caveats:
 *  - The flat `tvl` field on the `/protocols` list is multichain. We use
 *    `chainTvls.Solana` to scope strictly to Solana-resident TVL so the
 *    leaderboard isn't dominated by Binance/OKX/Bitfinex custody numbers.
 *  - We exclude `CEX`, `Bridge`, `Chain` categories for the same reason.
 *  - DefiLlama's free tier asks for "reasonable" use; we cache by relying
 *    on SvelteKit's per-request load + Vercel's CDN. No bespoke cache yet.
 *
 * Docs: https://defillama.com/docs/api
 */

const BASE = 'https://api.llama.fi';

const EXCLUDED_CATEGORIES = new Set(['CEX', 'Bridge', 'Chain']);

/** Minimum Solana TVL ($USD) to be considered for the leaderboard. */
const MIN_SOLANA_TVL_USD = 1_000_000;

type DefiLlamaProtocol = {
	name: string;
	slug: string;
	category?: string;
	chains?: string[];
	chainTvls?: Record<string, number>;
	change_1d?: number;
	change_7d?: number;
};

export type TrendingProtocol = {
	name: string;
	slug: string;
	category: string;
	tvlUsd: number;
	/** 24h change as a percent, e.g. -1.5 means down 1.5% over the last day. */
	change1dPct: number;
};

/**
 * Fetch the top N Solana-native protocols, ranked by Solana-resident TVL.
 *
 * Throws on network failure; the route loader catches and falls back to
 * placeholder topics so the rail always renders.
 */
export async function getTopSolanaProtocols(limit = 5): Promise<TrendingProtocol[]> {
	const res = await fetch(`${BASE}/protocols`, { headers: { accept: 'application/json' } });
	if (!res.ok) {
		throw new Error(`DefiLlama protocols ${res.status}: ${await res.text()}`);
	}

	const all = (await res.json()) as DefiLlamaProtocol[];

	const ranked = all
		.filter((p) => (p.chains ?? []).includes('Solana'))
		.filter((p) => !EXCLUDED_CATEGORIES.has(p.category ?? ''))
		.map((p) => {
			const tvlUsd = p.chainTvls?.Solana ?? 0;
			return {
				name: p.name,
				slug: p.slug,
				category: p.category ?? 'Other',
				tvlUsd,
				change1dPct: p.change_1d ?? 0
			};
		})
		.filter((p) => p.tvlUsd >= MIN_SOLANA_TVL_USD)
		.sort((a, b) => b.tvlUsd - a.tvlUsd)
		.slice(0, limit);

	return ranked;
}
