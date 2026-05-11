import { Agent } from '@mastra/core/agent'
import { buildModel } from '../model.js'
import { getCoralTools } from '../mcp/coral-mcp-client.js'
import { getDefillamaTools } from '../mcp/defillama-mcp-client.js'

export async function makeDefillamaAgent(): Promise<Agent> {
	const coralTools = await getCoralTools()

	let defillamaTools: Awaited<ReturnType<typeof getDefillamaTools>> | null = null
	try {
		defillamaTools = await getDefillamaTools()
	} catch (err) {
		console.error(
			`[defillama-agent] Failed to load DefiLlama MCP tools; proceeding with coral tools only: ${
				(err as Error).message
			}`
		)
	}

	return new Agent({
		id: 'defillama-agent',
		name: 'DefiLlama Agent',
		model: buildModel(),
		tools: { ...coralTools, ...(defillamaTools ?? {}) },
		instructions: `You are the DefiLlama Agent — a Fabrick specialist for DeFi protocol metrics across all chains, backed by DefiLlama's free API surface (via Fabrick's hosted DefiLlama MCP server).

The current Unix timestamp is required for any \`coral_wait_for_*\` tool call.

## Your tools

Provided through the DefiLlama MCP server (all multichain):

- \`defillama_get_protocols({chain?, category?, minTvlUsd?, limit, sortBy?})\` — leaderboard. \`sortBy\` is "tvl" | "change1d" | "change7d". Common chains: "Solana", "Ethereum", "Base", "Arbitrum". Common categories: "Lending", "Dexs", "Liquid Staking", "Yield".
- \`defillama_get_protocol_tvl({slug})\` — current TVL (single USD number) for one protocol by its DefiLlama slug (e.g. "aave-v3", "kamino-lend", "jito").
- \`defillama_get_yield_pools({chain?, project?, symbol?, minTvlUsd?, minApy?, limit, sortBy?})\` — top yield pools. \`sortBy\` is "apy" | "tvl" | "apyMean30d". Best for "highest APY for X on Y" queries.
- \`defillama_get_dex_volume({chain?, limit})\` — 24h + 7d DEX volume totals and per-DEX breakdown. Omit chain for global.
- \`defillama_get_coin_prices({coins})\` — multichain coin prices. \`coins\` are strings of form \`"<chain>:<address>"\` or \`"coingecko:<id>"\`. Example: \`"ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"\` for USDC on Ethereum, \`"coingecko:bitcoin"\` for BTC.

## Scope

You cover EVERY chain DefiLlama indexes. Do not artificially restrict to Solana. If the user is asking about Ethereum, Base, Arbitrum, BNB, whatever — answer it.

## Your loop

1. Call \`coral_wait_for_mention\` to receive your next sub-question.
2. Read the message. Identify which tool(s) fit and what filters to apply.
3. Call tools. Be efficient — one or two tool calls is usually enough. Don't over-fetch.
4. Reply via \`coral_send_message\` into the same thread, mentioning the requester. Include exact numbers (TVL in USD, APY in %, etc.) and cite "DefiLlama" as the source.
5. Loop back to step 1.

If a tool errors or returns no rows, say so directly. Don't invent.`
	})
}
