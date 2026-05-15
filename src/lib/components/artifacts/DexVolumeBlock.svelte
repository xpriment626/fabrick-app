<!--
	Renders the output of `defillama_get_dex_volume`:
	{ chain, totalVolume24h, totalVolume7d,
	  dexes: [{ name, dailyVolume, weeklyVolume, change1d }] }

	Top stat bar (24h + 7d totals) above a sortable per-DEX table.
	`chain` shown in the caption when scoped, "all chains" otherwise.
-->
<script lang="ts">
	import { fmtUsd, fmtPct, pctClass } from './utils';

	type Dex = {
		name: string;
		dailyVolume: number;
		weeklyVolume: number;
		change1d: number | null;
	};

	type Output = {
		chain: string | null;
		totalVolume24h: number;
		totalVolume7d: number;
		dexes: Dex[];
	};

	type Props = { output: unknown };
	let { output }: Props = $props();

	const o = $derived.by((): Output => {
		const empty: Output = { chain: null, totalVolume24h: 0, totalVolume7d: 0, dexes: [] };
		if (!output || typeof output !== 'object') return empty;
		const candidate = output as Partial<Output>;
		return {
			chain: candidate.chain ?? null,
			totalVolume24h: candidate.totalVolume24h ?? 0,
			totalVolume7d: candidate.totalVolume7d ?? 0,
			dexes: candidate.dexes ?? []
		};
	});

	type SortKey = 'dailyVolume' | 'weeklyVolume' | 'change1d' | 'name';
	let sortKey = $state<SortKey>('dailyVolume');
	let sortDir = $state<'asc' | 'desc'>('desc');

	const sorted = $derived.by(() => {
		const copy = [...o.dexes];
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
			sortDir = key === 'name' ? 'asc' : 'desc';
		}
	}
	function arrow(k: SortKey): string {
		if (sortKey !== k) return '';
		return sortDir === 'asc' ? '↑' : '↓';
	}
	function ariaSort(k: SortKey): 'ascending' | 'descending' | 'none' {
		if (sortKey !== k) return 'none';
		return sortDir === 'asc' ? 'ascending' : 'descending';
	}
</script>

<div class="artifact">
	<div class="caption">
		<span class="caption-title">DEX volume</span>
		<span class="caption-count">{o.chain ? o.chain : 'all chains'} · DefiLlama</span>
	</div>
	<div class="stats">
		<div class="stat">
			<div class="stat-label">24h volume</div>
			<div class="stat-value tnum">{fmtUsd(o.totalVolume24h)}</div>
		</div>
		<div class="stat">
			<div class="stat-label">7d volume</div>
			<div class="stat-value tnum">{fmtUsd(o.totalVolume7d)}</div>
		</div>
	</div>
	{#if sorted.length > 0}
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th class="left" aria-sort={ariaSort('name')}>
							<button type="button" onclick={() => setSort('name')}>
								DEX <span class="arrow">{arrow('name')}</span>
							</button>
						</th>
						<th class="right" aria-sort={ariaSort('dailyVolume')}>
							<button type="button" onclick={() => setSort('dailyVolume')}>
								24h <span class="arrow">{arrow('dailyVolume')}</span>
							</button>
						</th>
						<th class="right" aria-sort={ariaSort('weeklyVolume')}>
							<button type="button" onclick={() => setSort('weeklyVolume')}>
								7d <span class="arrow">{arrow('weeklyVolume')}</span>
							</button>
						</th>
						<th class="right" aria-sort={ariaSort('change1d')}>
							<button type="button" onclick={() => setSort('change1d')}>
								1d Δ <span class="arrow">{arrow('change1d')}</span>
							</button>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each sorted as d (d.name)}
						<tr>
							<td class="left strong">{d.name}</td>
							<td class="right tnum">{fmtUsd(d.dailyVolume)}</td>
							<td class="right tnum muted">{fmtUsd(d.weeklyVolume)}</td>
							<td class="right tnum {d.change1d == null ? '' : pctClass(d.change1d)}">
								{d.change1d == null ? '—' : fmtPct(d.change1d)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

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
		text-transform: capitalize;
	}

	.stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1px;
		background: color-mix(in srgb, var(--color-border) 50%, transparent);
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
	}
	.stat {
		padding: 14px 16px;
		background: var(--color-surface);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.stat-label {
		font-size: 10px;
		color: var(--color-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.stat-value {
		font-size: 20px;
		font-weight: 600;
		color: var(--color-ink);
		letter-spacing: -0.01em;
	}

	.scroll {
		overflow-x: auto;
		max-height: 360px;
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
	}
	.muted {
		color: var(--color-muted);
	}
	.tnum {
		font-variant-numeric: tabular-nums;
	}
	.pos {
		color: var(--color-positive);
	}
	.neg {
		color: var(--color-negative);
	}
</style>
