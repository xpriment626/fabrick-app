/**
 * Wallet fallback data used when a live wallet snapshot cannot be loaded.
 *
 * The savings catalogue itself never comes from placeholders; it loads from
 * Savings MCP or surfaces an error state.
 */

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
