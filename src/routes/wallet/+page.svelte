<script lang="ts">
	import type { PageData } from './$types';
	import AgentSigningCard from '$lib/components/AgentSigningCard.svelte';

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

	// --- Cluster toggle (§18) -------------------------------------------------
	// Mainnet view is SSR-loaded (Helius v0 REST = mainnet-only). Devnet is lazy:
	// fetched once, the first time the user flips the toggle, from /api/wallet/devnet.
	type DevnetToken = { mint: string; uiAmount: number; decimals: number };
	type DevnetBalance = { address: string; lamports: number; sol: number; tokens: DevnetToken[] };

	const clusters = ['mainnet', 'devnet'] as const;
	let cluster = $state<'mainnet' | 'devnet'>('mainnet');
	let devnetState = $state<'idle' | 'loading' | 'loaded' | 'error'>('idle');
	let devnet = $state<DevnetBalance | null>(null);
	let devnetError = $state<string | null>(null);
	let copied = $state(false);

	/** Known devnet mints → display symbol; falls back to a truncated mint. */
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
			/* clipboard blocked — no-op */
		}
	}
</script>

<main class="mx-auto max-w-[720px] px-10 py-12">
	<!-- Cluster toggle (§18): Mainnet (SSR) ↔ Devnet (lazy). -->
	<div class="mb-8 flex justify-center">
		<div class="inline-flex items-center rounded-pill border border-border bg-surface p-1">
			{#each clusters as c (c)}
				<button
					type="button"
					onclick={() => setCluster(c)}
					class="rounded-pill px-4 py-1.5 text-[13px] font-semibold capitalize transition-colors {cluster ===
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
			<!-- Address + copy/explorer -->
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

			<!-- Devnet SPL holdings -->
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

			<!-- Faucet + refresh -->
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

	<!-- Agent signing — the live policy-scoped delegation opt-in (§18). -->
	<div class="mt-12">
		<AgentSigningCard authKeyId={data.agentSigning.authKeyId} policyId={data.agentSigning.policyId} />
	</div>

	<!-- Connectors empty state — the broader future (more venues). -->
	<section class="mt-4 rounded-card border border-dashed border-border bg-transparent p-6">
		<div class="eyebrow mb-2 text-muted">Coming soon</div>
		<h3 class="mb-1.5 text-[17px] font-bold text-ink">More connectors</h3>
		<p class="text-[13px] leading-relaxed text-muted">
			Policy-scoped agent signers across Drift, Jupiter, Marginfi, and more — each with its own
			guardrails.
		</p>
	</section>
</main>
