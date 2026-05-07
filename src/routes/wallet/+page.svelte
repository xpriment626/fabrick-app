<script lang="ts">
	import TopNav from '$lib/components/TopNav.svelte';
	import type { PageData } from './$types';

	type Props = { data: PageData };
	let { data }: Props = $props();

	const wallet = $derived(data.walletSnapshot);

	const actions = [
		{ label: 'Buy', icon: 'dollar' },
		{ label: 'Swap', icon: 'swap' },
		{ label: 'Send', icon: 'send' },
		{ label: 'Receive', icon: 'receive' }
	] as const;

	const tabs = ['Tokens', 'DeFi', 'NFTs', 'Activity'] as const;
	let activeTab = $state<(typeof tabs)[number]>('Tokens');
</script>

<TopNav active="wallet" />

<main class="mx-auto max-w-[720px] px-10 py-12">
	<!-- Total balance block -->
	<section class="mb-10 flex flex-col items-center gap-1">
		<div class="eyebrow text-muted">Total balance</div>
		<div class="text-[56px] font-extrabold tracking-[-0.05em] text-ink">
			{wallet.balanceUsd}
		</div>
		<div
			class="text-sm font-medium {wallet.deltaTodayPct > 0
				? 'text-positive'
				: wallet.deltaTodayPct < 0
					? 'text-negative'
					: 'text-muted'}"
		>
			{wallet.deltaToday} ({wallet.deltaTodayPct.toFixed(2)}%) today
		</div>
	</section>

	<!-- Action tiles -->
	<section class="mb-10 grid grid-cols-4 gap-3">
		{#each actions as action (action.label)}
			<button
				type="button"
				disabled
				class="flex cursor-not-allowed flex-col items-center gap-2 rounded-[14px] border border-border bg-surface px-4 py-5 text-ink opacity-90 transition-opacity hover:opacity-100"
			>
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					{#if action.icon === 'dollar'}
						<line x1="12" y1="2" x2="12" y2="22" />
						<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
					{:else if action.icon === 'swap'}
						<path d="M3 7h13l-3-3" />
						<path d="M21 17H8l3 3" />
					{:else if action.icon === 'send'}
						<path d="m22 2-7 20-4-9-9-4Z" />
						<path d="M22 2 11 13" />
					{:else if action.icon === 'receive'}
						<path d="M12 5v14" />
						<path d="m19 12-7 7-7-7" />
					{/if}
				</svg>
				<span class="text-sm font-semibold">{action.label}</span>
			</button>
		{/each}
	</section>

	<!-- Tab strip -->
	<section class="mb-6 flex gap-6 border-b border-border">
		{#each tabs as tab (tab)}
			<button
				type="button"
				onclick={() => (activeTab = tab)}
				class="pb-3 text-sm font-semibold transition-colors {activeTab === tab
					? 'border-b-2 border-ink text-ink -mb-px'
					: 'text-muted hover:text-ink'}"
			>
				{tab}
			</button>
		{/each}
	</section>

	<!-- Tab content -->
	{#if activeTab === 'Tokens'}
		<section class="flex flex-col">
			{#each wallet.tokens as token (token.symbol)}
				<div class="flex items-center gap-4 border-b border-border py-4 last:border-b-0">
					<span
						class="flex h-9 w-9 items-center justify-center rounded-full bg-bg text-sm font-bold text-ink"
					>
						{token.symbol.charAt(0)}
					</span>
					<div class="flex flex-1 flex-col">
						<span class="text-[15px] font-semibold text-ink">{token.symbol}</span>
						<span class="text-xs text-muted">{token.name}</span>
					</div>
					<div class="text-xs text-muted">{token.amount}</div>
					<div class="flex w-24 flex-col items-end">
						<span class="text-[15px] font-bold text-ink">{token.usdValue}</span>
						<span
							class="text-xs font-medium {token.deltaPct > 0
								? 'text-positive'
								: token.deltaPct < 0
									? 'text-negative'
									: 'text-muted'}"
						>
							{token.deltaPct > 0 ? '+' : ''}{token.deltaPct.toFixed(2)}%
						</span>
					</div>
				</div>
			{/each}
		</section>
	{:else}
		<section class="flex h-40 items-center justify-center text-sm text-muted">
			Coming soon
		</section>
	{/if}

	<!-- Connectors empty state -->
	<section
		class="mt-12 rounded-card border border-dashed border-border bg-transparent p-6"
	>
		<div class="eyebrow mb-2 text-muted">Coming soon</div>
		<h3 class="mb-1.5 text-[17px] font-bold text-ink">Connectors</h3>
		<p class="text-[13px] leading-relaxed text-muted">
			Add policy-scoped agent signers to let Fabrick agents act on your behalf within Drift,
			Jupiter, Marginfi, and more.
		</p>
	</section>
</main>
