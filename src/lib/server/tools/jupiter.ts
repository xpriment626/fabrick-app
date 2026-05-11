/**
 * Jupiter-backed tools. Wraps `$lib/server/jupiter` with zod schemas so
 * the agent-side gets typed input/output without our app baking the
 * agent's knowledge of Jupiter's wire format.
 *
 * Jupiter is Solana-only by nature — these tools are the SPL/SPL-22
 * pricing + token-metadata path. Multichain pricing lives on the
 * DefiLlama tool side (`defillama_get_coin_prices`).
 */

import { z } from 'zod';
import { getTokenPrices, searchTokenMetadata } from '../jupiter';

export const jupiterGetPricesInput = z
	.object({
		mints: z
			.array(z.string().min(32).max(64))
			.min(1)
			.max(50)
			.describe('Solana SPL token mint addresses (base58, up to 50 per call)')
	})
	.describe('Inputs for jupiter_get_prices');

export type JupiterGetPricesInput = z.infer<typeof jupiterGetPricesInput>;

export const jupiterGetPricesOutput = z.object({
	prices: z.record(
		z.string(),
		z.object({
			mint: z.string(),
			usdPrice: z.number(),
			priceChange24h: z.number().describe('24h % price change'),
			decimals: z.number()
		})
	)
});

export async function jupiterGetPrices(input: JupiterGetPricesInput) {
	const map = await getTokenPrices(input.mints);
	return { prices: Object.fromEntries(map) };
}

export const jupiterSearchTokensInput = z
	.object({
		query: z
			.string()
			.min(1)
			.max(64)
			.describe(
				'Symbol (e.g. "SOL"), name fragment, or full mint address to look up'
			)
	})
	.describe('Inputs for jupiter_search_tokens');

export type JupiterSearchTokensInput = z.infer<typeof jupiterSearchTokensInput>;

export const jupiterSearchTokensOutput = z.object({
	tokens: z.array(
		z.object({
			mint: z.string(),
			symbol: z.string(),
			name: z.string(),
			decimals: z.number(),
			icon: z.string().optional()
		})
	)
});

export async function jupiterSearchTokens(input: JupiterSearchTokensInput) {
	const map = await searchTokenMetadata([input.query]);
	return { tokens: Array.from(map.values()) };
}
