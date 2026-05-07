/**
 * Placeholder content for the v0 static pages. Mirrors the GPT Image 2
 * mockups so the rendered app matches the visual exploration.
 *
 * When real data adapters land (Helius, Bitquery, Coral agent fleet),
 * replace imports of this module with the corresponding loaders.
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
	price: string;
	deltaPct: number;
};

export const marketTickers: MarketTickerData[] = [
	{ ticker: 'SOL', price: '$187.42', deltaPct: 2.3 },
	{ ticker: 'JUP', price: '$1.28', deltaPct: 4.1 },
	{ ticker: 'JTO', price: '$4.92', deltaPct: -1.8 },
	{ ticker: 'DRIFT', price: '$1.04', deltaPct: 0.6 },
	{ ticker: 'WIF', price: '$2.81', deltaPct: -3.2 }
];

export type TrendingTopic = {
	topic: string;
	mentions: number;
};

export const trendingTopics: TrendingTopic[] = [
	{ topic: 'Restaking', mentions: 247 },
	{ topic: 'Pyth V3', mentions: 183 },
	{ topic: 'Jupiter perps', mentions: 156 },
	{ topic: 'MEV on Jito', mentions: 122 },
	{ topic: 'Solana ETF', mentions: 98 }
];

export type WalletSnapshot = {
	address: string;
	balanceUsd: string;
	deltaToday: string;
	deltaTodayPct: number;
	tokens: TokenHolding[];
};

export type TokenHolding = {
	symbol: string;
	name: string;
	amount: string;
	usdValue: string;
	deltaPct: number;
};

export const walletSnapshot: WalletSnapshot = {
	address: '9xQk·····4mPz',
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
