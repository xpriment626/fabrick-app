<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import type {
		OpportunityCard,
		SavingsAccountRecord,
		SavingsCatalogue
	} from '$lib/savings/types';
	import AgentSigningCard from '$lib/components/AgentSigningCard.svelte';
	import SavingsCard from '$lib/components/SavingsCard.svelte';
	import ReceiveModal from '$lib/components/ReceiveModal.svelte';
	import SendModal from '$lib/components/SendModal.svelte';
	import SeniorBuilder from '$lib/components/SeniorBuilder.svelte';
	import SeniorAllocationCard from '$lib/components/SeniorAllocationCard.svelte';

	type Props = { data: PageData };
	let { data }: Props = $props();

	const wallet = $derived(data.walletSnapshot);

	// --- Savings accounts + create-account gate (§20 Slice 2) -------------------
	// Accounts = SSR-loaded (data) + any created this session (extraAccounts),
	// derived so we don't freeze a snapshot of the reactive `data` prop.
	let extraAccounts = $state<SavingsAccountRecord[]>([]);
	const accounts = $derived<SavingsAccountRecord[]>([
		...extraAccounts,
		...(data.savingsAccounts ?? [])
	]);
	let creating = $state<null | 'choosing' | 'senior'>(null);
	let juniorBusy = $state(false);
	let createError = $state<string | null>(null);

	const hasJunior = $derived(accounts.some((a) => a.type === 'junior'));
	const seniorAccounts = $derived(accounts.filter((a) => a.type === 'senior'));

	async function createJunior() {
		if (juniorBusy) return;
		juniorBusy = true;
		createError = null;
		try {
			const res = await fetch('/api/savings/accounts', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ type: 'junior' })
			});
			const body = await res.json();
			if (!res.ok || !body?.account) throw new Error(body?.message ?? `create failed (${res.status})`);
			extraAccounts = [body.account as SavingsAccountRecord, ...extraAccounts];
			creating = null;
		} catch (err) {
			createError = err instanceof Error ? err.message : String(err);
		} finally {
			juniorBusy = false;
		}
	}

	function onSeniorProposed(account: SavingsAccountRecord) {
		extraAccounts = [account, ...extraAccounts];
		creating = null;
	}

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

		<!-- Savings accounts (§20 Slice 2) — create-account gate -->
		<section class="mb-10">
			{#if creating === 'choosing'}
				<!-- Junior vs Senior choice -->
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-[15px] font-bold text-ink">Create a savings account</h2>
					<button type="button" onclick={() => (creating = null)} class="text-[13px] text-muted hover:text-ink">
						Cancel
					</button>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<button
						type="button"
						onclick={createJunior}
						disabled={juniorBusy}
						class="flex flex-col items-start gap-2 rounded-card border border-border bg-surface p-5 text-left transition-colors hover:border-ink disabled:opacity-50"
					>
						<span class="text-[15px] font-bold text-ink">Junior</span>
						<span class="text-[12.5px] leading-relaxed text-muted">
							One-click into a single blue-chip pool (Main Market USDC or SOL). The simplest save.
						</span>
						<span class="mt-1 text-[12px] font-semibold text-ink">{juniorBusy ? 'Creating…' : 'Create junior →'}</span>
					</button>
					<button
						type="button"
						onclick={() => (creating = 'senior')}
						class="flex flex-col items-start gap-2 rounded-card border border-border bg-surface p-5 text-left transition-colors hover:border-ink"
					>
						<span class="text-[15px] font-bold text-ink">Senior</span>
						<span class="text-[12.5px] leading-relaxed text-muted">
							Compose multiple pools; Fabrick's agents propose a custom weighting + rebalancing strategy.
						</span>
						<span class="mt-1 text-[12px] font-semibold text-ink">Compose senior →</span>
					</button>
				</div>
				{#if createError}<p class="mt-3 text-[12px] text-negative">{createError}</p>{/if}
			{:else if creating === 'senior'}
				{#if catalogue}
					<SeniorBuilder {catalogue} onProposed={onSeniorProposed} onCancel={() => (creating = null)} />
				{:else}
					<div class="rounded-card border border-border bg-surface p-6 text-[13px] text-muted">
						Loading catalogue…
					</div>
				{/if}
			{:else if accounts.length === 0}
				<!-- No savings account yet → create gate -->
				<div
					class="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center"
				>
					<div class="text-[17px] font-bold text-ink">No savings account yet</div>
					<p class="max-w-[380px] text-[13px] leading-relaxed text-muted">
						Open a savings account to start earning on your SOL or USDC — a simple one-click pool, or a
						custom multi-pool strategy composed by Fabrick's agents.
					</p>
					<button
						type="button"
						onclick={() => (creating = 'choosing')}
						class="mt-1 rounded-[10px] bg-ink px-5 py-2.5 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90"
					>
						Create savings account
					</button>
				</div>
			{:else}
				<!-- Existing accounts -->
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-[15px] font-bold text-ink">Your savings</h2>
					<button
						type="button"
						onclick={() => (creating = 'choosing')}
						class="text-[12.5px] font-semibold text-ink underline-offset-2 hover:underline"
					>
						+ New account
					</button>
				</div>

				{#each seniorAccounts as acct (acct.id)}
					{#if acct.proposedAllocation}
						<div class="mb-4">
							<SeniorAllocationCard
								allocation={acct.proposedAllocation}
								intendedAmountUsd={acct.config?.intendedAmountUsd}
								riskPreference={acct.config?.riskPreference}
							/>
						</div>
					{/if}
				{/each}

				{#if hasJunior}
					<div class="mb-2 flex items-baseline justify-between">
						<h3 class="text-[14px] font-semibold text-ink">Junior · one-click pools</h3>
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
							Couldn't load the catalogue.
						</div>
					{:else if catalogue}
						<div class="grid grid-cols-2 gap-4">
							{#each catalogue.defaults as card (card.id)}
								<SavingsCard {card} variant="default" onDeposit={openDeposit} />
							{/each}
						</div>
						<div class="mt-6">
							<button
								type="button"
								onclick={() => (showDiscover = !showDiscover)}
								class="flex w-full items-center justify-between border-b border-border pb-3 text-left"
							>
								<span class="text-[14px] font-bold text-ink">Browse rates</span>
								<span class="text-[12.5px] font-medium text-muted">
									{browseCards.length} more opportunities · {showDiscover ? 'Hide' : 'Discover'}
								</span>
							</button>
							{#if showDiscover}
								<div class="mt-4 flex flex-col gap-2.5">
									{#each browseCards as card (card.id)}
										<SavingsCard {card} variant="browse" />
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				{/if}
			{/if}
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

		<!-- Advanced — autonomous agent signing (deferred execution slice) -->
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
