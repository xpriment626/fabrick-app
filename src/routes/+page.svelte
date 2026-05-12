<script lang="ts">
	import TopNav from '$lib/components/TopNav.svelte';
	import ResearchCard from '$lib/components/ResearchCard.svelte';
	import ChatInput from '$lib/components/ChatInput.svelte';
	import MarketTile from '$lib/components/MarketTile.svelte';
	import WalletPreview from '$lib/components/WalletPreview.svelte';
	import TrendingPanel from '$lib/components/TrendingPanel.svelte';
	import type { PageData } from './$types';

	type Props = { data: PageData };
	let { data }: Props = $props();
</script>

<TopNav active="research" />

<main class="mx-auto max-w-[1280px] px-10 py-8">
	<div class="grid grid-cols-[1fr_320px] gap-8">
		<!-- Main column -->
		<div class="flex flex-col gap-6">
			<!-- Page header: title + subtitle on left, ChatInput baseline-aligned on right -->
			<header class="flex items-end justify-between">
				<div class="flex flex-col gap-1.5">
					<h1 class="text-ink text-[36px] font-extrabold tracking-[-0.04em]">Today on Solana</h1>
					<p class="text-muted text-[15px]">
						Specialized agents tracking the ecosystem in real time
					</p>
				</div>
				<ChatInput />
			</header>

			<ResearchCard story={data.featuredStory} variant="featured" />

			<div class="grid grid-cols-3 gap-4">
				{#each data.secondaryStories as story (story.id)}
					<ResearchCard {story} />
				{/each}
			</div>

			<div class="flex gap-3">
				{#each data.marketTickers as ticker (ticker.ticker)}
					<MarketTile data={ticker} />
				{/each}
			</div>
		</div>

		<!--
			Side rail. The pt-[39px] offset pulls the wallet card down so its
			top aligns with the ChatInput's top in the header (ChatInput is
			items-end aligned within an 83px-tall header, sitting 39px from
			the header top). Keeps the featured card and rest of the left
			column at their original vertical position.
		-->
		<div class="flex flex-col gap-4 pt-[39px]">
			<WalletPreview wallet={data.walletSnapshot} />
			<TrendingPanel protocols={data.trendingProtocols} />
		</div>
	</div>
</main>
