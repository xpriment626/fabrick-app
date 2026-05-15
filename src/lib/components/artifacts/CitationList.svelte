<!--
	Renders the output of `exa_web_search`:
	{ results: [{ title, url, published, snippet }] }

	Simpler than NewsCardList — no sentiment, no source metadata, just
	a tight numbered citation list. Title links out, host + date as
	subtitle, snippet beneath.
-->
<script lang="ts">
	import { urlHost, timeAgo } from './utils';

	type Result = {
		title: string;
		url: string;
		published: string | null;
		snippet: string;
	};

	type Output = { results: Result[] };

	type Props = { output: unknown };
	let { output }: Props = $props();

	const results = $derived(
		(output && typeof output === 'object' && 'results' in output
			? (output as Output).results
			: []) ?? []
	);
</script>

{#if results.length === 0}
	<div class="text-muted text-xs italic">No results returned.</div>
{:else}
	<div class="artifact">
		<div class="caption">
			<span class="caption-title">Web results</span>
			<span class="caption-count">{results.length} · Exa</span>
		</div>
		<ol class="list">
			{#each results as r, i (r.url)}
				<li class="card">
					<span class="index">{i + 1}</span>
					<div class="body">
						<a class="title" href={r.url} target="_blank" rel="noopener noreferrer">
							{r.title || urlHost(r.url)}
						</a>
						<div class="meta">
							<span class="host">{urlHost(r.url)}</span>
							{#if r.published}
								<span class="dot">·</span>
								<span>{timeAgo(r.published)}</span>
							{/if}
						</div>
						{#if r.snippet}
							<p class="snippet">{r.snippet}</p>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
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
	}
	.card {
		display: grid;
		grid-template-columns: 28px 1fr;
		gap: 10px;
		padding: 12px 14px;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 35%, transparent);
	}
	.card:last-child {
		border-bottom: none;
	}
	.card:hover {
		background: color-mix(in srgb, var(--color-ink) 2%, transparent);
	}

	.index {
		font-size: 11px;
		color: var(--color-muted);
		font-variant-numeric: tabular-nums;
		padding-top: 2px;
		text-align: center;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.title {
		font-size: 13.5px;
		font-weight: 600;
		color: var(--color-ink);
		text-decoration: none;
		letter-spacing: -0.005em;
		line-height: 1.35;
	}
	.title:hover {
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--color-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.meta .dot {
		opacity: 0.5;
	}

	.snippet {
		margin: 4px 0 0;
		font-size: 12.5px;
		line-height: 1.45;
		color: color-mix(in srgb, var(--color-ink) 75%, var(--color-muted));
		max-width: 70ch;
	}
</style>
