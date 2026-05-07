<script lang="ts">
	import type { ResearchStory } from '$lib/placeholder-data';

	type Props = {
		story: ResearchStory;
		variant?: 'featured' | 'compact';
		href?: string;
	};

	let { story, variant = 'compact', href = '#' }: Props = $props();

	const tagStyle = $derived.by(() => {
		switch (story.tag) {
			case 'verified':
				return { bg: 'bg-positive', text: 'text-bg', label: 'VERIFIED ONCHAIN' };
			case 'positive':
				return { bg: 'bg-positive/10', text: 'text-positive', label: 'POSITIVE' };
			case 'mixed':
				return { bg: 'bg-warning/15', text: 'text-warning', label: 'MIXED' };
			case 'watch':
				return { bg: 'bg-warning/15', text: 'text-warning', label: 'WATCH' };
		}
	});
</script>

<a
	{href}
	class="block rounded-card border border-border bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_2px_8px_rgb(0_0_0/0.06)] {variant ===
	'featured'
		? 'p-7'
		: 'p-5'}"
>
	<div class="mb-3 flex items-center gap-3">
		<span class="eyebrow rounded-full px-2.5 py-1 {tagStyle.bg} {tagStyle.text}">
			{tagStyle.label}
		</span>
		<span class="text-xs text-muted">{story.timestamp}</span>
	</div>

	<h2
		class="mb-3 font-bold text-ink {variant === 'featured'
			? 'text-2xl tracking-[-0.02em]'
			: 'text-[17px] leading-snug'}"
	>
		{story.headline}
	</h2>

	<p
		class="mb-4 text-muted {variant === 'featured'
			? 'text-[15px] leading-relaxed'
			: 'text-[13px] leading-snug line-clamp-2'}"
	>
		{story.excerpt}
	</p>

	<div class="flex items-center gap-2">
		{#if variant === 'featured'}
			<div class="flex -space-x-1.5">
				{#each story.sources.slice(0, 4) as source (source)}
					<span
						class="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg text-[10px] font-semibold uppercase text-muted"
						title={source}
					>
						{source.charAt(0)}
					</span>
				{/each}
			</div>
			<span
				class="rounded-full border border-border bg-bg px-2.5 py-1 text-xs font-medium text-muted"
			>
				+{story.sourceCount - story.sources.length} more
			</span>
		{:else}
			<span class="eyebrow text-muted">{story.sourceCount} sources</span>
		{/if}
	</div>
</a>
