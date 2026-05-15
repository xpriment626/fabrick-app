<!--
	Renders the output of `jupiter_get_prices`:
	{ prices: { [mint]: { mint, usdPrice, priceChange24h, decimals } } }

	Compact card grid — each card is a price tile with a 24h delta
	arrow. Mint addresses get truncated; the chip already shows the
	full context via the original tool args.
-->
<script lang="ts">
	import { fmtPrice, fmtPct, pctClass, shortAddr } from './utils';

	type Price = {
		mint: string;
		usdPrice: number;
		priceChange24h: number;
		decimals: number;
	};

	type Output = { prices: Record<string, Price> };

	type Props = { output: unknown };
	let { output }: Props = $props();

	const prices = $derived.by(() => {
		if (!output || typeof output !== 'object' || !('prices' in output)) return [];
		const map = (output as Output).prices ?? {};
		return Object.values(map);
	});

	function arrow(n: number): string {
		if (!Number.isFinite(n) || n === 0) return '';
		return n > 0 ? '▲' : '▼';
	}
</script>

{#if prices.length === 0}
	<div class="text-muted text-xs italic">No prices returned.</div>
{:else}
	<div class="artifact">
		<div class="caption">
			<span class="caption-title">Prices</span>
			<span class="caption-count">{prices.length} · Jupiter</span>
		</div>
		<div class="grid">
			{#each prices as p (p.mint)}
				<div class="card">
					<div class="mint">{shortAddr(p.mint, 4, 4)}</div>
					<div class="price tnum">{fmtPrice(p.usdPrice)}</div>
					<div class="delta {pctClass(p.priceChange24h)} tnum">
						<span class="arrow">{arrow(p.priceChange24h)}</span>
						{fmtPct(p.priceChange24h)}
						<span class="window">24h</span>
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
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
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
	.mint {
		font-size: 10px;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		color: var(--color-muted);
		letter-spacing: 0.02em;
	}
	.price {
		font-size: 18px;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--color-ink);
	}
	.delta {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		font-weight: 500;
		color: var(--color-muted);
	}
	.delta.pos {
		color: var(--color-positive);
	}
	.delta.neg {
		color: var(--color-negative);
	}
	.delta .arrow {
		font-size: 9px;
	}
	.delta .window {
		color: var(--color-muted);
		font-weight: 400;
		margin-left: auto;
		font-size: 10px;
	}
	.tnum {
		font-variant-numeric: tabular-nums;
	}
</style>
