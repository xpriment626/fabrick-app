<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import {
		accountCloseBlock,
		accountDisplayName,
		accountModeLabel
	} from '$lib/savings/accounts';
	import type {
		CompositionReport,
		OpportunityCard,
		SavingsAccountRecord,
		SavingsAccountType,
		SavingsCatalogue
	} from '$lib/savings/types';
	import { parseCompositionReport } from '$lib/savings/report';
	import AgentSigningCard from '$lib/components/AgentSigningCard.svelte';
	import CompositionReportView from '$lib/components/CompositionReport.svelte';
	import ReceiveModal from '$lib/components/ReceiveModal.svelte';
	import SendModal from '$lib/components/SendModal.svelte';
	import SeniorBuilder from '$lib/components/SeniorBuilder.svelte';
	import SeniorAllocationCard from '$lib/components/SeniorAllocationCard.svelte';

	type Props = { data: PageData };
	let { data }: Props = $props();

	type CreatePhase = 'idle' | 'creating-simple' | 'error';
	type DepositPhase = 'idle' | 'simulating' | 'ready' | 'error';
	type DevnetToken = { mint: string; uiAmount: number; decimals: number };
	type DevnetBalance = { address: string; lamports: number; sol: number; tokens: DevnetToken[] };

	const wallet = $derived(data.walletSnapshot);

	let extraAccounts = $state<SavingsAccountRecord[]>([]);
	let closedAccountIds = $state<string[]>([]);
	let accountOverrides = $state<Record<string, SavingsAccountRecord>>({});
	const accounts = $derived<SavingsAccountRecord[]>([
		...extraAccounts,
		...(data.savingsAccounts ?? [])
	]
		.map((account) => accountOverrides[account.id] ?? account)
		.filter((account) => !closedAccountIds.includes(account.id)));
	const simpleAccounts = $derived(accounts.filter((account) => account.type === 'simple'));
	const advancedAccounts = $derived(accounts.filter((account) => account.type === 'advanced'));

	let creating = $state(false);
	let accountName = $state('');
	let selectedMode = $state<SavingsAccountType>('simple');
	let createPhase = $state<CreatePhase>('idle');
	let createError = $state<string | null>(null);
	let editingAccountId = $state<string | null>(null);
	let renameDraft = $state('');
	let accountActionBusy = $state<string | null>(null);
	let accountActionError = $state<Record<string, string>>({});
	let openReportIds = $state<string[]>([]);

	let catalogue = $state<SavingsCatalogue | null>(null);
	let catState = $state<'loading' | 'loaded' | 'error'>('loading');

	const allPools = $derived<OpportunityCard[]>(
		catalogue ? [...catalogue.defaults, ...catalogue.lend, ...catalogue.earn] : []
	);
	const simplePools = $derived<OpportunityCard[]>([
		...allPools.filter((pool) => pool.depositable && pool.riskTier === 'conservative'),
		...allPools.filter((pool) => pool.depositable && pool.riskTier !== 'conservative')
	]);
	let selectedSimplePoolId = $state('');
	const selectedSimplePool = $derived(
		simplePools.find((pool) => pool.id === selectedSimplePoolId) ?? simplePools[0] ?? null
	);

	$effect(() => {
		if (!selectedSimplePoolId && simplePools[0]) selectedSimplePoolId = simplePools[0].id;
	});

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

	function startCreate(mode: SavingsAccountType = 'simple') {
		selectedMode = mode;
		accountName = '';
		createPhase = 'idle';
		createError = null;
		creating = true;
	}

	function stopCreate() {
		creating = false;
		createPhase = 'idle';
		createError = null;
	}

	function onAdvancedCreated(account: SavingsAccountRecord) {
		extraAccounts = [account, ...extraAccounts];
		stopCreate();
	}

	function updateLocalAccount(account: SavingsAccountRecord) {
		extraAccounts = extraAccounts.map((item) => (item.id === account.id ? account : item));
		accountOverrides = { ...accountOverrides, [account.id]: account };
	}

	function removeLocalAccount(accountId: string) {
		extraAccounts = extraAccounts.filter((account) => account.id !== accountId);
		closedAccountIds = [...closedAccountIds, accountId];
	}

	function beginRename(account: SavingsAccountRecord) {
		editingAccountId = account.id;
		renameDraft = accountDisplayName(account.config);
		accountActionError = { ...accountActionError, [account.id]: '' };
	}

	function cancelRename() {
		editingAccountId = null;
		renameDraft = '';
	}

	async function renameAccount(account: SavingsAccountRecord) {
		const name = renameDraft.trim();
		if (!name) {
			accountActionError = { ...accountActionError, [account.id]: 'Account name is required.' };
			return;
		}

		accountActionBusy = account.id;
		accountActionError = { ...accountActionError, [account.id]: '' };
		try {
			const res = await fetch(`/api/savings/accounts/${account.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name })
			});
			const body = await res.json();
			if (!res.ok || !body?.account) throw new Error(body?.message ?? `rename failed (${res.status})`);
			updateLocalAccount(body.account as SavingsAccountRecord);
			cancelRename();
		} catch (err) {
			accountActionError = {
				...accountActionError,
				[account.id]: err instanceof Error ? err.message : String(err)
			};
		} finally {
			accountActionBusy = null;
		}
	}

	async function closeAccount(account: SavingsAccountRecord) {
		const blocked = accountCloseBlock(account.config);
		if (blocked) return;

		accountActionBusy = account.id;
		accountActionError = { ...accountActionError, [account.id]: '' };
		try {
			const res = await fetch(`/api/savings/accounts/${account.id}`, { method: 'DELETE' });
			const body = await res.json();
			if (res.status === 409 && body?.blocked?.message) {
				accountActionError = { ...accountActionError, [account.id]: body.blocked.message };
				return;
			}
			if (!res.ok || !body?.account) throw new Error(body?.message ?? `close failed (${res.status})`);
			removeLocalAccount(account.id);
		} catch (err) {
			accountActionError = {
				...accountActionError,
				[account.id]: err instanceof Error ? err.message : String(err)
			};
		} finally {
			accountActionBusy = null;
		}
	}

	async function createSimpleAccount() {
		if (createPhase === 'creating-simple' || !selectedSimplePool) return;
		const name = accountName.trim();
		if (!name) {
			createError = 'Name this savings account first.';
			createPhase = 'error';
			return;
		}

		createPhase = 'creating-simple';
		createError = null;
		try {
			const res = await fetch('/api/savings/accounts', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					type: 'simple',
					config: {
						name,
						selectedPoolId: selectedSimplePool.id,
						poolSnapshot: selectedSimplePool
					}
				})
			});
			const body = await res.json();
			if (!res.ok || !body?.account) throw new Error(body?.message ?? `create failed (${res.status})`);
			extraAccounts = [body.account as SavingsAccountRecord, ...extraAccounts];
			stopCreate();
		} catch (err) {
			createPhase = 'error';
			createError = err instanceof Error ? err.message : String(err);
		}
	}

	function simpleAccountPool(account: SavingsAccountRecord): OpportunityCard | null {
		const pool = account.config?.poolSnapshot;
		if (!pool || typeof pool !== 'object') return null;
		return pool as OpportunityCard;
	}

	function accountAmount(account: SavingsAccountRecord): number | null {
		const amount = account.config?.intendedAmountUsd;
		return typeof amount === 'number' && Number.isFinite(amount) ? amount : null;
	}

	function compositionReportFor(account: SavingsAccountRecord): CompositionReport | null {
		return parseCompositionReport(account.config?.compositionReport);
	}

	function toggleReport(accountId: string) {
		openReportIds = openReportIds.includes(accountId)
			? openReportIds.filter((id) => id !== accountId)
			: [...openReportIds, accountId];
	}

	function apyLabel(apy: number | undefined): string {
		return typeof apy === 'number' ? `${(apy * 100).toFixed(2)}%` : 'APY pending';
	}

	let walletModal = $state<'receive' | 'send' | null>(null);

	let depositTarget = $state<OpportunityCard | null>(null);
	let depositAmount = $state('1');
	let depositPhase = $state<DepositPhase>('idle');
	let depositMsg = $state<string | null>(null);

	function openDeposit(card: OpportunityCard) {
		depositTarget = card;
		depositAmount = '1';
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
					amount: depositAmount,
					opportunityId: depositTarget.mcpOpportunityId
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

<main class="mx-auto max-w-[860px] px-5 py-8 sm:px-8 lg:px-10">
	<div class="mb-7 flex items-center justify-between">
		<div>
			<div class="eyebrow text-muted">Wallet</div>
			<h1 class="mt-1 text-[24px] font-bold tracking-[-0.02em] text-ink">Fabrick</h1>
		</div>
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
		<section class="mb-5 rounded-[22px] border border-border bg-surface p-5 shadow-card sm:p-6">
			<div class="mb-8 flex items-start justify-between gap-5">
				<div>
					<div class="eyebrow mb-2 text-muted">Everyday wallet</div>
					<div class="font-mono text-[13px] text-muted">
						{wallet.addressFull.slice(0, 6)}…{wallet.addressFull.slice(-6)}
					</div>
				</div>
				<button
					type="button"
					onclick={copyAddress}
					class="rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-bg"
				>
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>

			<div class="mb-7">
				<div class="text-[13px] font-semibold text-muted">Total balance</div>
				<div class="mt-1 text-[46px] font-extrabold leading-none tracking-[-0.04em] text-ink sm:text-[58px]">
					{wallet.balanceUsd}
				</div>
				<div
					class="mt-2 text-sm font-medium {wallet.deltaTodayPct > 0
						? 'text-positive'
						: wallet.deltaTodayPct < 0
							? 'text-negative'
							: 'text-muted'}"
				>
					{wallet.deltaToday} ({wallet.deltaTodayPct.toFixed(2)}%) today
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<button
					type="button"
					onclick={() => (walletModal = 'receive')}
					class="flex items-center justify-center gap-2 rounded-[14px] bg-ink px-4 py-3 text-[14px] font-semibold text-surface transition-opacity hover:opacity-90"
				>
					<span class="text-[19px] leading-none">+</span>
					Deposit
				</button>
				<button
					type="button"
					onclick={() => (walletModal = 'send')}
					class="flex items-center justify-center gap-2 rounded-[14px] border border-border bg-surface px-4 py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-bg"
				>
					<span class="text-[17px] leading-none">↗</span>
					Send
				</button>
			</div>
		</section>

		<section class="mb-8">
			<div class="mb-3 flex items-center justify-between gap-3">
				<div>
					<h2 class="text-[18px] font-bold tracking-[-0.02em] text-ink">Savings accounts</h2>
					<p class="mt-0.5 text-[13px] text-muted">
						Organize deposits by goal, then choose where each account earns.
					</p>
				</div>
				{#if accounts.length}
					<button
						type="button"
						onclick={() => startCreate('simple')}
						data-testid="new-account-button"
						class="shrink-0 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-surface transition-opacity hover:opacity-90"
					>
						New account
					</button>
				{/if}
			</div>

			{#if creating}
				<section class="rounded-[18px] border border-border bg-surface p-5 shadow-card">
					<div class="mb-4 flex items-start justify-between gap-4">
						<div>
							<h3 class="text-[17px] font-bold text-ink">Open savings account</h3>
							<p class="mt-1 text-[12.5px] leading-relaxed text-muted">
								Name the goal, then choose Simple for one conservative pool or Advanced for a composed router.
							</p>
						</div>
						<button type="button" onclick={stopCreate} class="text-[13px] text-muted hover:text-ink">
							Cancel
						</button>
					</div>

					<label class="mb-1.5 block text-[12px] font-semibold text-muted" for="account-name">
						Account name
					</label>
					<input
						id="account-name"
						bind:value={accountName}
						placeholder="Vacation, College, Healthcare"
						class="mb-4 w-full rounded-[12px] border border-border bg-bg px-3 py-3 text-[15px] font-semibold text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
					/>

					<div class="mb-5 grid grid-cols-2 gap-2 rounded-[14px] bg-bg p-1">
						{#each ['simple', 'advanced'] as mode (mode)}
							<button
								type="button"
								onclick={() => (selectedMode = mode as SavingsAccountType)}
								data-testid={`account-mode-${mode}`}
								class="rounded-[11px] px-3 py-2.5 text-left transition-colors {selectedMode === mode
									? 'bg-surface text-ink shadow-card'
									: 'text-muted hover:text-ink'}"
							>
								<span class="block text-[13.5px] font-bold">{accountModeLabel(mode)}</span>
								<span class="mt-0.5 block text-[11.5px] leading-snug">
									{mode === 'simple' ? 'One conservative pool' : 'Weighted deposit router'}
								</span>
							</button>
						{/each}
					</div>

					{#if selectedMode === 'simple'}
						<div class="mb-4">
							<div class="mb-2 flex items-center justify-between">
								<span class="eyebrow text-muted">Conservative pool</span>
								{#if catState === 'loaded'}
									<span class="text-[11.5px] text-muted">{simplePools.length} available</span>
								{/if}
							</div>
							{#if catState === 'loading'}
								<div class="h-[112px] animate-pulse rounded-[14px] border border-border bg-bg"></div>
							{:else if catState === 'error'}
								<div class="rounded-[14px] border border-border bg-bg p-4 text-[13px] text-negative">
									Couldn't load Savings MCP pools.
								</div>
							{:else if simplePools.length}
								<div class="grid min-w-0 gap-2 overflow-hidden">
									{#each simplePools.slice(0, 4) as pool (pool.id)}
										<button
											type="button"
											onclick={() => (selectedSimplePoolId = pool.id)}
											class="flex w-full min-w-0 items-center gap-3 rounded-[14px] border px-3 py-3 text-left transition-colors {selectedSimplePool?.id ===
											pool.id
												? 'border-ink bg-bg'
												: 'border-border bg-surface hover:bg-bg/70'}"
										>
											<span
												class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border {selectedSimplePool?.id ===
												pool.id
													? 'border-ink bg-ink text-surface'
													: 'border-border'}"
											>
												{#if selectedSimplePool?.id === pool.id}<span class="text-[10px]">✓</span>{/if}
											</span>
											<span class="min-w-0 flex-1 overflow-hidden">
												<span class="block truncate text-[13.5px] font-bold text-ink">{pool.title}</span>
												<span class="block text-[11.5px] text-muted">{pool.venue} · {pool.riskTier}</span>
											</span>
											<span class="shrink-0 text-[15px] font-extrabold text-ink">{apyLabel(pool.apy)}</span>
										</button>
									{/each}
								</div>
							{:else}
								<div class="rounded-[14px] border border-border bg-bg p-4 text-[13px] text-muted">
									No deposit-ready conservative pool is available right now.
								</div>
							{/if}
						</div>

						{#if createPhase === 'error' && createError}
							<p class="mb-3 rounded-[10px] bg-negative/10 px-3 py-2 text-[12px] text-negative">
								{createError}
							</p>
						{/if}

						<button
							type="button"
							onclick={createSimpleAccount}
							disabled={createPhase === 'creating-simple' || !accountName.trim() || !selectedSimplePool}
							class="w-full rounded-[12px] bg-ink px-4 py-3 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{createPhase === 'creating-simple' ? 'Creating…' : 'Create Simple account'}
						</button>
					{:else if catState === 'loading'}
						<div class="h-[180px] animate-pulse rounded-[14px] border border-border bg-bg"></div>
					{:else if catState === 'error' || !catalogue}
						<div class="rounded-[14px] border border-border bg-bg p-5 text-[13px] text-negative">
							Couldn't load Savings MCP pools.
						</div>
					{:else if accountName.trim()}
						<SeniorBuilder
							accountName={accountName.trim()}
							{catalogue}
							onProposed={onAdvancedCreated}
							onCancel={stopCreate}
						/>
					{:else}
						<div class="rounded-[14px] border border-border bg-bg p-5 text-[13px] text-muted">
							Name this account before composing an Advanced deposit router.
						</div>
					{/if}
				</section>
			{:else if accounts.length === 0}
				<section
					class="rounded-[20px] border border-dashed border-border bg-surface px-6 py-12 text-center shadow-card"
				>
					<div class="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-bg text-[36px] text-ink">
						+
					</div>
					<h3 class="text-[19px] font-extrabold tracking-[-0.02em] text-ink">
						Create your first savings account
					</h3>
					<p class="mx-auto mt-2 max-w-[430px] text-[13px] leading-relaxed text-muted">
						Start with a named goal. Pool selection happens inside the account setup, so the wallet
						stays focused on balances and accounts.
					</p>
					<button
						type="button"
						onclick={() => startCreate('simple')}
						data-testid="new-account-button"
						class="mt-5 rounded-[14px] bg-ink px-5 py-3 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90"
					>
						Open savings account
					</button>
				</section>
			{:else}
				<div class="grid gap-3">
					{#each simpleAccounts as account (account.id)}
						{@const pool = simpleAccountPool(account)}
						{@const closeBlock = accountCloseBlock(account.config)}
						<section class="rounded-[18px] border border-border bg-surface p-4 shadow-card">
							<div class="flex items-start justify-between gap-4">
								<div class="min-w-0">
									<div class="mb-1 flex items-center gap-2">
										<h3 class="truncate text-[17px] font-extrabold tracking-[-0.02em] text-ink">
											{accountDisplayName(account.config, 'Simple savings')}
										</h3>
										<span class="rounded-full bg-bg px-2 py-0.5 text-[11px] font-semibold text-muted">
											Simple
										</span>
									</div>
									<p class="text-[12.5px] text-muted">
										{pool ? `${pool.venue} · ${pool.title}` : 'Choose a pool to finish setup'}
									</p>
								</div>
								<div class="shrink-0 text-right">
									<div class="text-[22px] font-extrabold tracking-[-0.03em] text-ink">
										{pool ? apyLabel(pool.apy) : '--'}
									</div>
									<div class="text-[11px] text-muted">projected APY</div>
								</div>
							</div>
							<div class="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
								<span class="text-[12px] text-muted">USDC deposits route to this account's selected pool.</span>
								{#if pool}
									<button
										type="button"
										onclick={() => openDeposit(pool)}
										class="rounded-[10px] bg-ink px-3 py-2 text-[12px] font-semibold text-surface transition-opacity hover:opacity-90"
									>
										Deposit
									</button>
								{/if}
							</div>
							<div class="mt-4 rounded-[14px] bg-bg p-3">
								{#if editingAccountId === account.id}
									<label
										class="mb-1.5 block text-[11.5px] font-semibold text-muted"
										for={`rename-${account.id}`}
									>
										Account name
									</label>
									<div class="flex flex-col gap-2 sm:flex-row">
										<input
											id={`rename-${account.id}`}
											bind:value={renameDraft}
											class="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-ink outline-none focus:border-ink"
										/>
										<div class="flex gap-2">
											<button
												type="button"
												onclick={() => renameAccount(account)}
												disabled={accountActionBusy === account.id}
												class="rounded-[10px] bg-ink px-3 py-2 text-[12px] font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
											>
												Save
											</button>
											<button
												type="button"
												onclick={cancelRename}
												class="rounded-[10px] border border-border bg-surface px-3 py-2 text-[12px] font-semibold text-ink transition-colors hover:bg-bg"
											>
												Cancel
											</button>
										</div>
									</div>
								{:else}
									<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
										<div class="min-w-0">
											<div class="text-[12px] font-semibold text-ink">Account controls</div>
											{#if closeBlock}
												<p class="mt-1 text-[12px] leading-relaxed text-warning">{closeBlock.message}</p>
											{:else}
												<p class="mt-1 text-[12px] text-muted">No active deposit recorded. This account can be closed.</p>
											{/if}
										</div>
										<div class="flex shrink-0 gap-2">
											<button
												type="button"
												onclick={() => beginRename(account)}
												class="rounded-[10px] border border-border bg-surface px-3 py-2 text-[12px] font-semibold text-ink transition-colors hover:bg-bg"
											>
												Rename
											</button>
											<button
												type="button"
												onclick={() => closeAccount(account)}
												disabled={Boolean(closeBlock) || accountActionBusy === account.id}
												class="rounded-[10px] border border-negative/30 bg-surface px-3 py-2 text-[12px] font-semibold text-negative transition-colors hover:bg-negative/10 disabled:cursor-not-allowed disabled:border-border disabled:text-muted disabled:hover:bg-surface"
											>
												{accountActionBusy === account.id ? 'Closing…' : 'Close'}
											</button>
										</div>
									</div>
								{/if}
								{#if accountActionError[account.id]}
									<p class="mt-2 rounded-[8px] bg-negative/10 px-3 py-2 text-[12px] text-negative">
										{accountActionError[account.id]}
									</p>
								{/if}
							</div>
						</section>
					{/each}

					{#each advancedAccounts as account (account.id)}
						{@const closeBlock = accountCloseBlock(account.config)}
						{@const report = compositionReportFor(account)}
						{#if account.proposedAllocation}
							<SeniorAllocationCard
								name={accountDisplayName(account.config, 'Advanced savings')}
								allocation={account.proposedAllocation}
								intendedAmountUsd={accountAmount(account) ?? undefined}
								riskPreference={typeof account.config?.riskPreference === 'string'
									? account.config.riskPreference
									: undefined}
							/>
							{#if report}
								<section class="rounded-[14px] bg-bg p-3">
									<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
										<div class="min-w-0">
											<div class="text-[12px] font-semibold text-ink">Composition report</div>
											<p class="mt-1 text-[12px] text-muted">
												Review the specialist findings, charts, and preview-only allocation rationale.
											</p>
										</div>
										<button
											type="button"
											onclick={() => toggleReport(account.id)}
											class="shrink-0 rounded-[10px] border border-border bg-surface px-3 py-2 text-[12px] font-semibold text-ink transition-colors hover:bg-bg"
										>
											{openReportIds.includes(account.id) ? 'Hide report' : 'View report'}
										</button>
									</div>
									{#if openReportIds.includes(account.id)}
										<div class="mt-4 border-t border-border pt-4">
											<CompositionReportView {report} />
										</div>
									{/if}
								</section>
							{/if}
							<section class="rounded-[14px] bg-bg p-3">
								{#if editingAccountId === account.id}
									<label
										class="mb-1.5 block text-[11.5px] font-semibold text-muted"
										for={`rename-${account.id}`}
									>
										Account name
									</label>
									<div class="flex flex-col gap-2 sm:flex-row">
										<input
											id={`rename-${account.id}`}
											bind:value={renameDraft}
											class="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-ink outline-none focus:border-ink"
										/>
										<div class="flex gap-2">
											<button
												type="button"
												onclick={() => renameAccount(account)}
												disabled={accountActionBusy === account.id}
												class="rounded-[10px] bg-ink px-3 py-2 text-[12px] font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
											>
												Save
											</button>
											<button
												type="button"
												onclick={cancelRename}
												class="rounded-[10px] border border-border bg-surface px-3 py-2 text-[12px] font-semibold text-ink transition-colors hover:bg-bg"
											>
												Cancel
											</button>
										</div>
									</div>
								{:else}
									<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
										<div class="min-w-0">
											<div class="text-[12px] font-semibold text-ink">Account controls</div>
											{#if closeBlock}
												<p class="mt-1 text-[12px] leading-relaxed text-warning">{closeBlock.message}</p>
											{:else}
												<p class="mt-1 text-[12px] text-muted">No active deposit recorded. This account can be closed.</p>
											{/if}
										</div>
										<div class="flex shrink-0 gap-2">
											<button
												type="button"
												onclick={() => beginRename(account)}
												class="rounded-[10px] border border-border bg-surface px-3 py-2 text-[12px] font-semibold text-ink transition-colors hover:bg-bg"
											>
												Rename
											</button>
											<button
												type="button"
												onclick={() => closeAccount(account)}
												disabled={Boolean(closeBlock) || accountActionBusy === account.id}
												class="rounded-[10px] border border-negative/30 bg-surface px-3 py-2 text-[12px] font-semibold text-negative transition-colors hover:bg-negative/10 disabled:cursor-not-allowed disabled:border-border disabled:text-muted disabled:hover:bg-surface"
											>
												{accountActionBusy === account.id ? 'Closing…' : 'Close'}
											</button>
										</div>
									</div>
								{/if}
								{#if accountActionError[account.id]}
									<p class="mt-2 rounded-[8px] bg-negative/10 px-3 py-2 text-[12px] text-negative">
										{accountActionError[account.id]}
									</p>
								{/if}
							</section>
						{/if}
					{/each}
				</div>
			{/if}
		</section>

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
						No wallet holdings yet.
					</div>
				{/if}
			</section>
		{:else}
			<section class="mb-10 flex h-32 items-center justify-center text-sm text-muted">
				Collectibles — coming soon
			</section>
		{/if}

		<section class="mt-2">
			<div class="eyebrow mb-3 text-muted">Advanced</div>
			<AgentSigningCard
				authKeyId={data.agentSigning.authKeyId}
				policyId={data.agentSigning.policyId}
			/>
		</section>
	{:else}
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

{#if walletModal === 'receive'}
	<ReceiveModal address={wallet.addressFull} onClose={() => (walletModal = null)} />
{:else if walletModal === 'send'}
	<SendModal owner={wallet.addressFull} onClose={() => (walletModal = null)} />
{/if}

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
				<h3 class="text-[17px] font-bold text-ink">Deposit into {depositTarget.title}</h3>
				<button type="button" onclick={closeDeposit} class="text-[13px] text-muted hover:text-ink">
					Close
				</button>
			</div>
			<p class="mb-4 text-[12.5px] text-muted">
				{depositTarget.venue} · {apyLabel(depositTarget.apy)} APY
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
