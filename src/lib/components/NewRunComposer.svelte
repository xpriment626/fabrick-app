<!--
	New Run composer (design.md §17 Phase C). The deliberate fleet-dispatch
	affordance on the Fleet control panel — the canonical entry point now that
	the ambient bar is gone. Pick a composition + describe the run → POST
	/api/fleet/run → navigate to the live run page.

	Composition picker is data-driven; v0 ships only `research` (the one
	FleetMode), but the shape is ready for dashboard/strategy/etc.
-->
<script lang="ts">
	import { goto } from '$app/navigation';

	type Composition = { id: string; label: string; blurb: string };

	type Props = {
		/** Compositions available to dispatch. Defaults to the v0 set. */
		compositions?: Composition[];
	};
	let {
		compositions = [
			{
				id: 'research',
				label: 'Deep Research',
				blurb: 'Multi-source synthesis across onchain, news, and X — a footnoted report.'
			}
		]
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	let selected = $state(compositions[0]?.id ?? 'research');
	let value = $state('');
	let dispatching = $state(false);
	let errorMsg = $state<string | null>(null);

	const activeBlurb = $derived(
		compositions.find((c) => c.id === selected)?.blurb ?? ''
	);
	const canRun = $derived(value.trim().length > 0 && !dispatching);

	async function run() {
		const query = value.trim();
		if (!query || dispatching) return;
		dispatching = true;
		errorMsg = null;
		try {
			const res = await fetch('/api/fleet/run', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query, mode: selected })
			});
			if (!res.ok) {
				const body = await res.text().catch(() => '');
				throw new Error(`dispatch failed: ${res.status} ${body || res.statusText}`);
			}
			const out = (await res.json()) as { redirectTo?: string };
			if (!out.redirectTo) throw new Error('dispatch returned no redirect');
			await goto(out.redirectTo);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			dispatching = false;
		}
		// On success we navigate away, so no need to reset `dispatching`.
	}

	function onKeydown(e: KeyboardEvent) {
		// Cmd/Ctrl+Enter dispatches; plain Enter inserts a newline (this is a
		// run brief, not a chat line).
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			run();
		}
	}
</script>

<div class="composer">
	{#if compositions.length > 1}
		<div class="picker" role="tablist" aria-label="Composition">
			{#each compositions as comp (comp.id)}
				<button
					type="button"
					role="tab"
					aria-selected={selected === comp.id}
					class:active={selected === comp.id}
					onclick={() => (selected = comp.id)}
				>
					{comp.label}
				</button>
			{/each}
		</div>
	{/if}

	<div class="field">
		<textarea
			bind:value
			rows="2"
			placeholder="Describe a research run for the fleet…"
			disabled={dispatching}
			onkeydown={onKeydown}
			aria-label="New run brief"
		></textarea>
		<div class="row">
			<span class="blurb">
				{#if compositions.length === 1}<strong>{compositions[0].label}</strong> · {/if}{activeBlurb}
			</span>
			<button type="button" class="run" disabled={!canRun} onclick={run}>
				{dispatching ? 'Dispatching…' : 'Run'}
			</button>
		</div>
	</div>

	{#if errorMsg}
		<div class="err" role="alert">{errorMsg}</div>
	{/if}
</div>

<style>
	.composer {
		border: 1px solid var(--color-border);
		border-radius: 16px;
		background: var(--color-surface);
		padding: 14px;
		margin-bottom: 28px;
	}
	.picker {
		display: flex;
		gap: 6px;
		margin-bottom: 10px;
	}
	.picker button {
		all: unset;
		cursor: pointer;
		padding: 4px 12px;
		border-radius: 9999px;
		border: 1px solid var(--color-border);
		font-size: 13px;
		font-weight: 500;
		color: var(--color-muted);
	}
	.picker button.active {
		background: var(--color-ink);
		color: var(--color-surface);
		border-color: var(--color-ink);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	textarea {
		all: unset;
		width: 100%;
		box-sizing: border-box;
		font-family: inherit;
		font-size: 15px;
		line-height: 1.5;
		color: var(--color-ink);
		resize: none;
		min-height: 44px;
	}
	textarea::placeholder {
		color: var(--color-muted);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.blurb {
		font-size: 12.5px;
		color: var(--color-muted);
		line-height: 1.4;
	}
	.blurb strong {
		color: var(--color-ink);
		font-weight: 600;
	}
	.run {
		all: unset;
		cursor: pointer;
		flex-shrink: 0;
		padding: 8px 20px;
		border-radius: 9999px;
		background: var(--color-ink);
		color: var(--color-surface);
		font-size: 13px;
		font-weight: 600;
		transition: opacity 120ms ease;
	}
	.run:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.err {
		margin-top: 10px;
		font-size: 13px;
		color: #b91c1c;
	}
</style>
