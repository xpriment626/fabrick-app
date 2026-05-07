/**
 * Composed wallet snapshot loader — wallet-honest.
 *
 * Pulls Helius for raw balances (native SOL + every non-zero SPL token),
 * Jupiter for prices, and Jupiter's token V2 search for display metadata
 * on any mint that's not in our local registry. The output is whatever
 * the address actually holds, sorted by USD value, dust-filtered, capped
 * to a reasonable display size.
 *
 * Shared by the home rail's `WalletPreview` and the wallet route's Tokens
 * tab — both render the same `WalletSnapshot` shape so the numbers stay
 * consistent across surfaces.
 */

import {
	getTokenPrices,
	searchTokenMetadata,
	type TokenPrice,
	type TokenSearchMeta
} from './jupiter';
import { getWalletBalances, lamportsToSol, rawToToken } from './helius';
import { TOKENS, MINT_TO_SYMBOL } from './tokens';
import {
	formatTokenAmount,
	formatUsdTotal,
	truncateAddress
} from '../format';
import type { TokenHolding, WalletSnapshot } from '../placeholder-data';

/** Drop tokens worth less than this from the display. */
const DUST_THRESHOLD_USD = 0.01;

/** Cap on tokens shown in the Tokens tab — most wallets don't need more. */
const MAX_DISPLAY_TOKENS = 10;

/** Jupiter Price V3 caps a single call at 50 mints. */
const JUPITER_PRICE_BATCH = 50;

const WRAPPED_SOL_MINT = TOKENS.SOL.mint;

export async function loadWalletSnapshot(address: string): Promise<WalletSnapshot> {
	const balances = await getWalletBalances(address);

	// Build the candidate mint list: wrapped-SOL (for native SOL pricing) +
	// every non-zero SPL token the wallet holds. Cap the SPL slice so we
	// stay under Jupiter's 50-mint price ceiling.
	const heldMints = balances.tokens
		.filter((t) => t.amount > 0)
		.map((t) => t.mint);

	const mintsToPrice = Array.from(new Set([WRAPPED_SOL_MINT, ...heldMints])).slice(
		0,
		JUPITER_PRICE_BATCH
	);

	// Mints we don't already have metadata for need a Jupiter search to
	// enrich symbol / name. SOL is in our registry so it's skipped.
	const unknownMints = mintsToPrice.filter((m) => !MINT_TO_SYMBOL[m]);

	const [prices, searched] = await Promise.all([
		getTokenPrices(mintsToPrice),
		unknownMints.length > 0 ? searchTokenMetadata(unknownMints) : Promise.resolve(new Map())
	]);

	const holdings = composeHoldings({
		nativeLamports: balances.nativeLamports,
		spl: balances.tokens,
		prices,
		searched
	});

	const dustFiltered = holdings.filter((h) => h.usdValue >= DUST_THRESHOLD_USD);

	// Always keep native SOL visible even if the address has < $0.01 of it,
	// so the wallet still has a recognizable identity row.
	const sol = holdings.find((h) => h.symbol === 'SOL' && h.isNative);
	const ranked = ensureSol(dustFiltered, sol)
		.sort((a, b) => b.usdValue - a.usdValue)
		.slice(0, MAX_DISPLAY_TOKENS);

	const totalUsd = ranked.reduce((sum, h) => sum + h.usdValue, 0);
	const weightedDelta = ranked.reduce((sum, h) => sum + h.usdValue * h.deltaPct, 0);
	const totalDeltaPct = totalUsd > 0 ? weightedDelta / totalUsd : 0;
	const totalDeltaUsd = (totalDeltaPct / 100) * totalUsd;
	const deltaSign = totalDeltaUsd >= 0 ? '+' : '-';
	const deltaToday = `${deltaSign}${formatUsdTotal(Math.abs(totalDeltaUsd))}`;

	const tokens: TokenHolding[] = ranked.map((h) => ({
		symbol: h.symbol,
		name: h.name,
		amount: formatTokenAmount(h.amount, h.symbol),
		usdValue: formatUsdTotal(h.usdValue),
		deltaPct: h.deltaPct
	}));

	return {
		address: truncateAddress(address),
		addressFull: address,
		balanceUsd: formatUsdTotal(totalUsd),
		deltaToday,
		deltaTodayPct: Number(totalDeltaPct.toFixed(2)),
		tokens
	};
}

type Holding = {
	mint: string;
	symbol: string;
	name: string;
	amount: number;
	usdValue: number;
	deltaPct: number;
	isNative: boolean;
};

function composeHoldings(args: {
	nativeLamports: number;
	spl: { mint: string; amount: number; decimals: number }[];
	prices: Map<string, TokenPrice>;
	searched: Map<string, TokenSearchMeta>;
}): Holding[] {
	const { nativeLamports, spl, prices, searched } = args;
	const out: Holding[] = [];

	// Native SOL row, priced via wrapped SOL.
	const solAmount = lamportsToSol(nativeLamports);
	const solPrice = prices.get(WRAPPED_SOL_MINT);
	out.push({
		mint: WRAPPED_SOL_MINT,
		symbol: 'SOL',
		name: 'Solana',
		amount: solAmount,
		usdValue: solPrice ? solAmount * solPrice.usdPrice : 0,
		deltaPct: solPrice?.priceChange24h ?? 0,
		isNative: true
	});

	for (const t of spl) {
		if (t.amount <= 0) continue;
		const amount = rawToToken(t.amount, t.decimals);
		const price = prices.get(t.mint);
		// Without a price we can't sort by USD; skip rather than render a
		// row claiming $0 value when the user actually holds something.
		if (!price) continue;

		const meta = resolveMeta(t.mint, searched);
		out.push({
			mint: t.mint,
			symbol: meta.symbol,
			name: meta.name,
			amount,
			usdValue: amount * price.usdPrice,
			deltaPct: price.priceChange24h,
			isNative: false
		});
	}

	return out;
}

function resolveMeta(
	mint: string,
	searched: Map<string, TokenSearchMeta>
): { symbol: string; name: string } {
	const known = MINT_TO_SYMBOL[mint];
	if (known) {
		return { symbol: TOKENS[known].symbol, name: TOKENS[known].name };
	}
	const found = searched.get(mint);
	if (found) {
		return { symbol: found.symbol, name: found.name };
	}
	const short = `${mint.slice(0, 4)}…${mint.slice(-4)}`;
	return { symbol: short, name: 'Unknown token' };
}

function ensureSol(filtered: Holding[], sol: Holding | undefined): Holding[] {
	if (!sol) return filtered;
	if (filtered.some((h) => h.symbol === 'SOL' && h.isNative)) return filtered;
	return [sol, ...filtered];
}
