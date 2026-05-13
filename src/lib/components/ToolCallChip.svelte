<!--
	Inline tool-call chip for the chat thread. Mirrors Claude's chip
	pattern:

	- Collapsed (default): small pill with a status dot, tool name, and
	  a one-line summary derived from input args. Click to expand.
	- Expanded: shows the full input JSON and output JSON side-by-side
	  (well, stacked — narrow column).
	- States: streaming inputs animate with a soft pulse; final state
	  shows the outcome (success or error).

	Receives one `tool-${toolName}` AI SDK part. The `state` field on
	the part drives the visual state.
-->
<script lang="ts">
	type ToolPart = {
		type: string; // `tool-${name}`
		toolCallId?: string;
		state?: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
		input?: unknown;
		output?: unknown;
		errorText?: string;
	};

	type Props = { part: ToolPart };
	let { part }: Props = $props();

	let expanded = $state(false);

	const toolName = $derived(part.type.replace(/^tool-/, ''));
	const isError = $derived(part.state === 'output-error');
	const isStreaming = $derived(
		part.state === 'input-streaming' || part.state === 'input-available'
	);
	const isDone = $derived(part.state === 'output-available' || part.state === 'output-error');

	function summarize(input: unknown): string {
		if (!input || typeof input !== 'object') return '';
		const obj = input as Record<string, unknown>;
		// Cherry-pick a few common arg fields for the chip summary.
		// Falls back to JSON snippet for anything else.
		if (typeof obj.query === 'string') return obj.query;
		if (typeof obj.slug === 'string') return obj.slug;
		if (typeof obj.symbol === 'string') return obj.symbol;
		if (typeof obj.chain === 'string') return obj.chain;
		if (typeof obj.category === 'string') return obj.category;
		if (Array.isArray(obj.mints)) return `${obj.mints.length} mint(s)`;
		if (Array.isArray(obj.coins)) return `${obj.coins.length} coin(s)`;
		const json = JSON.stringify(obj);
		return json.length > 60 ? json.slice(0, 60) + '…' : json;
	}

	const summary = $derived(summarize(part.input));

	function statusDotClass(): string {
		if (isError) return 'dot-error';
		if (isDone) return 'dot-done';
		return 'dot-streaming';
	}
</script>

<button
	type="button"
	class="chip"
	class:expanded
	class:streaming={isStreaming}
	class:errored={isError}
	onclick={() => (expanded = !expanded)}
	aria-expanded={expanded}
>
	<span class="dot {statusDotClass()}"></span>
	<span class="tool-name">{toolName}</span>
	{#if summary}
		<span class="summary">{summary}</span>
	{/if}
	{#if isStreaming}
		<span class="status">…</span>
	{/if}
</button>

{#if expanded}
	<div class="detail">
		<div class="detail-section">
			<div class="detail-label">Input</div>
			<pre>{JSON.stringify(part.input ?? {}, null, 2)}</pre>
		</div>
		{#if part.output !== undefined}
			<div class="detail-section">
				<div class="detail-label">Output</div>
				<pre>{JSON.stringify(part.output, null, 2)}</pre>
			</div>
		{/if}
		{#if part.errorText}
			<div class="detail-section">
				<div class="detail-label">Error</div>
				<pre class="error">{part.errorText}</pre>
			</div>
		{/if}
	</div>
{/if}

<style>
	.chip {
		all: unset;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		padding: 4px 10px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-ink) 4%, var(--color-surface));
		border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
		font-size: 12px;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		cursor: pointer;
		transition:
			background-color 120ms ease,
			border-color 120ms ease;
	}
	.chip:hover {
		background: color-mix(in srgb, var(--color-ink) 7%, var(--color-surface));
	}
	.chip.errored {
		border-color: color-mix(in srgb, #dc2626 40%, transparent);
		background: color-mix(in srgb, #dc2626 6%, var(--color-surface));
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.dot-streaming {
		background: var(--color-accent, #d97757);
		animation: pulse 1.2s ease-in-out infinite;
	}
	.dot-done {
		background: #16a34a;
	}
	.dot-error {
		background: #dc2626;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 0.45;
		}
		50% {
			opacity: 1;
		}
	}

	.tool-name {
		font-weight: 600;
		color: var(--color-ink);
	}
	.summary {
		color: var(--color-muted);
		font-weight: 400;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 360px;
	}
	.status {
		color: var(--color-muted);
		margin-left: 2px;
	}

	.detail {
		margin-top: 6px;
		padding: 8px 10px;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: color-mix(in srgb, var(--color-surface) 70%, transparent);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 11px;
		max-width: 100%;
	}
	.detail-section + .detail-section {
		margin-top: 8px;
	}
	.detail-label {
		color: var(--color-muted);
		text-transform: uppercase;
		font-size: 10px;
		letter-spacing: 0.05em;
		margin-bottom: 3px;
	}
	pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--color-ink);
		max-height: 240px;
		overflow-y: auto;
	}
	pre.error {
		color: #b91c1c;
	}
</style>
