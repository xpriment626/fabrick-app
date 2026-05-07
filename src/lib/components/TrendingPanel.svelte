<script lang="ts">
	import type { TrendingProtocol } from '$lib/placeholder-data';
	import { formatPctDeltaShort, formatUsdCompact } from '$lib/format';

	type Props = {
		protocols: TrendingProtocol[];
	};

	let { protocols }: Props = $props();
</script>

<aside class="rounded-card border border-border bg-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
	<div class="eyebrow mb-4 text-muted">Trending now</div>

	<ul class="flex flex-col gap-3">
		{#each protocols as { name, slug, tvlUsd, change1dPct } (slug)}
			{@const isUp = change1dPct >= 0}
			<li class="flex items-center justify-between gap-3">
				<a
					href="/research?protocol={encodeURIComponent(slug)}"
					class="text-sm font-semibold text-ink transition-colors hover:text-positive truncate"
				>
					{name}
				</a>
				<div class="flex shrink-0 items-baseline gap-2">
					<span class="text-xs font-medium text-muted">{formatUsdCompact(tvlUsd)}</span>
					<span
						class="text-xs font-semibold {isUp ? 'text-positive' : 'text-negative'}"
					>
						{formatPctDeltaShort(change1dPct)}
					</span>
				</div>
			</li>
		{/each}
	</ul>
</aside>
