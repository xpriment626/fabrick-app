<script lang="ts">
	import type { ResearchStory } from '$lib/placeholder-data';

	type Props = {
		story: ResearchStory;
		variant?: 'featured' | 'compact';
	};

	let { story, variant = 'compact' }: Props = $props();

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

	/**
	 * Card href routes to the internal /discover/[id] page when the
	 * story has an upstream URL (so we have something to resolve to);
	 * /discover renders the article body + chat-with-story composer
	 * and exposes the original URL inline. Placeholder stories without
	 * an upstream URL fall through to '#' (anchor, no navigation).
	 */
	const href = $derived(story.href ? `/discover/${story.id}` : '#');

	/**
	 * Show the synthesized-story chrome (multiple source bubbles +
	 * "+N more" badge) only when the story actually has multiple
	 * sources. Live single-article cards show "via <source>" instead.
	 */
	const isMultiSource = $derived(story.sourceCount > 1 && story.sources.length > 1);

	/**
	 * Image is optional + best-effort. The upstream pipeline filters
	 * out generic source-logo placeholders so any URL that reaches us
	 * is article-specific. Still defend against runtime load failures
	 * (404s, CDN hiccups) by hiding the slot if the <img> errors.
	 */
	let imgLoadFailed = $state(false);
	const showImage = $derived(Boolean(story.imageUrl) && !imgLoadFailed);
</script>

<a
	{href}
	class="block overflow-hidden rounded-card border border-border bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_2px_8px_rgb(0_0_0/0.06)]"
>
	{#if variant === 'featured'}
		<!--
			Featured: text on the left, image on the right when present.
			When there's no image the text expands to fill the full card,
			preserving the typographic hierarchy without an awkward gap.
		-->
		<div class="flex gap-7 p-7 {showImage ? '' : ''}">
			<div class="flex flex-1 flex-col">
				<div class="mb-3 flex items-center gap-3">
					<span class="eyebrow rounded-full px-2.5 py-1 {tagStyle.bg} {tagStyle.text}">
						{tagStyle.label}
					</span>
					<span class="text-xs text-muted">{story.timestamp}</span>
				</div>

				<h2 class="mb-3 text-2xl font-bold leading-snug tracking-[-0.02em] text-ink">
					{story.headline}
				</h2>

				<p class="mb-4 text-[15px] leading-relaxed text-muted">
					{story.excerpt}
				</p>

				<div class="mt-auto flex items-center gap-2">
					{#if isMultiSource}
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
						{#if story.sourceCount > story.sources.length}
							<span
								class="rounded-full border border-border bg-bg px-2.5 py-1 text-xs font-medium text-muted"
							>
								+{story.sourceCount - story.sources.length} more
							</span>
						{/if}
					{:else}
						<span class="eyebrow text-muted">via {story.sources[0] ?? 'CoinDesk'}</span>
					{/if}
				</div>
			</div>

			{#if showImage}
				<div
					class="relative w-[280px] flex-shrink-0 overflow-hidden rounded-lg border border-border bg-bg"
				>
					<img
						src={story.imageUrl}
						alt=""
						loading="lazy"
						class="h-full w-full object-cover"
						onerror={() => {
							imgLoadFailed = true;
						}}
					/>
				</div>
			{/if}
		</div>
	{:else}
		<!--
			Compact: image at top (when present) as a 16:9 banner, then
			text below. Same image-failure fallback as featured.
		-->
		{#if showImage}
			<div class="aspect-[16/9] w-full overflow-hidden border-b border-border bg-bg">
				<img
					src={story.imageUrl}
					alt=""
					loading="lazy"
					class="h-full w-full object-cover"
					onerror={() => {
						imgLoadFailed = true;
					}}
				/>
			</div>
		{/if}
		<div class="flex flex-col p-5">
			<div class="mb-3 flex items-center gap-3">
				<span class="eyebrow rounded-full px-2.5 py-1 {tagStyle.bg} {tagStyle.text}">
					{tagStyle.label}
				</span>
				<span class="text-xs text-muted">{story.timestamp}</span>
			</div>

			<h2 class="mb-3 text-[17px] font-bold leading-snug text-ink">
				{story.headline}
			</h2>

			<p class="mb-4 line-clamp-2 text-[13px] leading-snug text-muted">
				{story.excerpt}
			</p>

			<div class="mt-auto flex items-center gap-2">
				{#if isMultiSource}
					<span class="eyebrow text-muted">{story.sourceCount} sources</span>
				{:else}
					<span class="eyebrow text-muted">via {story.sources[0] ?? 'CoinDesk'}</span>
				{/if}
			</div>
		</div>
	{/if}
</a>
