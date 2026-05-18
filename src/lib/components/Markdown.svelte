<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';

	type Props = {
		/** Raw markdown source from an LLM. */
		text: string;
		/** Visual density preset — chat is tighter, article is looser. */
		variant?: 'chat' | 'article';
		/** Extra classes appended to the root. */
		class?: string;
	};

	let { text, variant = 'chat', class: extraClass = '' }: Props = $props();

	marked.setOptions({ gfm: true, breaks: true });

	const html = $derived.by(() => {
		if (!text) return '';
		const parsed = marked.parse(text, { async: false }) as string;
		return DOMPurify.sanitize(parsed, {
			ADD_ATTR: ['target', 'rel'],
			FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button']
		});
	});
</script>

<div class="md md-{variant} {extraClass}">{@html html}</div>

<style>
	.md :global(p) {
		margin: 0 0 0.7em 0;
	}
	.md :global(p:last-child) {
		margin-bottom: 0;
	}
	.md :global(strong) {
		font-weight: 700;
		color: var(--color-ink);
	}
	.md :global(em) {
		font-style: italic;
	}
	.md :global(a) {
		color: var(--color-ink);
		text-decoration: underline;
		text-underline-offset: 2px;
		text-decoration-color: color-mix(in srgb, var(--color-ink) 35%, transparent);
		text-decoration-thickness: 1px;
	}
	.md :global(a:hover) {
		text-decoration-color: var(--color-ink);
	}
	.md :global(ul),
	.md :global(ol) {
		margin: 0.4em 0 0.8em 0;
		padding-left: 1.4em;
	}
	.md :global(ul) {
		list-style: disc;
	}
	.md :global(ol) {
		list-style: decimal;
	}
	.md :global(li) {
		margin: 0.15em 0;
	}
	.md :global(li > p) {
		margin: 0;
	}
	.md :global(code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.88em;
		padding: 1.5px 5px;
		border-radius: 4px;
		background: color-mix(in srgb, var(--color-ink) 6%, transparent);
		border: 1px solid var(--color-border);
	}
	.md :global(pre) {
		margin: 0.6em 0 0.9em 0;
		padding: 12px 14px;
		border-radius: 10px;
		background: color-mix(in srgb, var(--color-ink) 4%, transparent);
		border: 1px solid var(--color-border);
		overflow-x: auto;
		font-size: 13px;
		line-height: 1.55;
	}
	.md :global(pre code) {
		background: transparent;
		border: none;
		padding: 0;
		font-size: inherit;
	}
	.md :global(blockquote) {
		margin: 0.6em 0;
		padding: 0.2em 0 0.2em 14px;
		border-left: 2px solid var(--color-border);
		color: var(--color-muted);
	}
	.md :global(hr) {
		border: 0;
		border-top: 1px solid var(--color-border);
		margin: 1.2em 0;
	}
	.md :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 0.6em 0 0.9em 0;
		font-size: 0.94em;
	}
	.md :global(th),
	.md :global(td) {
		border-bottom: 1px solid var(--color-border);
		padding: 6px 10px;
		text-align: left;
	}
	.md :global(th) {
		font-weight: 600;
		color: var(--color-muted);
		text-transform: uppercase;
		letter-spacing: 0.02em;
		font-size: 0.78em;
	}

	/* Heading scales differ between chat and article. Chat keeps things
	   tight; article opens up for a Perplexity-shaped reading column. */
	.md-chat :global(h1),
	.md-chat :global(h2),
	.md-chat :global(h3),
	.md-chat :global(h4) {
		font-weight: 700;
		letter-spacing: -0.01em;
		margin: 1em 0 0.4em 0;
		color: var(--color-ink);
	}
	.md-chat :global(h1) {
		font-size: 1.25em;
	}
	.md-chat :global(h2) {
		font-size: 1.12em;
	}
	.md-chat :global(h3) {
		font-size: 1.02em;
	}
	.md-chat :global(h4) {
		font-size: 0.96em;
		text-transform: uppercase;
		color: var(--color-muted);
		letter-spacing: 0.04em;
	}

	.md-article :global(h1),
	.md-article :global(h2),
	.md-article :global(h3) {
		font-weight: 800;
		letter-spacing: -0.025em;
		color: var(--color-ink);
	}
	.md-article :global(h1) {
		font-size: 1.7em;
		margin: 1.4em 0 0.5em 0;
	}
	.md-article :global(h2) {
		font-size: 1.32em;
		margin: 1.6em 0 0.5em 0;
	}
	.md-article :global(h3) {
		font-size: 1.12em;
		margin: 1.3em 0 0.4em 0;
	}
	.md-article :global(p),
	.md-article :global(li) {
		font-size: 17px;
		line-height: 1.7;
	}
	.md-article :global(p) {
		margin: 0 0 1em 0;
	}
</style>
