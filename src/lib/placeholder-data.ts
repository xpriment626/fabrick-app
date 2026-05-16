/**
 * Placeholder content + canonical types for the v0 surfaces.
 *
 * Every shape here is the contract the server loaders honour. When live
 * adapters succeed, the loader returns real data in this exact shape;
 * when they fail (missing key, network blip), the loader falls back to
 * these placeholders so the route still renders.
 *
 * Research stories stay fully placeholder for v0 — real research arrives
 * once the Coral agent fleet lands in build-order step 4 / 5.
 */

export type ResearchSentiment = 'positive' | 'mixed' | 'watch';

export type ResearchStory = {
	id: string;
	tag: ResearchSentiment | 'verified';
	headline: string;
	excerpt: string;
	sourceCount: number;
	sources: string[];
	timestamp: string;
	/** External article URL (set for live news; `null`/undefined for synthesized stories or placeholder). */
	href?: string | null;
	/**
	 * Optional hero image. Set only when the upstream feed exposes a
	 * real article-specific image — generic source-logo placeholders are
	 * filtered out upstream so we don't render the same fallback graphic
	 * on every other card.
	 */
	imageUrl?: string | null;
};

export const featuredStory: ResearchStory = {
	id: 'jito-restaking-mainnet',
	tag: 'verified',
	headline:
		'Jito Restaking goes live on mainnet — early validator economics show ~14% real yield',
	excerpt:
		'Synthesized by 4 Fabrick research agents from 11 sources. Onchain flow data and validator-set commentary suggest sustainable yield, with caveats around centralization risk.',
	sourceCount: 11,
	sources: ['jito.network', 'blockworks', 'solana.foundation', 'messari'],
	timestamp: '6h ago'
};

export const secondaryStories: ResearchStory[] = [
	{
		id: 'pyth-v3-confidence',
		tag: 'positive',
		headline: 'Pyth rolls out V3 confidence intervals across 200+ price feeds',
		excerpt:
			'Improved accuracy and tail-risk transparency for DeFi builders relying on price oracles for liquidations and pricing.',
		sourceCount: 7,
		sources: ['pyth.network', 'blockworks', 'twitter'],
		timestamp: '12h ago'
	},
	{
		id: 'drift-perp-volume',
		tag: 'mixed',
		headline: 'Drift perp volume hits 30-day high amid SOL-USD volatility',
		excerpt:
			'Volume surge attributed to volatile SOL price action and increased retail trader activity. Open interest also climbing.',
		sourceCount: 5,
		sources: ['drift.trade', 'blockworks', 'dune'],
		timestamp: '1d ago'
	},
	{
		id: 'solana-foundation-fund',
		tag: 'watch',
		headline: 'Solana Foundation announces $50M ecosystem fund for AI-native apps',
		excerpt:
			'Program to invest in teams building consumer-facing AI applications using Solana infrastructure and onchain data.',
		sourceCount: 9,
		sources: ['solana.foundation', 'theblock', 'coindesk'],
		timestamp: '1d ago'
	}
];

export type MarketTickerData = {
	ticker: string;
	mint: string;
	price: string;
	deltaPct: number;
};

export const marketTickers: MarketTickerData[] = [
	{
		ticker: 'SOL',
		mint: 'So11111111111111111111111111111111111111112',
		price: '$187.42',
		deltaPct: 2.3
	},
	{
		ticker: 'JUP',
		mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
		price: '$1.28',
		deltaPct: 4.1
	},
	{
		ticker: 'JTO',
		mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
		price: '$4.92',
		deltaPct: -1.8
	},
	{
		ticker: 'DRIFT',
		mint: 'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7',
		price: '$1.04',
		deltaPct: 0.6
	},
	{
		ticker: 'WIF',
		mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
		price: '$2.81',
		deltaPct: -3.2
	}
];

/**
 * Trending now rail. Source-of-truth for the live version is DefiLlama's
 * Solana protocol leaderboard, ranked by Solana-resident TVL. Placeholder
 * mirrors that shape so the rail looks the same offline.
 */
export type TrendingProtocol = {
	name: string;
	slug: string;
	category: string;
	/** Solana-resident TVL in USD. */
	tvlUsd: number;
	/** 24h TVL change as a percent, e.g. -1.5 means down 1.5%. */
	change1dPct: number;
};

export const trendingProtocols: TrendingProtocol[] = [
	{
		name: 'Kamino Lend',
		slug: 'kamino-lend',
		category: 'Lending',
		tvlUsd: 1_450_000_000,
		change1dPct: -1.0
	},
	{
		name: 'Sanctum Validator LSTs',
		slug: 'sanctum-validator-lsts',
		category: 'Liquid Staking',
		tvlUsd: 1_220_000_000,
		change1dPct: 0.0
	},
	{
		name: 'Raydium AMM',
		slug: 'raydium-amm',
		category: 'Dexs',
		tvlUsd: 1_055_000_000,
		change1dPct: 0.9
	},
	{
		name: 'Jito Liquid Staking',
		slug: 'jito-liquid-staking',
		category: 'Liquid Staking',
		tvlUsd: 880_000_000,
		change1dPct: -0.0
	},
	{
		name: 'Jupiter Perpetual Exchange',
		slug: 'jupiter-perpetual-exchange',
		category: 'Derivatives',
		tvlUsd: 700_000_000,
		change1dPct: -1.7
	}
];

export type TokenHolding = {
	symbol: string;
	name: string;
	amount: string;
	usdValue: string;
	deltaPct: number;
};

export type WalletSnapshot = {
	/** Pre-truncated for display, e.g. `9xQk····4mPz`. */
	address: string;
	/** Full base58 address — useful for explorer links, copy actions. */
	addressFull: string;
	balanceUsd: string;
	deltaToday: string;
	deltaTodayPct: number;
	tokens: TokenHolding[];
};

export const walletSnapshot: WalletSnapshot = {
	address: '9xQk····4mPz',
	addressFull: '9xQk000000000000000000000000000000000004mPz',
	balanceUsd: '$2,847.50',
	deltaToday: '+$42.18',
	deltaTodayPct: 1.51,
	tokens: [
		{ symbol: 'SOL', name: 'Solana', amount: '12.4082 SOL', usdValue: '$2,323.84', deltaPct: 2.31 },
		{ symbol: 'USDC', name: 'USD Coin', amount: '412.50 USDC', usdValue: '$412.50', deltaPct: 0 },
		{ symbol: 'JUP', name: 'Jupiter', amount: '67.2 JUP', usdValue: '$86.06', deltaPct: 4.12 },
		{ symbol: 'JTO', name: 'Jito', amount: '5.13 JTO', usdValue: '$25.24', deltaPct: -1.84 },
		{ symbol: 'DRIFT', name: 'Drift', amount: '0.0 DRIFT', usdValue: '$0.00', deltaPct: 0 }
	]
};
