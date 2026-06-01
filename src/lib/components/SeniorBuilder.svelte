<!--
	SeniorBuilder (§20 Slice 2) — the senior-account creation experience: pick
	pools to compose, set an intended deposit amount + risk preference, then
	"compose" runs the agent sequence (risk → weighting) and proposes a custom
	allocation. The generation/loading state makes it feel like a strategy is
	being authored for you. Proposal-only; persists a senior account on success.
-->
<script lang="ts">
	import type {
		OpportunityCard,
		RiskPreference,
		SavingsAccountRecord,
		SavingsCatalogue
	} from '$lib/savings/types';

	type Props = {
		catalogue: SavingsCatalogue;
		onProposed: (account: SavingsAccountRecord) => void;
		onCancel: () => void;
	};
	let { catalogue, onProposed, onCancel }: Props = $props();

	const pools = $derived<OpportunityCard[]>([
		...catalogue.defaults,
		...catalogue.lend,
		...catalogue.earn,
		...catalogue.multiply
	]);

	let selected = $state<string[]>([]);
	let amount = $state('1000');
	const RISKS: RiskPreference[] = ['conservative', 'balanced', 'aggressive'];
	let riskPreference = $state<RiskPreference>('balanced');
	let phase = $state<'compose' | 'generating' | 'error'>('compose');
	let errorMsg = $state<string | null>(null);

	const PRODUCT: Record<string, string> = { lend: 'Lend', earn: 'Earn', multiply: 'Multiply' };
	const TIER: Record<string, string> = {
		conservative: 'text-positive',
		moderate: 'text-ink',
		elevated: 'text-warning',
		high: 'text-negative'
	};

	const amountValid = $derived(parseFloat(amount) > 0);
	const canCompose = $derived(selected.length >= 2 && amountValid);
	const selectedPools = $derived(pools.filter((p) => selected.includes(p.id)));

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
	}

	async function compose() {
		if (!canCompose) return;
		phase = 'generating';
		errorMsg = null;
		try {
			const res = await fetch('/api/savings/senior/propose', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					selectedPoolIds: selected,
					amountUsd: parseFloat(amount),
					riskPreference
				})
			});
			const body = await res.json();
			if (!res.ok || !body?.account) {
				throw new Error(body?.message ?? `propose failed (${res.status})`);
			}
			onProposed(body.account as SavingsAccountRecord);
		} catch (err) {
			phase = 'error';
			errorMsg = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<section class="rounded-card border border-border bg-surface p-5 shadow-card">
	<div class="mb-1 flex items-center justify-between">
		<h3 class="text-[17px] font-bold text-ink">Compose a senior account</h3>
		<button type="button" onclick={onCancel} class="text-[13px] text-muted hover:text-ink">Cancel</button>
	</div>
	<p class="mb-4 text-[12.5px] text-muted">
		Pick the pools to compose. Fabrick's agents assess their risk and propose a custom weighting +
		rebalancing strategy for your deposit.
	</p>

	{#if phase === 'generating'}
		<div class="flex flex-col items-center justify-center gap-3 py-10">
			<div class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-ink"></div>
			<div class="text-[14px] font-semibold text-ink">Composing your strategy…</div>
			<div class="text-[12px] text-muted">
				Assessing risk across {selectedPools.length} pools, then weighting for a {riskPreference} mandate.
			</div>
		</div>
	{:else}
		<!-- Risk preference -->
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

		<!-- Amount -->
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

		<!-- Pool selector -->
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
							<span class="text-[11px] text-muted">{PRODUCT[p.product] ?? p.product} · {p.asset} · <span class={TIER[p.riskTier]}>{p.riskTier}</span></span>
						</div>
						<span class="shrink-0 text-[13px] font-bold text-ink">
							{p.product === 'multiply' ? `~${p.leverage?.toFixed(1)}x` : `${(p.apy * 100).toFixed(2)}%`}
						</span>
					</button>
				{/each}
			</div>
		</div>

		{#if phase === 'error'}
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
