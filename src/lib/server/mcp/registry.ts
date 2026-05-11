/**
 * Tool definitions exposed by our MCP servers. Each server (`jupiter`,
 * `defillama`) bundles its tools with name, description, zod input
 * schema, and the handler that runs the actual API call.
 */

import type { McpTool } from './server';
import {
	jupiterGetPricesInput,
	jupiterGetPrices,
	jupiterSearchTokensInput,
	jupiterSearchTokens
} from '../tools/jupiter';
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
} from '../tools/defillama';

export const JUPITER_TOOLS: McpTool[] = [
	{
		name: 'jupiter_get_prices',
		description:
			'Current USD price and 24h % change for Solana SPL token mints, via Jupiter Price V3. Up to 50 mints per call.',
		inputSchema: jupiterGetPricesInput,
		handler: (input) => jupiterGetPrices(input as never)
	},
	{
		name: 'jupiter_search_tokens',
		description:
			'Look up Solana SPL token metadata (symbol, name, decimals, icon, mint) by symbol, name fragment, or mint address.',
		inputSchema: jupiterSearchTokensInput,
		handler: (input) => jupiterSearchTokens(input as never)
	}
];

export const DEFILLAMA_TOOLS: McpTool[] = [
	{
		name: 'defillama_get_protocols',
		description:
			'List protocols on DefiLlama with TVL, ranked. Multichain; filter by `chain` and/or `category`.',
		inputSchema: defillamaGetProtocolsInput,
		handler: (input) => defillamaGetProtocols(input as never)
	},
	{
		name: 'defillama_get_protocol_tvl',
		description:
			'Current total-value-locked (USD) for one protocol by its DefiLlama slug. Returns a single number.',
		inputSchema: defillamaGetProtocolTvlInput,
		handler: (input) => defillamaGetProtocolTvl(input as never)
	},
	{
		name: 'defillama_get_yield_pools',
		description:
			'List top yield-bearing pools across all chains (lending, LP, staking, etc.). Filter by chain, project, symbol, min TVL, or min APY.',
		inputSchema: defillamaGetYieldPoolsInput,
		handler: (input) => defillamaGetYieldPools(input as never)
	},
	{
		name: 'defillama_get_dex_volume',
		description:
			'24h and 7d DEX volume totals plus per-DEX breakdown. Optionally scope to one chain.',
		inputSchema: defillamaGetDexVolumeInput,
		handler: (input) => defillamaGetDexVolume(input as never)
	},
	{
		name: 'defillama_get_coin_prices',
		description:
			'Current USD price for coins across many chains via DefiLlama. Coin IDs use DefiLlama format: "<chain>:<address>" or "coingecko:<id>".',
		inputSchema: defillamaGetCoinPricesInput,
		handler: (input) => defillamaGetCoinPrices(input as never)
	}
];

export const TOOLS_BY_SERVER: Record<string, Map<string, McpTool>> = {
	jupiter: new Map(JUPITER_TOOLS.map((t) => [t.name, t])),
	defillama: new Map(DEFILLAMA_TOOLS.map((t) => [t.name, t]))
};
