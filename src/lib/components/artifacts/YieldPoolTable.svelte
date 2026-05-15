<!--
	Renders the output of `defillama_get_yield_pools`:
	{ pools: [{ pool, project, chain, symbol, tvlUsd, apy,
	            apyMean30d, ilRisk, stablecoin }] }

	Default sort: APY descending — most yield queries are "where's the
	highest rate." Sticky header, IL-risk + stable badges, muted
	delta tones.
-->
<script lang="ts">
	import { fmtUsd, fmtPct } from './utils';

	type Pool = {
		pool: string;
		project: string;
		chain: string;
		symbol: string;
		tvlUsd: number;
		apy: number;
		apyMean30d: number | null;
		ilRisk: string | null;
		stablecoin: boolean;
	};

	type Output = { pools: Pool[] };

	type Props = { output: unknown };
	let { output }: Props = $props();

	const pools = $derived(
		(output && typeof output === 'object' && 'pools' in output
			? (output as Output).pools
			: []) ?? []
	);

	type SortKey = 'apy' | 'apyMean30d' | 'tvlUsd' | 'project' | 'symbol';
	let sortKey = $state<SortKey>('apy');
	let sortDir = $state<'asc' | 'desc'>('desc');

	const sorted = $derived.by(() => {
		const copy = [...pools];
		copy.sort((a, b) => {
			const av = a[sortKey];
			const bv = b[sortKey];
			if (typeof av === 'string' && typeof bv === 'string') {
				return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
			}
			const an = Number(av ?? 0);
			const bn = Number(bv ?? 0);
			return sortDir === 'asc' ? an - bn : bn - an;
		});
		return copy;
	});

	function setSort(key: SortKey) {
		if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortKey = key;
			sortDir = key === 'project' || key === 'symbol' ? 'asc' : 'desc';
		}
	}

	function ariaSort(k: SortKey): 'ascending' | 'descending' | 'none' {
		if (sortKey !== k) return 'none';
		return sortDir === 'asc' ? 'ascending' : 'descending';
	}
	function arrow(k: SortKey): string {
		if (sortKey !== k) return '';
		return sortDir === 'asc' ? '↑' : '↓';
	}
</script>

{#if sorted.length === 0}
	<div class="text-muted text-xs italic">No yield pools returned.</div>
{:else}
	<div class="artifact">
		<div class="caption">
			<span class="caption-title">Yield pools</span>
			<span class="caption-count">{sorted.length} rows · DefiLlama</span>
		</div>
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th class="left" aria-sort={ariaSort('project')}>
							<button type="button" onclick={() => setSort('project')}>
								Project <span class="arrow">{arrow('project')}</span>
							</button>
						</th>
						<th class="left" aria-sort={ariaSort('symbol')}>
							<button type="button" onclick={() => setSort('symbol')}>
								Symbol <span class="arrow">{arrow('symbol')}</span>
							</button>
						</th>
						<th class="left">Chain</th>
						<th class="right" aria-sort={ariaSort('tvlUsd')}>
							<button type="button" onclick={() => setSort('tvlUsd')}>
								TVL <span class="arrow">{arrow('tvlUsd')}</span>
							</button>
						</th>
						<th class="right" aria-sort={ariaSort('apy')}>
							<button type="button" onclick={() => setSort('apy')}>
								APY <span class="arrow">{arrow('apy')}</span>
							</button>
						</th>
						<th class="right" aria-sort={ariaSort('apyMean30d')}>
							<button type="button" onclick={() => setSort('apyMean30d')}>
								30d mean <span class="arrow">{arrow('apyMean30d')}</span>
							</button>
						</th>
						<th class="left">Tags</th>
					</tr>
				</thead>
				<tbody>
					{#each sorted as p (p.pool)}
						<tr>
							<td class="left strong">{p.project}</td>
							<td class="left">{p.symbol}</td>
							<td class="left muted">{p.chain}</td>
							<td class="right tnum">{fmtUsd(p.tvlUsd)}</td>
							<td class="right tnum apy">{fmtPct(p.apy)}</td>
							<td class="right tnum muted">
								{p.apyMean30d == null ? '—' : fmtPct(p.apyMean30d)}
							</td>
							<td class="left tags">
								{#if p.stablecoin}<span class="tag tag-stable">stable</span>{/if}
								{#if p.ilRisk && p.ilRisk.toLowerCase() !== 'no'}
									<span class="tag tag-il">IL: {p.ilRisk}</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/if}

<style>
	.artifact {
		border: 1px solid var(--color-border);
		border-radius: 12px;
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		overflow: hidden;
	}
	.caption {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 10px 14px 8px;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
	}
	.caption-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--color-ink);
		letter-spacing: -0.01em;
	}
	.caption-count {
		font-size: 11px;
		color: var(--color-muted);
		font-variant-numeric: tabular-nums;
	}

	.scroll {
		overflow-x: auto;
		max-height: 420px;
		overflow-y: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	thead {
		position: sticky;
		top: 0;
		background: color-mix(in srgb, var(--color-surface) 92%, transparent);
		backdrop-filter: blur(8px);
		z-index: 1;
	}
	th {
		font-weight: 500;
		color: var(--color-muted);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 7px 12px;
		border-bottom: 1px solid var(--color-border);
		white-space: nowrap;
	}
	th button {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		gap: 4px;
		align-items: center;
	}
	th button:hover {
		color: var(--color-ink);
	}
	.arrow {
		font-size: 9px;
		opacity: 0.7;
	}
	td {
		padding: 8px 12px;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 35%, transparent);
		color: var(--color-ink);
		vertical-align: middle;
	}
	tbody tr:last-child td {
		border-bottom: none;
	}
	tbody tr:hover td {
		background: color-mix(in srgb, var(--color-ink) 3%, transparent);
	}

	.left {
		text-align: left;
	}
	.right {
		text-align: right;
	}
	.strong {
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.muted {
		color: var(--color-muted);
	}
	.tnum {
		font-variant-numeric: tabular-nums;
	}
	.apy {
		color: var(--color-positive);
		font-weight: 500;
	}

	.tags {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.tag {
		display: inline-block;
		font-size: 10px;
		font-weight: 500;
		padding: 2px 6px;
		border-radius: 4px;
		letter-spacing: 0.02em;
	}
	.tag-stable {
		background: color-mix(in srgb, var(--color-positive) 14%, var(--color-bg));
		color: var(--color-positive);
	}
	.tag-il {
		background: color-mix(in srgb, var(--color-warning) 16%, var(--color-bg));
		color: var(--color-warning);
	}
</style>
