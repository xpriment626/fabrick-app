<!--
	SeniorBuilder (§18 reroll model, §20 Slice 2) — compose a senior account.

	Flow: pick pools + amount + risk preference → Compose → a PREVIEW of the
	Savings MCP-proposed allocation. From the preview the user can Accept & save,
	or REROLL with a direction (more conservative / aggressive / fewer pools).
	Reroll is a *steer*, not a reseed: it appends a nudge and re-proposes
	with the accumulated nudges (deterministic allocator). Accept persists the
	account with its mandate (incl. nudges) + accepted allocation.
-->
<script lang="ts">
	import type {
		AllocationDecision,
		OpportunityCard,
		RiskPreference,
		SavingsAccountRecord,
		SavingsCatalogue,
		SeniorMandate,
		SeniorNudge
	} from '$lib/savings/types';
	import SeniorAllocationCard from './SeniorAllocationCard.svelte';

	type Props = {
		catalogue: SavingsCatalogue;
		onProposed: (account: SavingsAccountRecord) => void;
		onCancel: () => void;
	};
	let { catalogue, onProposed, onCancel }: Props = $props();

	const pools = $derived<OpportunityCard[]>([
		...catalogue.defaults,
		...catalogue.lend,
		...catalogue.earn
	]);

	let selected = $state<string[]>([]);
	let amount = $state('1000');
	const RISKS: RiskPreference[] = ['conservative', 'balanced', 'aggressive'];
	let riskPreference = $state<RiskPreference>('balanced');
	let nudges = $state<SeniorNudge[]>([]);
	let phase = $state<'compose' | 'generating' | 'preview' | 'accepting' | 'error'>('compose');
	let errorMsg = $state<string | null>(null);
	let preview = $state<{ allocation: AllocationDecision; mandate: SeniorMandate } | null>(null);

	const PRODUCT: Record<string, string> = { lend: 'Lend', earn: 'Earn' };
	const TIER: Record<string, string> = {
		conservative: 'text-positive',
		moderate: 'text-ink',
		elevated: 'text-warning',
		high: 'text-negative'
	};
	const NUDGE_OPTIONS: { key: SeniorNudge; label: string }[] = [
		{ key: 'more_conservative', label: '↓ More conservative' },
		{ key: 'more_aggressive', label: '↑ More aggressive' },
		{ key: 'fewer_pools', label: 'Fewer pools' }
	];
	const NUDGE_LABEL: Record<SeniorNudge, string> = {
		more_conservative: 'more conservative',
		more_aggressive: 'more aggressive',
		fewer_pools: 'fewer pools'
	};

	const amountValid = $derived(parseFloat(amount) > 0);
	const canCompose = $derived(selected.length >= 2 && amountValid);

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
	}

	async function runPropose() {
		phase = 'generating';
		errorMsg = null;
		try {
			const res = await fetch('/api/savings/senior/propose', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					selectedPoolIds: selected,
					amountUsd: parseFloat(amount),
					riskPreference,
					nudges
				})
			});
			const body = await res.json();
			if (!res.ok || !body?.allocation) throw new Error(body?.message ?? `propose failed (${res.status})`);
			preview = { allocation: body.allocation as AllocationDecision, mandate: body.mandate as SeniorMandate };
			phase = 'preview';
		} catch (err) {
			phase = 'error';
			errorMsg = err instanceof Error ? err.message : String(err);
		}
	}

	function compose() {
		if (!canCompose) return;
		nudges = [];
		void runPropose();
	}
	function reroll(n: SeniorNudge) {
		nudges = [...nudges, n];
		void runPropose();
	}
	function backToSelection() {
		phase = 'compose';
		preview = null;
		nudges = [];
		errorMsg = null;
	}

	async function accept() {
		if (!preview) return;
		phase = 'accepting';
		errorMsg = null;
		try {
			const res = await fetch('/api/savings/accounts', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					type: 'senior',
					config: preview.mandate,
					proposedAllocation: preview.allocation
				})
			});
			const body = await res.json();
			if (!res.ok || !body?.account) throw new Error(body?.message ?? `accept failed (${res.status})`);
			onProposed(body.account as SavingsAccountRecord);
		} catch (err) {
			phase = 'error';
			errorMsg = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<section class="rounded-card border border-border bg-surface p-5 shadow-card">
	<div class="mb-1 flex items-center justify-between">
		<h3 class="text-[17px] font-bold text-ink">
			{preview ? 'Your proposed strategy' : 'Compose a senior account'}
		</h3>
		<button type="button" onclick={onCancel} class="text-[13px] text-muted hover:text-ink">Cancel</button>
	</div>

	{#if phase === 'generating' || phase === 'accepting'}
		<div class="flex flex-col items-center justify-center gap-3 py-10">
			<div class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-ink"></div>
			<div class="text-[14px] font-semibold text-ink">
				{phase === 'accepting' ? 'Saving your strategy…' : 'Composing your strategy…'}
			</div>
			{#if phase === 'generating'}
				<div class="text-[12px] text-muted">
					{nudges.length
						? `Re-weighting (${NUDGE_LABEL[nudges[nudges.length - 1]]})…`
						: `Assessing risk across ${selected.length} pools for a ${riskPreference} mandate.`}
				</div>
			{/if}
		</div>
	{:else if preview}
		<!-- PREVIEW: the proposed allocation + steer / accept -->
		<p class="mb-3 text-[12.5px] text-muted">
			Composed from Savings MCP analytics. Steer it, or accept to save — nothing is funded yet.
		</p>

		<SeniorAllocationCard
			allocation={preview.allocation}
			intendedAmountUsd={preview.mandate.intendedAmountUsd}
			riskPreference={preview.mandate.riskPreference}
			showFundButton={false}
		/>

		{#if nudges.length}
			<div class="mt-3 flex flex-wrap items-center gap-1.5">
				<span class="text-[11.5px] text-muted">Steers applied:</span>
				{#each nudges as n, i (i)}
					<span class="rounded-pill bg-bg px-2 py-0.5 text-[11px] font-medium text-ink">{NUDGE_LABEL[n]}</span>
				{/each}
			</div>
		{/if}

		<div class="mt-4">
			<div class="eyebrow mb-1.5 text-muted">Reroll with a direction</div>
			<div class="flex flex-wrap gap-1.5">
				{#each NUDGE_OPTIONS as opt (opt.key)}
					<button
						type="button"
						onclick={() => reroll(opt.key)}
						class="rounded-pill border border-border bg-surface px-3 py-1 text-[12px] font-semibold text-ink transition-colors hover:bg-bg"
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>

		{#if phase === 'error' && errorMsg}
			<p class="mt-3 rounded-[8px] bg-negative/10 px-3 py-2 text-[12px] text-negative">{errorMsg}</p>
		{/if}

		<div class="mt-4 flex gap-2">
			<button
				type="button"
				onclick={backToSelection}
				class="rounded-[10px] border border-border bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-bg"
			>
				Back
			</button>
			<button
				type="button"
				onclick={accept}
				class="flex-1 rounded-[10px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90"
			>
				Accept &amp; save
			</button>
		</div>
	{:else}
		<!-- COMPOSE: pick pools + amount + risk preference -->
		<p class="mb-4 text-[12.5px] text-muted">
			Pick the USDC opportunities to compose. Savings MCP proposes a custom weighting + rebalancing
			strategy for your deposit.
		</p>

		<div class="mb-4">
			<div class="eyebrow mb-1.5 text-muted">Risk preference</div>
			<div class="inline-flex items-center rounded-pill border border-border bg-bg p-1">
				{#each RISKS as r (r)}
					<button
						type="button"
						onclick={() => (riskPreference = r)}
						class="rounded-pill px-3.5 py-1 text-[12.5px] font-semibold capitalize transition-colors {riskPreference ===
						r
							? 'bg-ink text-surface'
							: 'text-muted hover:text-ink'}"
					>
						{r}
					</button>
				{/each}
			</div>
		</div>

		<div class="mb-4">
			<div class="eyebrow mb-1.5 text-muted">Intended deposit</div>
			<div class="flex items-center gap-2 rounded-[10px] border border-border px-3 py-2.5">
				<span class="text-[14px] font-semibold text-muted">$</span>
				<input
					bind:value={amount}
					inputmode="decimal"
					class="w-full bg-transparent text-[15px] font-semibold text-ink outline-none"
				/>
			</div>
		</div>

		<div class="mb-4">
			<div class="mb-1.5 flex items-center justify-between">
				<span class="eyebrow text-muted">Select pools</span>
				<span class="text-[11.5px] text-muted">{selected.length} selected (min 2)</span>
			</div>
			<div class="max-h-[280px] overflow-y-auto rounded-card border border-border">
				{#each pools as p (p.id)}
					{@const isSel = selected.includes(p.id)}
					<button
						type="button"
						onclick={() => toggle(p.id)}
						class="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0 {isSel
							? 'bg-bg'
							: 'hover:bg-bg/50'}"
					>
						<span
							class="flex h-4 w-4 shrink-0 items-center justify-center rounded border {isSel
								? 'border-ink bg-ink text-surface'
								: 'border-border'}"
						>
							{#if isSel}<span class="text-[10px]">✓</span>{/if}
						</span>
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-[13px] font-semibold text-ink">{p.title}</span>
							<span class="text-[11px] text-muted"
								>{PRODUCT[p.product] ?? p.product} · {p.asset} ·
								<span class={TIER[p.riskTier]}>{p.riskTier}</span></span
							>
						</div>
						<span class="shrink-0 text-[13px] font-bold text-ink">
							{(p.apy * 100).toFixed(2)}%
						</span>
					</button>
				{/each}
			</div>
		</div>

		{#if phase === 'error' && errorMsg}
			<p class="mb-3 rounded-[8px] bg-negative/10 px-3 py-2 text-[12px] text-negative">{errorMsg}</p>
		{/if}

		<button
			type="button"
			onclick={compose}
			disabled={!canCompose}
			class="w-full rounded-[10px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
		>
			Compose strategy
		</button>
	{/if}
</section>
