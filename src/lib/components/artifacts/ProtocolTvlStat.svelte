<!--
	Renders the output of `defillama_get_protocol_tvl`:
	{ slug, tvlUsd }

	Single stat card — big TVL number, slug as subtitle.
-->
<script lang="ts">
	import { fmtUsd } from './utils';

	type Output = { slug: string; tvlUsd: number };

	type Props = { output: unknown };
	let { output }: Props = $props();

	const o = $derived.by((): Output => {
		if (!output || typeof output !== 'object') return { slug: '', tvlUsd: 0 };
		const c = output as Partial<Output>;
		return { slug: c.slug ?? '', tvlUsd: c.tvlUsd ?? 0 };
	});
</script>

<div class="artifact">
	<div class="head">
		<div class="label">Total value locked</div>
		<div class="slug">{o.slug || '—'}</div>
	</div>
	<div class="value tnum">{fmtUsd(o.tvlUsd)}</div>
	<div class="source">DefiLlama</div>
</div>

<style>
	.artifact {
		border: 1px solid var(--color-border);
		border-radius: 12px;
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-width: 360px;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.label {
		font-size: 10px;
		color: var(--color-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.slug {
		font-size: 11px;
		color: var(--color-ink);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}
	.value {
		font-size: 30px;
		font-weight: 600;
		color: var(--color-ink);
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.source {
		font-size: 10px;
		color: var(--color-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.tnum {
		font-variant-numeric: tabular-nums;
	}
</style>
