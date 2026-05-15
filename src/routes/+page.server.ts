/**
 * Home route loader.
 *
 * Hits Jupiter (market tile prices), DefiLlama (trending Solana protocols),
 * and Helius via the shared wallet snapshot in parallel. Each adapter is
 * caught individually so a single failure (missing key, upstream blip)
 * falls back to placeholder data without taking down the whole route.
 *
 * Research stories stay placeholder until the Coral agent fleet lands
 * (build-order step 4–5).
 */

import { getTokenPrices } from '$lib/server/jupiter';
import { getTopSolanaProtocols } from '$lib/server/defillama';
import { loadWalletSnapshot } from '$lib/server/wallet';
import { MARKET_TICKERS, MARKET_TICKER_MINTS, TOKENS } from '$lib/server/tokens';
import { formatUsdPrice } from '$lib/format';
import {
	featuredStory,
	marketTickers as fallbackMarketTickers,
	secondaryStories,
	trendingProtocols as fallbackTrending,
	walletSnapshot as fallbackWallet,
	type MarketTickerData,
	type TrendingProtocol,
	type WalletSnapshot
} from '$lib/placeholder-data';

export const load = async ({ locals }) => {
	const [marketTickers, trendingProtocols, walletSnapshot] = await Promise.all([
		loadMarketTickers(),
		loadTrending(),
		loadWalletPreview(locals.user?.solanaAddress ?? null)
	]);

	return {
		featuredStory,
		secondaryStories,
		marketTickers,
		trendingProtocols,
		walletSnapshot
	};
};

async function loadMarketTickers(): Promise<MarketTickerData[]> {
	try {
		const prices = await getTokenPrices(MARKET_TICKER_MINTS);
		return MARKET_TICKERS.map((symbol) => {
			const meta = TOKENS[symbol];
			const price = prices.get(meta.mint);
			if (!price) {
				const fallback = fallbackMarketTickers.find((t) => t.ticker === symbol);
				return (
					fallback ?? {
						ticker: symbol,
						mint: meta.mint,
						price: '$—',
						deltaPct: 0
					}
				);
			}
			return {
				ticker: symbol,
				mint: meta.mint,
				price: formatUsdPrice(price.usdPrice),
				deltaPct: price.priceChange24h
			};
		});
	} catch (err) {
		console.warn('[home] market tickers fell back to placeholder:', err);
		return fallbackMarketTickers;
	}
}

async function loadTrending(): Promise<TrendingProtocol[]> {
	try {
		const ranked = await getTopSolanaProtocols(5);
		if (ranked.length === 0) return fallbackTrending;
		return ranked;
	} catch (err) {
		console.warn('[home] trending protocols fell back to placeholder:', err);
		return fallbackTrending;
	}
}

async function loadWalletPreview(address: string | null): Promise<WalletSnapshot> {
	// Anonymous home page (or user whose wallet hasn't been provisioned
	// yet) shows the marketing-shaped placeholder. Authed users with a
	// Privy embedded wallet see their actual holdings.
	if (!address) return fallbackWallet;
	try {
		return await loadWalletSnapshot(address);
	} catch (err) {
		console.warn('[home] wallet preview fell back to placeholder:', err);
		return fallbackWallet;
	}
}
