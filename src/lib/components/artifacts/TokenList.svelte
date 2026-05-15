<!--
	Renders the output of `jupiter_search_tokens`:
	{ tokens: [{ mint, symbol, name, decimals, icon }] }

	Compact row list: icon | symbol/name | short mint. Click-to-copy
	the full mint to clipboard.
-->
<script lang="ts">
	import { shortAddr } from './utils';

	type Token = {
		mint: string;
		symbol: string;
		name: string;
		decimals: number;
		icon?: string;
	};

	type Output = { tokens: Token[] };

	type Props = { output: unknown };
	let { output }: Props = $props();

	const tokens = $derived(
		(output && typeof output === 'object' && 'tokens' in output
			? (output as Output).tokens
			: []) ?? []
	);

	let copied = $state<string | null>(null);

	async function copyMint(mint: string) {
		try {
			await navigator.clipboard.writeText(mint);
			copied = mint;
			setTimeout(() => {
				if (copied === mint) copied = null;
			}, 1200);
		} catch {
			/* clipboard unavailable — silent no-op */
		}
	}
</script>

{#if tokens.length === 0}
	<div class="text-muted text-xs italic">No tokens returned.</div>
{:else}
	<div class="artifact">
		<div class="caption">
			<span class="caption-title">Tokens</span>
			<span class="caption-count">{tokens.length} · Jupiter</span>
		</div>
		<ul class="list">
			{#each tokens as t (t.mint)}
				<li class="row">
					<div class="icon">
						{#if t.icon}
							<img src={t.icon} alt="" loading="lazy" />
						{:else}
							<span class="icon-fallback">{t.symbol.slice(0, 2)}</span>
						{/if}
					</div>
					<div class="meta">
						<div class="line1">
							<span class="symbol">{t.symbol}</span>
							<span class="name">{t.name}</span>
						</div>
						<button
							type="button"
							class="mint"
							onclick={() => copyMint(t.mint)}
							title="Copy mint address"
						>
							{shortAddr(t.mint, 4, 4)}
							<span class="copy-hint">{copied === t.mint ? 'copied' : 'copy'}</span>
						</button>
					</div>
					<div class="decimals">{t.decimals}d</div>
				</li>
			{/each}
		</ul>
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
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 360px;
		overflow-y: auto;
	}
	.row {
		display: grid;
		grid-template-columns: 32px 1fr auto;
		gap: 12px;
		align-items: center;
		padding: 10px 14px;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 35%, transparent);
	}
	.row:last-child {
		border-bottom: none;
	}
	.row:hover {
		background: color-mix(in srgb, var(--color-ink) 2%, transparent);
	}

	.icon {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		overflow: hidden;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.icon img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.icon-fallback {
		font-size: 10px;
		font-weight: 600;
		color: var(--color-muted);
		text-transform: uppercase;
	}

	.meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.line1 {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.symbol {
		font-size: 13px;
		font-weight: 600;
		color: var(--color-ink);
		letter-spacing: -0.01em;
	}
	.name {
		font-size: 12px;
		color: var(--color-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.mint {
		all: unset;
		font-size: 11px;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		color: var(--color-muted);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.mint:hover {
		color: var(--color-ink);
	}
	.copy-hint {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		opacity: 0.6;
	}
	.decimals {
		font-size: 10px;
		color: var(--color-muted);
		font-variant-numeric: tabular-nums;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
</style>
