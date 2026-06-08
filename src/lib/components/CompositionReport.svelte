<script lang="ts">
	import type { CompositionReport } from '$lib/savings/types';

	type Props = {
		report: CompositionReport;
		showDelta?: boolean;
	};
	let { report, showDelta = true }: Props = $props();

	const SEG = ['bg-ink', 'bg-positive', 'bg-warning', 'bg-muted', 'bg-negative', 'bg-ink/60'];
	const SPECIALIST: Record<CompositionReport['findings'][number]['specialist'], string> = {
		opportunity: 'Opportunity',
		rate: 'Rate quality',
		liquidity: 'Exit liquidity',
		capacity: 'Capacity',
		exposure: 'Exposure',
		narrator: 'Narrator'
	};
	const SEVERITY: Record<CompositionReport['findings'][number]['severity'], string> = {
		info: 'text-ink',
		watch: 'text-warning',
		warning: 'text-negative'
	};

	const usd = (amount: number) =>
		`$${amount.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
	const pct = (value: number, decimals = 1) => `${value.toFixed(decimals)}%`;
	const bps = (value: number) => `${value.toFixed(value < 1 ? 4 : 2)} bps`;
	const max = (values: number[]) => Math.max(...values, 0.001);
	const apyMax = $derived(max(report.chartData.apyContribution.map((item) => item.valuePct)));
	const riskMax = $derived(max(report.chartData.riskContribution.map((item) => item.value)));
	const depthMax = $derived(max(report.chartData.depositDepth.map((item) => item.valueBps)));
	const majorDeltas = $derived(report.delta.weightChanges.filter((change) => Math.abs(change.deltaPct) >= 0.1));
</script>

<section class="composition-report" data-testid="composition-report">
	<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0">
			<div class="eyebrow mb-1 text-muted">Composition report</div>
			<h3 class="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
				{report.accountName || report.summary.headline}
			</h3>
			<p class="mt-2 max-w-[590px] text-[13px] leading-relaxed text-muted">
				{report.narratorCopy.overview}
			</p>
		</div>
		<div class="grid min-w-[190px] grid-cols-2 gap-2 rounded-[14px] bg-bg p-3">
			<div>
				<div class="text-[22px] font-extrabold tracking-[-0.03em] text-ink">
					{report.summary.blendedApyPct.toFixed(2)}%
				</div>
				<div class="text-[11px] font-semibold text-muted">blended APY</div>
			</div>
			<div>
				<div class="text-[22px] font-extrabold tracking-[-0.03em] text-ink">
					{usd(report.amountUsd)}
				</div>
				<div class="text-[11px] font-semibold text-muted">preview amount</div>
			</div>
		</div>
	</div>

	<div class="mb-5 flex h-3 w-full overflow-hidden rounded-pill bg-bg" aria-label="Allocation weights">
		{#each report.chartData.weights as item, i (item.label)}
			<div class="{SEG[i % SEG.length]} h-full" style="width: {item.valuePct}%"></div>
		{/each}
	</div>

	<div class="mb-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
		<div class="min-w-0">
			<div class="mb-2 flex items-center justify-between gap-3">
				<div class="eyebrow text-muted">Pool sleeves</div>
				<div class="text-[11.5px] font-semibold capitalize text-muted">{report.riskPreference}</div>
			</div>
			<div class="grid gap-2" data-testid="composition-report-pools">
				{#each report.pools as pool, i (pool.poolId)}
					<div class="rounded-[12px] bg-bg px-3 py-3">
						<div class="mb-2 flex items-start justify-between gap-3">
							<div class="min-w-0">
								<div class="flex items-center gap-2">
									<span class="h-2.5 w-2.5 shrink-0 rounded-full {SEG[i % SEG.length]}"></span>
									<div class="truncate text-[13.5px] font-bold text-ink">{pool.title}</div>
								</div>
								<div class="mt-0.5 text-[11.5px] text-muted">
									{pool.venue} · {pool.product} · {pool.riskTier}
								</div>
							</div>
							<div class="shrink-0 text-right">
								<div class="text-[15px] font-extrabold text-ink">{pct(pool.weightPct)}</div>
								<div class="text-[11px] text-muted">{usd(pool.amountUsd)}</div>
							</div>
						</div>
						<div class="grid gap-2 text-[11.5px] text-muted sm:grid-cols-3">
							<div><span class="font-semibold text-ink">{pct(pool.apyPct, 2)}</span> APY</div>
							<div><span class="font-semibold text-ink">{pct(pool.apyContributionPct, 2)}</span> APY contrib</div>
							<div><span class="font-semibold text-ink">{bps(pool.depthBps)}</span> depth</div>
						</div>
						<div class="mt-2 flex flex-wrap gap-1.5">
							<span class="rounded-pill bg-surface px-2 py-0.5 text-[10.5px] font-semibold text-muted">
								{pool.integrationStatus.replaceAll('_', ' ')}
							</span>
							{#each pool.capabilities.slice(0, 3) as cap (cap)}
								<span class="rounded-pill bg-surface px-2 py-0.5 text-[10.5px] font-semibold text-muted">
									{cap}
								</span>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="min-w-0 rounded-[14px] bg-bg p-3" data-testid="composition-report-charts">
			<div class="eyebrow mb-3 text-muted">Data views</div>
			<div class="grid gap-4">
				<div>
					<div class="mb-1.5 text-[12px] font-bold text-ink">APY contribution</div>
					{#each report.chartData.apyContribution as item (item.label)}
						<div class="mb-1.5 grid grid-cols-[minmax(0,1fr)_56px] items-center gap-2">
							<div class="min-w-0">
								<div class="h-2.5 overflow-hidden rounded-pill bg-surface">
									<div class="h-full rounded-pill bg-positive" style="width: {(item.valuePct / apyMax) * 100}%"></div>
								</div>
							</div>
							<div class="text-right text-[11px] font-semibold text-ink">{pct(item.valuePct, 2)}</div>
						</div>
					{/each}
				</div>

				<div>
					<div class="mb-1.5 text-[12px] font-bold text-ink">Risk contribution</div>
					{#each report.chartData.riskContribution as item (item.label)}
						<div class="mb-1.5 grid grid-cols-[minmax(0,1fr)_56px] items-center gap-2">
							<div class="h-2.5 overflow-hidden rounded-pill bg-surface">
								<div class="h-full rounded-pill bg-warning" style="width: {(item.value / riskMax) * 100}%"></div>
							</div>
							<div class="text-right text-[11px] font-semibold text-ink">{item.value.toFixed(2)}</div>
						</div>
					{/each}
				</div>

				<div>
					<div class="mb-1.5 text-[12px] font-bold text-ink">Deposit depth</div>
					{#each report.chartData.depositDepth as item (item.label)}
						<div class="mb-1.5 grid grid-cols-[minmax(0,1fr)_70px] items-center gap-2">
							<div class="h-2.5 overflow-hidden rounded-pill bg-surface">
								<div class="h-full rounded-pill bg-ink" style="width: {(item.valueBps / depthMax) * 100}%"></div>
							</div>
							<div class="text-right text-[11px] font-semibold text-ink">{bps(item.valueBps)}</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<div class="mb-5 grid gap-3 sm:grid-cols-2">
		<div class="rounded-[14px] bg-bg p-3">
			<div class="eyebrow mb-1 text-muted">Weighting rationale</div>
			<p class="text-[12.5px] leading-relaxed text-ink">{report.narratorCopy.weightingRationale}</p>
		</div>
		<div class="rounded-[14px] bg-bg p-3">
			<div class="eyebrow mb-1 text-muted">Rebalancing</div>
			<p class="text-[12.5px] leading-relaxed text-ink">{report.narratorCopy.rebalancing}</p>
		</div>
	</div>

	{#if report.keyWarnings.length}
		<div class="mb-5 rounded-[14px] bg-warning/10 p-3" data-testid="composition-report-warnings">
			<div class="eyebrow mb-2 text-warning">Warnings</div>
			<div class="grid gap-1.5">
				{#each report.keyWarnings as warning (warning)}
					<p class="text-[12.5px] leading-relaxed text-ink">{warning}</p>
				{/each}
			</div>
		</div>
	{/if}

	<div class="mb-5">
		<div class="eyebrow mb-2 text-muted">Specialist findings</div>
		<div class="grid gap-2 sm:grid-cols-2" data-testid="composition-report-findings">
			{#each report.findings as finding (finding.specialist)}
				<div class="rounded-[14px] bg-bg p-3">
					<div class="mb-1 flex items-center justify-between gap-3">
						<div class="text-[12px] font-bold text-ink">{finding.title}</div>
						<div class="text-[10.5px] font-semibold {SEVERITY[finding.severity]}">
							{SPECIALIST[finding.specialist]}
						</div>
					</div>
					<p class="text-[12px] leading-relaxed text-muted">{finding.body}</p>
				</div>
			{/each}
		</div>
	</div>

	{#if showDelta && report.delta.kind === 'reroll'}
		<div class="mb-5 rounded-[14px] bg-bg p-3" data-testid="composition-report-delta">
			<div class="mb-2 flex items-center justify-between gap-3">
				<div class="eyebrow text-muted">Reroll delta</div>
				<div class="text-[12px] font-bold {report.delta.blendedApyDeltaPct >= 0 ? 'text-positive' : 'text-negative'}">
					{report.delta.blendedApyDeltaPct >= 0 ? '+' : ''}{report.delta.blendedApyDeltaPct.toFixed(2)}% APY
				</div>
			</div>
			<div class="grid gap-2">
				{#each majorDeltas.slice(0, 4) as change (change.poolId)}
					<div class="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3">
						<div class="truncate text-[12.5px] font-semibold text-ink">{change.title}</div>
						<div class="text-right text-[12px] font-bold {change.deltaPct >= 0 ? 'text-positive' : 'text-negative'}">
							{change.deltaPct >= 0 ? '+' : ''}{change.deltaPct.toFixed(1)}%
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="rounded-[14px] bg-bg p-3" data-testid="composition-report-coordination">
		<div class="eyebrow mb-1 text-muted">Coordination</div>
		<p class="text-[12px] leading-relaxed text-muted">
			{report.coordination.runtime === 'coral_cloud' ? 'Coral Cloud' : 'Local schema'} ·
			{report.coordination.status.replaceAll('_', ' ')}
			{#if report.coordination.sessionId}
				· session {report.coordination.sessionId}
			{/if}
		</p>
		{#if report.coordination.message}
			<p class="mt-1 text-[12px] leading-relaxed text-muted">{report.coordination.message}</p>
		{/if}
	</div>
</section>
