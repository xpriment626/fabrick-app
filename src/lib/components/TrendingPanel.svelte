<script lang="ts">
	import type { TrendingTopic } from '$lib/placeholder-data';

	type Props = {
		topics: TrendingTopic[];
	};

	let { topics }: Props = $props();
</script>

<aside class="rounded-card border border-border bg-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
	<div class="eyebrow mb-4 text-muted">Trending now</div>

	<ul class="flex flex-col gap-3">
		{#each topics as { topic, mentions } (topic)}
			<li class="flex items-center justify-between">
				<a
					href="/research?topic={encodeURIComponent(topic)}"
					class="text-sm font-semibold text-ink transition-colors hover:text-positive"
				>
					{topic}
				</a>
				<span class="text-xs text-muted">{mentions} mentions</span>
			</li>
		{/each}
	</ul>
</aside>
