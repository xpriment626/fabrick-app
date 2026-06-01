<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import type { OpportunityCard, SavingsCatalogue } from '$lib/savings/types';
	import AgentSigningCard from '$lib/components/AgentSigningCard.svelte';
	import SavingsCard from '$lib/components/SavingsCard.svelte';
	import ReceiveModal from '$lib/components/ReceiveModal.svelte';
	import SendModal from '$lib/components/SendModal.svelte';

	type Props = { data: PageData };
	let { data }: Props = $props();

	const wallet = $derived(data.walletSnapshot);

	// Wallet-standard Deposit (receive: QR + copy) / Withdraw (send: recipient).
	let walletModal = $state<'receive' | 'send' | null>(null);

	// --- Savings catalogue (design §20) — public, fund-independent, client-fetched.
	let catalogue = $state<SavingsCatalogue | null>(null);
	let catState = $state<'loading' | 'loaded' | 'error'>('loading');
	let showDiscover = $state(false);

	const browseCards = $derived<OpportunityCard[]>(
		catalogue ? [...catalogue.lend, ...catalogue.earn, ...catalogue.multiply] : []
	);

	onMount(async () => {
		try {
			const res = await fetch('/api/savings/catalogue');
			if (!res.ok) throw new Error(String(res.status));
			catalogue = (await res.json()) as SavingsCatalogue;
			catState = 'loaded';
		} catch {
			catState = 'error';
		}
	});

	// --- Deposit flow (Slice 1: Main Market reserve supply; simulate-only) -------
	type DepositPhase = 'idle' | 'simulating' | 'ready' | 'error';
	let depositTarget = $state<OpportunityCard | null>(null);
	let depositAmount = $state('1');
	let depositPhase = $state<DepositPhase>('idle');
	let depositMsg = $state<string | null>(null);

	function openDeposit(card: OpportunityCard) {
		depositTarget = card;
		depositAmount = card.asset === 'USDC' ? '1' : '0.05';
		depositPhase = 'idle';
		depositMsg = null;
	}
	function closeDeposit() {
		depositTarget = null;
	}

	async function simulateDeposit() {
		if (!depositTarget) return;
		depositPhase = 'simulating';
		depositMsg = null;
		try {
			const res = await fetch('/api/savings/deposit/simulate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					reserve: depositTarget.refs.reserve,
					market: depositTarget.refs.market,
					assetMint: depositTarget.refs.assetMint,
					asset: depositTarget.asset,
					amount: depositAmount
				})
			});
			const body = await res.json();
			if (!res.ok || body?.ok === false) {
				depositPhase = 'error';
				depositMsg = body?.error ?? `simulate failed (${res.status})`;
				return;
			}
			depositPhase = 'ready';
			depositMsg = body?.message ?? 'Deposit simulated successfully on mainnet.';
		} catch (err) {
			depositPhase = 'error';
			depositMsg = err instanceof Error ? err.message : String(err);
		}
	}

	// --- Cluster toggle (§18): Mainnet (savings-first) ↔ Devnet (signing test). --
	type DevnetToken = { mint: string; uiAmount: number; decimals: number };
	type DevnetBalance = { address: string; lamports: number; sol: number; tokens: DevnetToken[] };

	const clusters = ['mainnet', 'devnet'] as const;
	let cluster = $state<'mainnet' | 'devnet'>('mainnet');
	let devnetState = $state<'idle' | 'loading' | 'loaded' | 'error'>('idle');
	let devnet = $state<DevnetBalance | null>(null);
	let devnetError = $state<string | null>(null);
	let copied = $state(false);

	const DEVNET_MINTS: Record<string, string> = {
		'4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': 'USDC'
	};
	function tokenLabel(mint: string): string {
		return DEVNET_MINTS[mint] ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`;
	}
	const explorerUrl = $derived(
		`https://explorer.solana.com/address/${wallet.addressFull}?cluster=devnet`
	);

	async function loadDevnet(force = false) {
		if (devnetState === 'loading') return;
		if (devnetState === 'loaded' && !force) return;
		devnetState = 'loading';
		devnetError = null;
		try {
			const res = await fetch('/api/wallet/devnet');
			if (!res.ok) throw new Error(`${res.status}`);
			devnet = (await res.json()) as DevnetBalance;
			devnetState = 'loaded';
		} catch (err) {
			devnetError = err instanceof Error ? err.message : String(err);
			devnetState = 'error';
		}
	}
	function setCluster(next: 'mainnet' | 'devnet') {
		cluster = next;
		if (next === 'devnet' && devnetState === 'idle') void loadDevnet();
	}
	async function copyAddress() {
		try {
			await navigator.clipboard.writeText(wallet.addressFull);
			copied = true;
			setTimeout(() => (copied = false), 1400);
		} catch {
			/* clipboard blocked */
		}
	}

	const tabs = ['Portfolio', 'Collectibles'] as const;
	let activeTab = $state<(typeof tabs)[number]>('Portfolio');
