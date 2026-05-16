/**
 * Artifact renderer registry.
 *
 * Maps the bare tool name (with the `tool-` prefix stripped from the
 * AI SDK UIMessage part type) to a Svelte component that renders the
 * tool's `output` payload. Components receive a single `output` prop
 * — they are responsible for runtime-validating the shape and rendering
 * an empty state when the payload doesn't match.
 *
 * Tools without a registered renderer fall back to the default chip
 * collapsed view (Input/Output JSON), so adding a new renderer is
 * additive — never breaks existing surfaces.
 */

import type { Component } from 'svelte';
import ProtocolTable from './ProtocolTable.svelte';
import YieldPoolTable from './YieldPoolTable.svelte';
import JupiterPriceCards from './JupiterPriceCards.svelte';
import CoinPriceCards from './CoinPriceCards.svelte';
import NewsCardList from './NewsCardList.svelte';
import CitationList from './CitationList.svelte';
import TokenList from './TokenList.svelte';
import DexVolumeBlock from './DexVolumeBlock.svelte';
import ProtocolTvlStat from './ProtocolTvlStat.svelte';
import SuggestFleet from './SuggestFleet.svelte';

type ArtifactRenderer = Component<{ output: unknown }>;

const REGISTRY: Record<string, ArtifactRenderer> = {
	defillama_get_protocols: ProtocolTable as unknown as ArtifactRenderer,
	defillama_get_yield_pools: YieldPoolTable as unknown as ArtifactRenderer,
	defillama_get_dex_volume: DexVolumeBlock as unknown as ArtifactRenderer,
	defillama_get_coin_prices: CoinPriceCards as unknown as ArtifactRenderer,
	defillama_get_protocol_tvl: ProtocolTvlStat as unknown as ArtifactRenderer,
	jupiter_get_prices: JupiterPriceCards as unknown as ArtifactRenderer,
	jupiter_search_tokens: TokenList as unknown as ArtifactRenderer,
	news_get_articles: NewsCardList as unknown as ArtifactRenderer,
	exa_web_search: CitationList as unknown as ArtifactRenderer,
	suggest_fleet: SuggestFleet as unknown as ArtifactRenderer
};

export function getArtifactRenderer(toolName: string): ArtifactRenderer | null {
	return REGISTRY[toolName] ?? null;
}

/**
 * Tools whose UI surface is the artifact itself (not a data result the
 * user needs to inspect). Chat page suppresses the generic ToolCallChip
 * for these so the renderer stands alone.
 */
const CHIP_SUPPRESSED = new Set<string>(['suggest_fleet']);

export function shouldSuppressChip(toolName: string): boolean {
	return CHIP_SUPPRESSED.has(toolName);
}
