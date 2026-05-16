<!--
	Renders the `suggest_fleet` tool output as a clickable chip below the
	assistant's prose framing. The chat agent calls `suggest_fleet({
	query, reason })` when it recognizes a fleet-shaped question; this
	component surfaces a one-click affordance to dispatch the 7-agent
	research fleet against that query.

	Click → POST /api/fleet/run → navigate to /research/[ns]/[sid].
-->
<script lang="ts">
	import { goto } from '$app/navigation';

	type Output = { ack?: boolean; query?: string; reason?: string };

	type Props = { output: unknown };
	let { output }: Props = $props();

	const parsed = $derived.by<Output | null>(() => {
		if (!output || typeof output !== 'object') return null;
		return output as Output;
	});

	let dispatching = $state(false);
	let errorMsg = $state<string | null>(null);

	async function dispatch() {
		const query = parsed?.query?.trim();
		if (!query || dispatching) return;
		dispatching = true;
		errorMsg = null;
		try {
			const res = await fetch('/api/fleet/run', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query })
			});
			if (!res.ok) {
				const body = await res.text().catch(() => '');
				throw new Error(`${res.status} ${body || res.statusText}`);
			}
			const data = (await res.json()) as { redirectTo?: string };
			if (!data.redirectTo) throw new Error('Server returned no redirectTo');
			await goto(data.redirectTo);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			dispatching = false;
		}
	}
</script>

{#if parsed?.query}
	<button
		type="button"
		class="chip"
		onclick={dispatch}
		disabled={dispatching}
		aria-label="Run with Fleet"
	>
		<span class="lead">
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="m13 2-3 7h6l-3 13" />
			</svg>
		</span>
		<span class="text">
			<span class="label">{dispatching ? 'Dispatching fleet…' : 'Run with Fleet'}</span>
			{#if parsed.reason}
				<span class="reason">{parsed.reason}</span>
			{/if}
		</span>
		<span class="trail" aria-hidden="true">↗</span>
	</button>

	{#if errorMsg}
		<div class="err" role="alert">{errorMsg}</div>
	{/if}
{/if}

<style>
	.chip {
		all: unset;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--color-ink) 4%, var(--color-surface));
		border: 1px solid var(--color-border);
		cursor: pointer;
		max-width: 100%;
		transition:
			background 140ms ease,
			border-color 140ms ease,
			transform 140ms ease;
	}
	.chip:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-ink) 6%, var(--color-surface));
		border-color: color-mix(in srgb, var(--color-ink) 18%, var(--color-border));
	}
	.chip:active:not(:disabled) {
		transform: scale(0.99);
	}
	.chip:disabled {
		opacity: 0.7;
		cursor: default;
	}

	.lead {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--color-ink);
		color: var(--color-bg);
		flex-shrink: 0;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.label {
		font-size: 13px;
		font-weight: 600;
		color: var(--color-ink);
		letter-spacing: -0.005em;
	}
	.reason {
		font-size: 12px;
		color: var(--color-muted);
		line-height: 1.35;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.trail {
		font-size: 13px;
		color: var(--color-muted);
		opacity: 0.7;
		margin-left: 4px;
	}

	.err {
		margin-top: 8px;
		padding: 6px 10px;
		font-size: 12px;
		color: var(--color-negative);
		background: color-mix(in srgb, var(--color-negative) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-negative) 28%, transparent);
		border-radius: 8px;
	}
</style>
