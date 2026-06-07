<!--
	SeniorAllocationCard — renders a Savings MCP AllocationDecision
	for a senior account: weighted multi-pool basket, blended APY, risk envelope,
	rebalancing strategy, and rationale. Materially different from the junior
	one-click card — this is a composed, generated strategy.
	Proposal-only: "Fund this strategy" is disabled (deferred signing slice).
-->
<script lang="ts">
	import type { AllocationDecision } from '$lib/savings/types';

	type Props = {
		allocation: AllocationDecision;
		intendedAmountUsd?: number;
		riskPreference?: string;
		/** Hide the "Fund this strategy" CTA (e.g. when shown as a builder preview). */
		showFundButton?: boolean;
	};
	let { allocation, intendedAmountUsd, riskPreference, showFundButton = true }: Props = $props();

	const PRODUCT: Record<string, string> = { lend: 'Lend', earn: 'Earn' };
	// quiet palette for the weight segments
	const SEG = ['bg-ink', 'bg-positive', 'bg-warning', 'bg-muted', 'bg-negative', 'bg-ink/60'];
	const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
</script>

<section class="rounded-card border border-border bg-surface p-5 shadow-card">
	<div class="mb-3 flex items-start justify-between">
		<div class="flex flex-col">
			<div class="flex items-center gap-2">
				<h3 class="text-[17px] font-bold text-ink">Senior strategy</h3>
				{#if riskPreference}
					<span class="rounded-pill bg-ink/8 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-ink">
						{riskPreference}
					</span>
				{/if}
			</div>
			<span class="text-[12px] text-muted">
				{allocation.weights.length} pools{intendedAmountUsd ? ` · ${usd(intendedAmountUsd)}` : ''}
			</span>
		</div>
		<div class="flex flex-col items-end">
			<span class="text-[26px] font-extrabold tracking-[-0.03em] text-ink">
				{allocation.blendedApyPct.toFixed(2)}%
			</span>
			<span class="text-[11px] font-medium text-muted">blended APY</span>
		</div>
	</div>

	<!-- Stacked weight bar -->
	<div class="mb-3 flex h-2.5 w-full overflow-hidden rounded-pill">
		{#each allocation.weights as w, i (w.poolId)}
			<div class="{SEG[i % SEG.length]} h-full" style="width: {w.weightPct}%"></div>
		{/each}
	</div>

	<!-- Per-pool rows -->
	<div class="mb-4 flex flex-col gap-2">
		{#each allocation.weights as w, i (w.poolId)}
			<div class="flex items-center gap-3">
				<span class="h-2.5 w-2.5 shrink-0 rounded-full {SEG[i % SEG.length]}"></span>
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="truncate text-[13.5px] font-semibold text-ink">{w.title}</span>
					<span class="text-[11px] text-muted">
						{PRODUCT[w.product] ?? w.product} · {w.asset}{w.apy > 0 ? ` · ${(w.apy * 100).toFixed(2)}%` : ''}
					</span>
				</div>
				<span class="text-[14px] font-bold text-ink">{w.weightPct}%</span>
			</div>
		{/each}
	</div>

	<!-- Risk envelope -->
	<div class="mb-3 rounded-[10px] bg-bg px-3 py-2">
		<div class="eyebrow mb-0.5 text-muted">Risk envelope</div>
		<div class="text-[12.5px] text-ink">{allocation.riskEnvelope}</div>
	</div>

	<!-- Rebalancing strategy -->
	<div class="mb-3">
		<div class="eyebrow mb-1 text-muted">Rebalancing</div>
		<p class="text-[12.5px] leading-relaxed text-muted">{allocation.rebalanceStrategy}</p>
	</div>

	<!-- Rationale -->
	<div class="mb-4">
		<div class="eyebrow mb-1 text-muted">Why this mix</div>
		<p class="text-[12.5px] leading-relaxed text-muted">{allocation.rationale}</p>
	</div>

	{#if showFundButton}
		<button
			type="button"
			disabled
			class="w-full rounded-[10px] border border-border bg-surface px-4 py-2.5 text-[13px] font-semibold text-muted"
		>
			Fund this strategy — coming soon
		</button>
	{/if}
</section>
