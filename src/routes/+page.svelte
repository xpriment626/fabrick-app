<script lang="ts">
	import ResearchCard from '$lib/components/ResearchCard.svelte';
	import WalletPreview from '$lib/components/WalletPreview.svelte';
	import TrendingPanel from '$lib/components/TrendingPanel.svelte';
	import type { PageData } from './$types';

	type Props = { data: PageData };
	let { data }: Props = $props();
</script>

<main class="mx-auto max-w-[1280px] px-10 py-8">
	<div class="grid grid-cols-[1fr_320px] gap-8">
		<!-- Main column — editorial layout: 1 featured + 3 secondary + 3 extra. -->
		<div class="flex flex-col gap-6">
			<!-- Page header. §17: News is the ambient lobby — no composer here.
			     A conversation starts by opening a story. -->
			<header class="flex items-end justify-between">
				<div class="flex flex-col gap-1.5">
					<h1 class="text-ink text-[36px] font-extrabold tracking-[-0.04em]">Today on Solana</h1>
					<p class="text-muted text-[15px]">
						Specialized agents tracking the ecosystem in real time
					</p>
				</div>
			</header>

			<ResearchCard story={data.featuredStory} variant="featured" />

			<div class="grid grid-cols-3 gap-4">
				{#each data.secondaryStories as story (story.id)}
					<ResearchCard {story} />
				{/each}
			</div>

			{#if data.extraStories.length > 0}
				<div class="grid grid-cols-3 gap-4">
					{#each data.extraStories as story (story.id)}
						<ResearchCard {story} />
					{/each}
				</div>
			{/if}
		</div>

		<!-- Side rail. Aligns to the top of the main column (the header
		     composer it used to offset against was removed in §17). -->
		<div class="flex flex-col gap-4">
			<WalletPreview wallet={data.walletSnapshot} />
			<TrendingPanel protocols={data.trendingProtocols} />
		</div>
	</div>
</main>
