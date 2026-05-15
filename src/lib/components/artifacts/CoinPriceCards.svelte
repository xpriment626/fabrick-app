<!--
	Renders the output of `defillama_get_coin_prices`:
	{ prices: { [id]: { price, symbol?, decimals?, timestamp?, confidence? } } }

	IDs are in DefiLlama format (`<chain>:<address>` or
	`coingecko:<id>`). No 24h delta — DefiLlama's `/prices/current`
	endpoint doesn't return one. Confidence shown as a soft caption
	when present (DefiLlama returns 0–1).
-->
<script lang="ts">
	import { fmtPrice, shortAddr, timeAgo } from './utils';

	type Price = {
		price: number;
		symbol?: string;
		decimals?: number;
		timestamp?: number;
		confidence?: number;
	};

	type Output = { prices: Record<string, Price> };

	type Props = { output: unknown };
	let { output }: Props = $props();

	const entries = $derived.by(() => {
		if (!output || typeof output !== 'object' || !('prices' in output)) return [];
		const map = (output as Output).prices ?? {};
		return Object.entries(map);
	});

	function shortenId(id: string): string {
		const colonIdx = id.indexOf(':');
		if (colonIdx === -1) return id;
		const chain = id.slice(0, colonIdx);
		const rest = id.slice(colonIdx + 1);
		// `coingecko:bitcoin` — keep human-readable
		if (chain === 'coingecko') return id;
		// `ethereum:0xabc...` — truncate
		return `${chain}:${shortAddr(rest, 4, 4)}`;
	}
</script>

{#if entries.length === 0}
	<div class="text-muted text-xs italic">No prices returned.</div>
{:else}
	<div class="artifact">
		<div class="caption">
			<span class="caption-title">Coin prices</span>
			<span class="caption-count">{entries.length} · DefiLlama</span>
		</div>
		<div class="grid">
			{#each entries as [id, p] (id)}
				<div class="card">
					<div class="head">
						{#if p.symbol}
							<span class="symbol">{p.symbol}</span>
						{/if}
						<span class="id">{shortenId(id)}</span>
					</div>
					<div class="price tnum">{fmtPrice(p.price)}</div>
					<div class="meta">
						{#if p.timestamp}
							<span>{timeAgo(p.timestamp)}</span>
						{/if}
						{#if p.confidence != null}
							<span class="confidence">{Math.round(p.confidence * 100)}% conf</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.artifact {
		border: 1px solid var(--color-border);
		border-radius: 12px;
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		overflow: hidden;
	}
	.caption {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 10px 14px 8px;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
	}
	.caption-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--color-ink);
		letter-spacing: -0.01em;
	}
	.caption-count {
		font-size: 11px;
		color: var(--color-muted);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1px;
		background: color-mix(in srgb, var(--color-border) 50%, transparent);
	}
	.card {
		padding: 12px 14px;
		background: var(--color-surface);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.symbol {
		font-size: 12px;
		font-weight: 600;
		color: var(--color-ink);
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}
	.id {
		font-size: 10px;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		color: var(--color-muted);
	}
	.price {
		font-size: 18px;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--color-ink);
	}
	.meta {
		display: flex;
		gap: 8px;
		font-size: 10px;
		color: var(--color-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.confidence {
		font-variant-numeric: tabular-nums;
	}
	.tnum {
		font-variant-numeric: tabular-nums;
	}
</style>
