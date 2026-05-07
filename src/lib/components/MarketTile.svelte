<script lang="ts">
	import type { MarketTickerData } from '$lib/placeholder-data';

	type Props = {
		data: MarketTickerData;
	};

	let { data }: Props = $props();

	const isUp = $derived(data.deltaPct >= 0);
	const deltaText = $derived(`${isUp ? '▲' : '▼'} ${Math.abs(data.deltaPct).toFixed(1)}%`);
</script>

<a
	href="/research?asset={data.ticker}"
	class="flex flex-1 flex-col gap-1 rounded-tile border border-border bg-surface p-4 transition-shadow hover:shadow-[0_2px_8px_rgb(0_0_0/0.06)]"
>
	<div class="text-[15px] font-bold text-ink">{data.ticker}</div>
	<div class="text-[18px] font-extrabold tracking-[-0.02em] text-ink">{data.price}</div>
	<div class="text-xs font-medium {isUp ? 'text-positive' : 'text-negative'}">{deltaText}</div>
</a>
