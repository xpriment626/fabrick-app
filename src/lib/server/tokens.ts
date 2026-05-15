/**
 * Token registry for v0.
 *
 * The market tile strip and the wallet preview lean on this list so prices,
 * balances, and labels stay consistent across the home and wallet routes.
 *
 * SOL is special: the native lamport balance comes back from Helius's
 * `nativeBalance` field, but Jupiter prices it via the wrapped-SOL mint.
 * Both are captured here so a single record drives both paths.
 */

export type TokenMeta = {
	symbol: string;
	name: string;
	mint: string;
	decimals: number;
	/** True for the native SOL row (priced via wrapped SOL on Jupiter). */
	native?: boolean;
};

export const TOKENS: Record<string, TokenMeta> = {
	SOL: {
		symbol: 'SOL',
		name: 'Solana',
		mint: 'So11111111111111111111111111111111111111112',
		decimals: 9,
		native: true
	},
	USDC: {
		symbol: 'USDC',
		name: 'USD Coin',
		mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
		decimals: 6
	},
	JUP: {
		symbol: 'JUP',
		name: 'Jupiter',
		mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
		decimals: 6
	},
	JTO: {
		symbol: 'JTO',
		name: 'Jito',
		mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
		decimals: 9
	},
	DRIFT: {
		symbol: 'DRIFT',
		name: 'Drift',
		mint: 'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7',
		decimals: 6
	},
	WIF: {
		symbol: 'WIF',
		name: 'dogwifhat',
		mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
		decimals: 6
	}
};

/** Tickers featured in the home market tile strip, in display order. */
export const MARKET_TICKERS: readonly string[] = ['SOL', 'JUP', 'JTO', 'DRIFT', 'WIF'];

/** Mints to price for the market tile strip. */
export const MARKET_TICKER_MINTS: readonly string[] = MARKET_TICKERS.map(
	(sym) => TOKENS[sym].mint
);

/** Reverse lookup: mint → symbol. */
export const MINT_TO_SYMBOL: Record<string, string> = Object.fromEntries(
	Object.values(TOKENS).map((t) => [t.mint, t.symbol])
);

/**
 * (Privy now provisions per-user embedded Solana wallets on first
 * sign-in; the home and wallet routes read `locals.user.solanaAddress`
 * for the real address. No global sample needed.)
 */
