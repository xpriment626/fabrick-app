<!--
	SavingsCard (design.md §20) — renders one catalogue OpportunityCard.
	  variant="default" → prominent card with a one-click Deposit CTA (the two Main
	                      Market reserves). Only `depositable` cards enable the button.
	  variant="browse"  → compact row for the Discover catalogue.
	Risk tier drives the chip colour (conservative→positive … high→negative).
-->
<script lang="ts">
	import type { OpportunityCard } from '$lib/savings/types';

	type Props = {
		card: OpportunityCard;
		variant?: 'default' | 'browse';
		onDeposit?: (card: OpportunityCard) => void;
	};
	let { card, variant = 'browse', onDeposit }: Props = $props();

	const PRODUCT_LABEL: Record<OpportunityCard['product'], string> = {
		lend: 'Lend',
		earn: 'Earn',
		multiply: 'Multiply'
	};
	const TIER: Record<OpportunityCard['riskTier'], { label: string; cls: string }> = {
		conservative: { label: 'Conservative', cls: 'bg-positive/12 text-positive' },
		moderate: { label: 'Moderate', cls: 'bg-ink/8 text-ink' },
		elevated: { label: 'Elevated', cls: 'bg-warning/15 text-warning' },
		high: { label: 'High risk', cls: 'bg-negative/12 text-negative' }
	};

	const apyLabel = $derived(card.apy > 0 ? `${(card.apy * 100).toFixed(2)}%` : '—');
	const tier = $derived(TIER[card.riskTier]);
</script>

{#if variant === 'default'}
	<div class="flex flex-col rounded-card border border-border bg-surface p-5 shadow-card">
		<div class="mb-3 flex items-center justify-between">
			<div class="flex items-center gap-2.5">
				<span
					class="flex h-9 w-9 items-center justify-center rounded-full bg-bg text-sm font-bold text-ink"
				>
					{card.asset.charAt(0)}
				</span>
				<div class="flex flex-col">
					<span class="text-[15px] font-bold text-ink">{card.asset}</span>
					<span class="text-[11px] text-muted">{card.venue}</span>
				</div>
			</div>
			<span class="rounded-pill px-2.5 py-0.5 text-[11px] font-semibold {tier.cls}">{tier.label}</span>
		</div>

		<div class="mb-1 flex items-baseline gap-1.5">
			<span class="text-[34px] font-extrabold tracking-[-0.04em] text-ink">{apyLabel}</span>
			<span class="text-[13px] font-medium text-muted">APY</span>
		</div>

		<p class="mb-4 text-[12.5px] leading-relaxed text-muted">{card.riskSynthesis}</p>

		<button
			type="button"
			disabled={!card.depositable}
			onclick={() => onDeposit?.(card)}
			class="mt-auto rounded-[10px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
		>
			Deposit {card.asset}
		</button>
	</div>
{:else}
	<div class="flex items-center gap-4 rounded-[12px] border border-border bg-surface px-4 py-3.5">
		<span
			class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-[12px] font-bold text-ink"
		>
			{card.asset.charAt(0)}
		</span>
		<div class="flex min-w-0 flex-1 flex-col gap-0.5">
			<div class="flex items-center gap-2">
				<span class="truncate text-[14px] font-semibold text-ink">{card.title}</span>
				<span
					class="shrink-0 rounded-pill bg-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted"
				>
					{PRODUCT_LABEL[card.product]}
				</span>
			</div>
			<span class="truncate text-[11.5px] text-muted">{card.riskSynthesis}</span>
		</div>
		<div class="flex shrink-0 flex-col items-end gap-1">
			<span class="text-[15px] font-bold text-ink">
				{card.product === 'multiply' ? `~${card.leverage?.toFixed(2)}x` : apyLabel}
			</span>
			<span class="rounded-pill px-2 py-0.5 text-[10px] font-semibold {tier.cls}">{tier.label}</span>
		</div>
	</div>
{/if}