</script>

<main class="mx-auto max-w-[760px] px-10 py-12">
	<!-- Header: savings title + cluster toggle (dev affordance) -->
	<div class="mb-8 flex items-center justify-between">
		<h1 class="text-[22px] font-bold tracking-[-0.02em] text-ink">Savings</h1>
		<div class="inline-flex items-center rounded-pill border border-border bg-surface p-1">
			{#each clusters as c (c)}
				<button
					type="button"
					onclick={() => setCluster(c)}
					class="rounded-pill px-3 py-1 text-[12px] font-semibold capitalize transition-colors {cluster ===
					c
						? c === 'devnet'
							? 'bg-warning text-surface'
							: 'bg-ink text-surface'
						: 'text-muted hover:text-ink'}"
				>
					{c}
				</button>
			{/each}
		</div>
	</div>

	{#if cluster === 'mainnet'}
		<!-- Balance -->
		<section class="mb-6 flex flex-col items-center gap-1">
			<div class="eyebrow text-muted">Total balance</div>
			<div class="text-[48px] font-extrabold tracking-[-0.05em] text-ink">{wallet.balanceUsd}</div>
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

		<!-- Deposit (receive: QR + copy) / Withdraw (send: recipient) — wallet standards -->
		<section class="mb-10 grid grid-cols-2 gap-3">
			<button
				type="button"
				onclick={() => (walletModal = 'receive')}
				class="rounded-[12px] bg-ink px-4 py-3 text-[14px] font-semibold text-surface transition-opacity hover:opacity-90"
			>
				Deposit
			</button>
			<button
				type="button"
				onclick={() => (walletModal = 'send')}
				class="rounded-[12px] border border-border bg-surface px-4 py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-bg"
			>
				Withdraw
			</button>
		</section>

		<!-- Your savings (the two Main Market one-click defaults) -->
		<section class="mb-10">
			<div class="mb-3 flex items-baseline justify-between">
				<h2 class="text-[15px] font-bold text-ink">Your savings options</h2>
				<span class="text-[12px] text-muted">SOL + USDC · pre-curated</span>
			</div>

			{#if catState === 'loading'}
				<div class="grid grid-cols-2 gap-4">
					{#each [0, 1] as i (i)}
						<div class="h-[188px] animate-pulse rounded-card border border-border bg-surface"></div>
					{/each}
				</div>
			{:else if catState === 'error'}
				<div class="rounded-card border border-border bg-surface p-6 text-[13px] text-negative">
					Couldn't load the savings catalogue. Refresh to retry.
				</div>
			{:else if catalogue}
				<div class="grid grid-cols-2 gap-4">
					{#each catalogue.defaults as card (card.id)}
						<SavingsCard {card} variant="default" onDeposit={openDeposit} />
					{/each}
				</div>
			{/if}

			<div class="mt-3 flex gap-3">
				<button
					type="button"
					disabled
					class="flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-[12.5px] font-semibold text-muted"
				>
					Manage savings accounts — soon
				</button>
				<button
					type="button"
					disabled
					class="flex-1 rounded-[10px] border border-dashed border-border bg-transparent px-3 py-2 text-[12.5px] font-semibold text-muted"
				>
					+ Create savings account — soon
				</button>
			</div>
		</section>

		<!-- Portfolio / Collectibles -->
		<section class="mb-6 flex gap-6 border-b border-border">
			{#each tabs as tab (tab)}
				<button
					type="button"
					onclick={() => (activeTab = tab)}
					class="pb-3 text-sm font-semibold transition-colors {activeTab === tab
						? '-mb-px border-b-2 border-ink text-ink'
						: 'text-muted hover:text-ink'}"
				>
					{tab}
				</button>
			{/each}
		</section>

		{#if activeTab === 'Portfolio'}
			<section class="mb-10 flex flex-col">
				{#if wallet.tokens.length}
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
				{:else}
					<div class="flex h-32 items-center justify-center text-sm text-muted">
						No holdings yet — deposit into a savings option to get started.
					</div>
				{/if}
			</section>
		{:else}
			<section class="mb-10 flex h-32 items-center justify-center text-sm text-muted">
				Collectibles — coming soon
			</section>
		{/if}

		<!-- Browse rates / Discover -->
		<section class="mb-10">
			<button
				type="button"
				onclick={() => (showDiscover = !showDiscover)}
				class="flex w-full items-center justify-between border-b border-border pb-3 text-left"
			>
				<span class="text-[15px] font-bold text-ink">Browse rates</span>
				<span class="text-[12.5px] font-medium text-muted">
					{catalogue ? `${browseCards.length} more opportunities` : ''} · {showDiscover ? 'Hide' : 'Discover'}
				</span>
			</button>

			{#if showDiscover}
				<div class="mt-4 flex flex-col gap-2.5">
					{#if catState === 'loaded' && catalogue}
						{#each browseCards as card (card.id)}
							<SavingsCard {card} variant="browse" />
						{/each}
					{:else if catState === 'loading'}
						<div class="py-6 text-center text-[13px] text-muted">Loading opportunities…</div>
					{/if}
				</div>
			{/if}
		</section>

		<!-- Advanced — autonomous agent signing (Slice 2 / senior accounts) -->
		<section class="mt-2">
			<div class="eyebrow mb-3 text-muted">Advanced</div>
			<AgentSigningCard
				authKeyId={data.agentSigning.authKeyId}
				policyId={data.agentSigning.policyId}
			/>
		</section>
	{:else}
		<!-- Devnet panel — test-environment balance for the signing ladder (§18). -->
		<section class="mb-8 flex flex-col items-center gap-2">
			<div class="flex items-center gap-2">
				<span class="eyebrow text-muted">Devnet balance</span>
				<span
					class="rounded-pill bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning"
				>
					Test
				</span>
			</div>

			{#if devnetState === 'loading'}
				<div class="text-[44px] font-extrabold tracking-[-0.05em] text-muted">···</div>
				<div class="text-sm text-muted">Fetching devnet balance…</div>
			{:else if devnetState === 'error'}
				<div class="text-[44px] font-extrabold tracking-[-0.05em] text-negative">—</div>
				<div class="text-sm text-negative">Couldn't load devnet balance ({devnetError})</div>
				<button
					type="button"
					onclick={() => loadDevnet(true)}
					class="mt-1 text-[13px] font-semibold text-ink underline underline-offset-2"
				>
					Retry
				</button>
			{:else if devnet}
				<div class="flex items-baseline gap-2 text-[56px] font-extrabold tracking-[-0.05em] text-ink">
					{devnet.sol.toLocaleString(undefined, { maximumFractionDigits: 4 })}
					<span class="text-2xl font-bold text-muted">SOL</span>
				</div>
				<div class="text-sm text-muted">Test SOL — no real value</div>
			{/if}
		</section>

		{#if devnetState === 'loaded' && devnet}
			<section
				class="mb-4 flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-5"
			>
				<div class="flex flex-col">
					<span class="eyebrow mb-1 text-muted">Wallet</span>
					<span class="font-mono text-[13px] text-ink">
						{wallet.addressFull.slice(0, 6)}…{wallet.addressFull.slice(-6)}
					</span>
				</div>
				<div class="flex items-center gap-2">
					<button
						type="button"
						onclick={copyAddress}
						class="rounded-[10px] border border-border px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-bg"
					>
						{copied ? 'Copied' : 'Copy'}
					</button>
					<a
						href={explorerUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="rounded-[10px] border border-border px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-bg"
					>
						Explorer ↗
					</a>
				</div>
			</section>

			<section class="mb-4 rounded-card border border-border bg-surface p-2">
				{#if devnet.tokens.length}
					{#each devnet.tokens as t (t.mint)}
						<div class="flex items-center gap-4 border-b border-border px-3 py-3 last:border-b-0">
							<span
								class="flex h-9 w-9 items-center justify-center rounded-full bg-bg text-sm font-bold text-ink"
							>
								{tokenLabel(t.mint).charAt(0)}
							</span>
							<div class="flex flex-1 flex-col">
								<span class="text-[15px] font-semibold text-ink">{tokenLabel(t.mint)}</span>
								<span class="font-mono text-[11px] text-muted">{t.mint.slice(0, 8)}…</span>
							</div>
							<div class="text-[15px] font-bold text-ink">
								{t.uiAmount.toLocaleString(undefined, { maximumFractionDigits: t.decimals })}
							</div>
						</div>
					{/each}
				{:else}
					<div class="flex h-16 items-center justify-center text-[13px] text-muted">
						No SPL tokens on devnet yet
					</div>
				{/if}
			</section>

			<div class="flex items-center justify-between gap-3 px-1">
				<a
					href="https://faucet.solana.com/"
					target="_blank"
					rel="noopener noreferrer"
					class="text-[12.5px] font-medium text-muted hover:text-ink"
				>
					Need test SOL? Solana faucet ↗
				</a>
				<button
					type="button"
					onclick={() => loadDevnet(true)}
					class="text-[12.5px] font-semibold text-ink underline-offset-2 hover:underline"
				>
					Refresh
				</button>
			</div>
		{/if}
	{/if}
</main>

<!-- Wallet-standard Deposit (receive) / Withdraw (send) -->
{#if walletModal === 'receive'}
	<ReceiveModal address={wallet.addressFull} onClose={() => (walletModal = null)} />
{:else if walletModal === 'send'}
	<SendModal owner={wallet.addressFull} onClose={() => (walletModal = null)} />
{/if}

<!-- Savings deposit modal (Slice 1: Main Market reserve supply, simulate-only) -->
{#if depositTarget}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
		role="button"
		tabindex="-1"
		onclick={closeDeposit}
		onkeydown={(e) => e.key === 'Escape' && closeDeposit()}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="w-full max-w-[400px] rounded-card border border-border bg-surface p-6 shadow-card"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="mb-1 flex items-center justify-between">
				<h3 class="text-[17px] font-bold text-ink">Deposit {depositTarget.asset}</h3>
				<button type="button" onclick={closeDeposit} class="text-[13px] text-muted hover:text-ink"
					>Close</button
				>
			</div>
			<p class="mb-4 text-[12.5px] text-muted">
				{depositTarget.venue} · {(depositTarget.apy * 100).toFixed(2)}% APY
			</p>

			<label class="mb-1.5 block text-[12px] font-semibold text-muted" for="dep-amt">Amount</label>
			<div class="mb-4 flex items-center gap-2 rounded-[10px] border border-border px-3 py-2.5">
				<input
					id="dep-amt"
					bind:value={depositAmount}
					inputmode="decimal"
					class="w-full bg-transparent text-[15px] font-semibold text-ink outline-none"
				/>
				<span class="text-[13px] font-semibold text-muted">{depositTarget.asset}</span>
			</div>

			<button
				type="button"
				onclick={simulateDeposit}
				disabled={depositPhase === 'simulating'}
				class="w-full rounded-[10px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{depositPhase === 'simulating' ? 'Simulating…' : 'Review deposit'}
			</button>

			{#if depositPhase === 'ready'}
				<p class="mt-3 rounded-[8px] bg-positive/10 px-3 py-2 text-[12px] text-positive">
					✓ {depositMsg}
				</p>
			{:else if depositPhase === 'error'}
				<p class="mt-3 rounded-[8px] bg-negative/10 px-3 py-2 text-[12px] text-negative">
					{depositMsg}
				</p>
			{:else}
				<p class="mt-3 text-[11.5px] text-muted">
					We simulate the on-chain deposit first — no funds move until you confirm.
				</p>
			{/if}
		</div>
	</div>
{/if}
