/**
 * Home route loader.
 *
 * Returns the home page's editorial surface: live news stories (split
 * into featured + secondary + extra) plus a trending Solana protocols
 * panel and the authed user's wallet snapshot. Market tickers used to
 * live here too; they've been moved out as part of repositioning the
 * home page as a newsroom — only the side-rail wallet + trending widget
 * carry token-shaped data now.
 *
 * Caching: news + trending both flow through `api_cache` to avoid
 * hitting CoinDesk / DefiLlama on every SSR render. TTLs chosen per
 * call site so news (15min) and trending (5min) can age independently.
 * On fetcher failure we fall back to the cached row if one exists
 * (degraded freshness > broken page), then to baked-in placeholder.
 */

import { getTopSolanaProtocols } from '$lib/server/defillama';
import { loadWalletSnapshot } from '$lib/server/wallet';
import { getOrFetch } from '$lib/server/api-cache';
import { loadStoriesFromCoinDesk, splitForHomeLayout } from '$lib/server/news-to-stories';
import {
	featuredStory as fallbackFeaturedStory,
	secondaryStories as fallbackSecondaryStories,
	trendingProtocols as fallbackTrending,
	walletSnapshot as fallbackWallet,
	type ResearchStory,
	type TrendingProtocol,
	type WalletSnapshot
} from '$lib/placeholder-data';

const NEWS_CACHE_KEY = 'news:coindesk:SOL:home';
const NEWS_TTL_MS = 15 * 60 * 1000; // 15 minutes — CoinDesk's RSS aggregation refreshes on this order anyway

const TRENDING_CACHE_KEY = 'defillama:trending:solana:5';
const TRENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes — TVL moves slowly, but trending order can flip intraday

export const load = async ({ locals }) => {
	const [stories, trendingProtocols, walletSnapshot] = await Promise.all([
		loadHomeStories(),
		loadTrending(),
		loadWalletPreview(locals.user?.solanaAddress ?? null)
	]);

	const { featuredStory, secondaryStories, extraStories } = splitForHomeLayout(stories);

	return {
		featuredStory: featuredStory ?? fallbackFeaturedStory,
		secondaryStories: secondaryStories.length > 0 ? secondaryStories : fallbackSecondaryStories,
		extraStories,
		trendingProtocols,
		walletSnapshot
	};
};

/**
 * Fetch the home page's news stories — cached, with placeholder
 * fallback on both cache miss + fetcher failure (e.g. CoinDesk down or
 * unreachable).
 */
async function loadHomeStories(): Promise<ResearchStory[]> {
	try {
		return await getOrFetch<ResearchStory[]>(NEWS_CACHE_KEY, NEWS_TTL_MS, async () => {
			// Pull the SOL category — Solana-relevant by construction. We
			// over-fetch (15) so the editorial grid has enough material
			// for the 1+3+3 layout plus a few headroom slots; the loader
			// then takes the freshest 7. CoinDesk caps at 100/call so
			// this is well within budget.
			return await loadStoriesFromCoinDesk({ category: 'SOL', limit: 15 });
		});
	} catch (err) {
		console.warn('[home] news stories fell back to placeholder:', err);
		return [fallbackFeaturedStory, ...fallbackSecondaryStories];
	}
}

async function loadTrending(): Promise<TrendingProtocol[]> {
	try {
		return await getOrFetch<TrendingProtocol[]>(
			TRENDING_CACHE_KEY,
			TRENDING_TTL_MS,
			async () => {
				const ranked = await getTopSolanaProtocols(5);
				return ranked.length > 0 ? ranked : fallbackTrending;
			}
		);
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
