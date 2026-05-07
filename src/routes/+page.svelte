<script lang="ts">
	import TopNav from '$lib/components/TopNav.svelte';
	import ResearchCard from '$lib/components/ResearchCard.svelte';
	import ChatInput from '$lib/components/ChatInput.svelte';
	import MarketTile from '$lib/components/MarketTile.svelte';
	import WalletPreview from '$lib/components/WalletPreview.svelte';
	import TrendingPanel from '$lib/components/TrendingPanel.svelte';
	import {
		featuredStory,
		secondaryStories,
		marketTickers,
		walletSnapshot,
		trendingTopics
	} from '$lib/placeholder-data';
</script>

<TopNav active="research" />

<main class="mx-auto max-w-[1280px] px-10 py-8">
	<div class="grid grid-cols-[1fr_320px] gap-8">
		<!-- Main column -->
		<div class="flex flex-col gap-6">
			<!-- Page header -->
			<header class="flex items-end justify-between">
				<div class="flex flex-col gap-1.5">
					<h1 class="text-[36px] font-extrabold tracking-[-0.04em] text-ink">Today on Solana</h1>
					<p class="text-[15px] text-muted">
						Specialized agents tracking the ecosystem in real time
					</p>
				</div>
				<ChatInput />
			</header>

			<!-- Featured research card -->
			<ResearchCard story={featuredStory} variant="featured" />

			<!-- Secondary cards -->
			<div class="grid grid-cols-3 gap-4">
				{#each secondaryStories as story (story.id)}
					<ResearchCard {story} />
				{/each}
			</div>

			<!-- Market tile strip -->
			<div class="flex gap-3">
				{#each marketTickers as ticker (ticker.ticker)}
					<MarketTile data={ticker} />
				{/each}
			</div>
		</div>

		<!-- Side rail -->
		<div class="flex flex-col gap-4">
			<WalletPreview wallet={walletSnapshot} />
			<TrendingPanel topics={trendingTopics} />
		</div>
	</div>
</main>
