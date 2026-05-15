<!--
	Renders the output of `defillama_get_protocols`:
	{ protocols: [{ name, slug, category, chains[], tvlUsd,
	                change1dPct, change7dPct }] }

	Sortable headers (click to toggle), compact USD numbers, signed
	% deltas. Designed to live inline in the chat thread directly
	beneath its tool-call chip.
-->
<script lang="ts">
	import { fmtUsd, fmtPct, pctClass } from './utils';

	type Protocol = {
		name: string;
		slug: string;
		category: string;
		chains: string[];
		tvlUsd: number;
		change1dPct: number;
		change7dPct: number;
	};

	type Output = { protocols: Protocol[] };

	type Props = { output: unknown };
	let { output }: Props = $props();

	const protocols = $derived(
		(output && typeof output === 'object' && 'protocols' in output
			? (output as Output).protocols
			: []) ?? []
	);

	type SortKey = 'tvlUsd' | 'change1dPct' | 'change7dPct' | 'name';
	let sortKey = $state<SortKey>('tvlUsd');
	let sortDir = $state<'asc' | 'desc'>('desc');

	const sorted = $derived.by(() => {
		const copy = [...protocols];
		copy.sort((a, b) => {
			const av = a[sortKey];
			const bv = b[sortKey];
			if (typeof av === 'string' && typeof bv === 'string') {
				return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
			}
			const an = Number(av);
			const bn = Number(bv);
			return sortDir === 'asc' ? an - bn : bn - an;
		});
		return copy;
	});

	function setSort(key: SortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = key === 'name' ? 'asc' : 'desc';
		}
	}

	function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
		if (sortKey !== key) return 'none';
		return sortDir === 'asc' ? 'ascending' : 'descending';
	}

	function sortArrow(key: SortKey): string {
		if (sortKey !== key) return '';
		return sortDir === 'asc' ? '↑' : '↓';
	}
</script>

{#if sorted.length === 0}
	<div class="text-muted text-xs italic">No protocols returned.</div>
{:else}
	<div class="artifact">
		<div class="caption">
			<span class="caption-title">Protocols</span>
			<span class="caption-count">{sorted.length} rows · DefiLlama</span>
		</div>
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th class="left" aria-sort={ariaSort('name')}>
							<button type="button" onclick={() => setSort('name')}>
								Protocol <span class="arrow">{sortArrow('name')}</span>
							</button>
						</th>
						<th class="left">Category</th>
						<th class="left">Chains</th>
						<th class="right" aria-sort={ariaSort('tvlUsd')}>
							<button type="button" onclick={() => setSort('tvlUsd')}>
								TVL <span class="arrow">{sortArrow('tvlUsd')}</span>
							</button>
						</th>
						<th class="right" aria-sort={ariaSort('change1dPct')}>
							<button type="button" onclick={() => setSort('change1dPct')}>
								1d <span class="arrow">{sortArrow('change1dPct')}</span>
							</button>
						</th>
						<th class="right" aria-sort={ariaSort('change7dPct')}>
							<button type="button" onclick={() => setSort('change7dPct')}>
								7d <span class="arrow">{sortArrow('change7dPct')}</span>
							</button>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each sorted as p (p.slug)}
						<tr>
							<td class="left strong">{p.name}</td>
							<td class="left muted">{p.category}</td>
							<td class="left muted chains">
								{#if p.chains.length <= 2}
									{p.chains.join(', ')}
								{:else}
									{p.chains.slice(0, 2).join(', ')} +{p.chains.length - 2}
								{/if}
							</td>
							<td class="right tnum">{fmtUsd(p.tvlUsd)}</td>
							<td class="right tnum {pctClass(p.change1dPct)}">{fmtPct(p.change1dPct)}</td>
							<td class="right tnum {pctClass(p.change7dPct)}">{fmtPct(p.change7dPct)}</td>
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
	.chains {
		font-size: 11px;
		max-width: 160px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
