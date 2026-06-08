<script lang="ts">
	import { goto } from '$app/navigation';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import SavingsCard from '$lib/components/SavingsCard.svelte';
	import WalletPreview from '$lib/components/WalletPreview.svelte';
	import type { OpportunityCard } from '$lib/savings/types';
	import type { PageData } from './$types';

	type Props = { data: PageData };
	let { data }: Props = $props();
	let loginOpen = $state(false);

	const browseCards = $derived<OpportunityCard[]>(
		data.catalogue ? [...data.catalogue.lend, ...data.catalogue.earn] : []
	);

	function openWallet(_card: OpportunityCard) {
		void goto('/wallet');
	}
</script>

<main class="mx-auto grid max-w-[1120px] grid-cols-1 gap-8 px-10 py-10 lg:grid-cols-[minmax(0,1fr)_300px]">
	<section class="min-w-0 flex flex-col gap-7">
		<header class="flex items-end justify-between gap-4 border-b border-border pb-5">
			<div>
				<h1 class="text-[32px] font-extrabold tracking-[-0.04em] text-ink">USDC Savings</h1>
				<p class="mt-1 text-[14px] text-muted">Canonical Solana USDC · Savings MCP</p>
			</div>
			<a
				href="/wallet"
				class="rounded-[10px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90"
			>
				Open wallet
			</a>
		</header>

		{#if data.catalogue}
			<section>
				<div class="mb-3 flex items-baseline justify-between">
					<h2 class="text-[15px] font-bold text-ink">Primary opportunities</h2>
					<span class="text-[12px] text-muted">{data.catalogue.counts.total} live cards</span>
				</div>
				{#if data.catalogue.defaults.length}
					<div class="grid grid-cols-1 gap-4">
						{#each data.catalogue.defaults as card (card.id)}
							<SavingsCard {card} variant="default" onDeposit={openWallet} />
						{/each}
					</div>
				{:else}
					<div class="rounded-card border border-border bg-surface p-6 text-[13px] text-muted">
						No deposit-ready USDC opportunity is available from the current Savings MCP snapshot.
					</div>
				{/if}
			</section>

			<section>
				<div class="mb-3 flex items-baseline justify-between">
					<h2 class="text-[15px] font-bold text-ink">Browse USDC rates</h2>
					<span class="text-[12px] text-muted">
						Generated {new Date(data.catalogue.generatedAt).toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit'
						})}
					</span>
				</div>
				<div class="flex flex-col gap-2.5">
					{#each browseCards as card (card.id)}
						<SavingsCard {card} variant="browse" />
					{/each}
				</div>
			</section>
		{:else}
			<section class="rounded-card border border-border bg-surface p-6">
				<div class="text-[15px] font-bold text-ink">Savings MCP unavailable</div>
				<p class="mt-1 text-[13px] text-muted">{data.catalogueError}</p>
			</section>
		{/if}
	</section>

	<aside class="min-w-0 flex flex-col gap-4">
		{#if data.user && data.walletSnapshot}
			<WalletPreview wallet={data.walletSnapshot} />
			<a
				href="/wallet"
				class="rounded-card border border-border bg-surface p-5 text-[13px] font-semibold text-ink transition-colors hover:bg-bg"
			>
				Manage savings account
			</a>
		{:else if data.user}
			<section class="rounded-card border border-border bg-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
				<div class="eyebrow mb-3 text-muted">Wallet</div>
				<h2 class="text-[22px] font-extrabold leading-tight tracking-[-0.03em] text-ink">
					Wallet provisioning
				</h2>
				<p class="mt-2 text-[13px] leading-relaxed text-muted">
					Your Fabrick session is active, but the embedded Solana wallet is not ready yet.
				</p>
				<a
					href="/wallet"
					class="mt-5 inline-flex w-full items-center justify-center rounded-[10px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90"
				>
					Check wallet
				</a>
			</section>
		{:else}
			<section class="rounded-card border border-border bg-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
				<div class="eyebrow mb-3 text-muted">Wallet</div>
				<h2 class="text-[22px] font-extrabold leading-tight tracking-[-0.03em] text-ink">
					Sign in to view your wallet
				</h2>
				<p class="mt-2 text-[13px] leading-relaxed text-muted">
					Browse live USDC opportunities here, then sign in to provision your embedded wallet and create savings accounts.
				</p>
				<button
					type="button"
					onclick={() => (loginOpen = true)}
					class="mt-5 w-full rounded-[10px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90"
				>
					Sign in
				</button>
			</section>
		{/if}
	</aside>
</main>

<LoginModal bind:open={loginOpen} onClose={() => (loginOpen = false)} />
