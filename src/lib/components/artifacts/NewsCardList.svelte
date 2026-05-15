<!--
	Renders the output of `news_get_articles`:
	{ articles: [{ title, url, source, publishedAt, publishedAtIso,
	               sentiment, categories, snippet }], count, queriedCategory }

	Stacked card list with sentiment chip, source, and time-ago.
	Titles link out to the source. Snippets truncated.
-->
<script lang="ts">
	import { timeAgo, urlHost } from './utils';

	type Article = {
		title: string;
		url: string;
		source: string;
		publishedAt: number;
		publishedAtIso?: string;
		sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | null;
		categories: string[];
		snippet: string;
	};

	type Output = { articles: Article[]; count?: number; queriedCategory?: string | null };

	type Props = { output: unknown };
	let { output }: Props = $props();

	const articles = $derived(
		(output && typeof output === 'object' && 'articles' in output
			? (output as Output).articles
			: []) ?? []
	);
	const queriedCategory = $derived(
		(output && typeof output === 'object' && 'queriedCategory' in output
			? (output as Output).queriedCategory
			: null) ?? null
	);

	function sentimentClass(s: Article['sentiment']): string {
		if (s === 'POSITIVE') return 'sent-pos';
		if (s === 'NEGATIVE') return 'sent-neg';
		if (s === 'NEUTRAL') return 'sent-neu';
		return '';
	}
</script>

{#if articles.length === 0}
	<div class="text-muted text-xs italic">No articles returned.</div>
{:else}
	<div class="artifact">
		<div class="caption">
			<span class="caption-title">News</span>
			<span class="caption-count">
				{articles.length} articles · CoinDesk{queriedCategory ? ` · ${queriedCategory}` : ''}
			</span>
		</div>
		<ul class="list">
			{#each articles as a (a.url)}
				<li class="card">
					<a class="title" href={a.url} target="_blank" rel="noopener noreferrer">
						{a.title}
					</a>
					<div class="meta">
						<span class="source">{a.source || urlHost(a.url)}</span>
						<span class="dot">·</span>
						<span class="time">{timeAgo(a.publishedAt)}</span>
						{#if a.sentiment}
							<span class="dot">·</span>
							<span class="sentiment {sentimentClass(a.sentiment)}">
								{a.sentiment.toLowerCase()}
							</span>
						{/if}
					</div>
					{#if a.snippet}
						<p class="snippet">{a.snippet}</p>
					{/if}
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
		max-height: 480px;
		overflow-y: auto;
	}
	.card {
		padding: 12px 14px;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 35%, transparent);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.card:last-child {
		border-bottom: none;
	}
	.card:hover {
		background: color-mix(in srgb, var(--color-ink) 2%, transparent);
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
	.source {
		font-weight: 500;
	}

	.sentiment {
		font-weight: 500;
		padding: 1px 6px;
		border-radius: 4px;
		letter-spacing: 0.02em;
	}
	.sent-pos {
		background: color-mix(in srgb, var(--color-positive) 14%, transparent);
		color: var(--color-positive);
	}
	.sent-neg {
		background: color-mix(in srgb, var(--color-negative) 14%, transparent);
		color: var(--color-negative);
	}
	.sent-neu {
		background: color-mix(in srgb, var(--color-muted) 14%, transparent);
		color: var(--color-muted);
	}

	.snippet {
		margin: 4px 0 0;
		font-size: 12.5px;
		line-height: 1.45;
		color: color-mix(in srgb, var(--color-ink) 75%, var(--color-muted));
		max-width: 70ch;
	}
</style>
