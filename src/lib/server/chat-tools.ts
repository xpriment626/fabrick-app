/**
 * Chat agent tool surface.
 *
 * 9 AI SDK `tool()` wrappers around our existing server-side adapter
 * functions. Calls adapters DIRECTLY (no HTTP-MCP roundtrip) since the
 * chat agent runs in-process. The /mcp/* HTTP servers are reserved for
 * the Coral fleet workers which need an out-of-process API.
 *
 * Scope is deliberately narrow — fast-lookup tools that resolve in a
 * sub-second tool call. Anything heavier (TopLedger position deep-dives,
 * Exa multi-page fetching, news sentiment sweeps) is gated to Fleet
 * mode where the orchestrator + specialists can fan out properly.
 *
 * See chat-model.ts CHAT_SYSTEM_PROMPT for the prompt-side framing of
 * what these tools are and when to suggest Fleet instead.
 */

import { tool } from 'ai';
import { z } from 'zod';
import {
	jupiterGetPricesInput,
	jupiterGetPrices,
	jupiterSearchTokensInput,
	jupiterSearchTokens
} from '$lib/server/tools/jupiter';
import {
	defillamaGetProtocolsInput,
	defillamaGetProtocols,
	defillamaGetProtocolTvlInput,
	defillamaGetProtocolTvl,
	defillamaGetYieldPoolsInput,
	defillamaGetYieldPools,
	defillamaGetDexVolumeInput,
	defillamaGetDexVolume,
	defillamaGetCoinPricesInput,
	defillamaGetCoinPrices
} from '$lib/server/tools/defillama';
import { newsGetArticlesInput, newsGetArticles } from '$lib/server/tools/coindesk';
import { exaWebSearchInput, exaWebSearch } from '$lib/server/tools/exa';

export function buildChatTools() {
	return {
		jupiter_get_prices: tool({
			description:
				'Current USD price and 24h percent change for Solana SPL token mints, via Jupiter Price V3. Use for SOL or any SPL token spot price lookup. Up to 50 mints per call.',
			inputSchema: jupiterGetPricesInput,
			execute: async (input) => jupiterGetPrices(input)
		}),

		jupiter_search_tokens: tool({
			description:
				'Look up Solana SPL token metadata (symbol, name, decimals, icon, mint address) by symbol, name fragment, or mint address. Use when you have a token symbol but need its mint, or vice versa.',
			inputSchema: jupiterSearchTokensInput,
			execute: async (input) => jupiterSearchTokens(input)
		}),

		defillama_get_protocols: tool({
			description:
				'Multichain DeFi protocol leaderboard with TVL. Filter by `chain` (e.g. "Solana", "Ethereum") and/or `category` (e.g. "Lending", "Dexs", "Liquid Staking"). Returns the top N by TVL.',
			inputSchema: defillamaGetProtocolsInput,
			execute: async (input) => defillamaGetProtocols(input)
		}),

		defillama_get_protocol_tvl: tool({
			description:
				'Current total-value-locked (USD) for one specific protocol by its DefiLlama slug (e.g. "aave-v3", "kamino-lend", "jito"). Returns a single number.',
			inputSchema: defillamaGetProtocolTvlInput,
			execute: async (input) => defillamaGetProtocolTvl(input)
		}),

		defillama_get_yield_pools: tool({
			description:
				'Top yield-bearing pools across all chains (lending, LP, staking, etc.). Filter by chain, project, symbol, min TVL, or min APY. Use for "highest APY for X on Y" questions.',
			inputSchema: defillamaGetYieldPoolsInput,
			execute: async (input) => defillamaGetYieldPools(input)
		}),

		defillama_get_dex_volume: tool({
			description:
				'24h and 7d DEX volume totals plus per-DEX breakdown. Optionally scope to one chain. Good for "which DEX is largest on X" questions.',
			inputSchema: defillamaGetDexVolumeInput,
			execute: async (input) => defillamaGetDexVolume(input)
		}),

		defillama_get_coin_prices: tool({
			description:
				'Current USD price for coins across many chains via DefiLlama. Coin IDs use DefiLlama format: "<chain>:<address>" or "coingecko:<id>". Useful when Jupiter doesn\'t cover the asset (non-Solana chains).',
			inputSchema: defillamaGetCoinPricesInput,
			execute: async (input) => defillamaGetCoinPrices(input)
		}),

		news_get_articles: tool({
			description:
				'Recent crypto news headlines from CoinDesk\'s aggregated RSS feed. Filter by category (e.g. "SOL", "BTC", "DEFI"), free-text query, and a time window. Returns a short list of titles + sources + snippets. For a single quick-news lookup; don\'t chain multiple of these in one turn.',
			inputSchema: newsGetArticlesInput,
			execute: async (input) => newsGetArticles(input)
		}),

		exa_web_search: tool({
			description:
				'Single web search via Exa. Returns 3-5 results with title, URL, published date, and a short snippet. Use when the answer isn\'t available from on-chain or DefiLlama data — e.g. recent off-chain news, primary-source links, or context not in your training. ONE search per turn; don\'t loop.',
			inputSchema: exaWebSearchInput,
			execute: async (input) => exaWebSearch(input)
		}),

		suggest_fleet: tool({
			description:
				"Surface a 'Run with Fleet' chip on this reply when the question genuinely needs multi-source synthesis (onchain + news + social + web, with diversity-of-priors), not just a single tool call. Pass the user's original question verbatim as `query` and a one-sentence `reason`. Call this BEFORE writing your prose framing so the chip appears alongside your message. The user clicks to dispatch the 7-agent fleet. Don't reach for this if a single tool call would answer the question.",
			inputSchema: z.object({
				query: z
					.string()
					.min(3)
					.describe(
						"The user's research question, verbatim — what gets injected into the orchestrator. Keep it as the user wrote it; do not paraphrase or compress."
					),
				reason: z
					.string()
					.min(3)
					.describe(
						'One sentence on why this is fleet-shaped — which specialists matter and why diversity-of-priors helps.'
					)
			}),
			execute: async (input) => ({ ack: true, query: input.query, reason: input.reason })
		})
	};
}
