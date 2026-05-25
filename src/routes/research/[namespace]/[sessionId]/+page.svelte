<!--
	Thin shell over `<FleetTrace>`. The `{#key data.sessionId}` block
	forces the trace component to remount whenever the session ID
	changes, which is the only safe way to swap fleet runs: `<FleetTrace>`
	constructs a `Session` (with its own WebSocket) at mount time and
	doesn't tear it down on prop changes. Without the key, navigating
	`/research/A/X → /research/A/Y` would keep the X session's WS open
	while the URL claims Y.
-->
<script lang="ts">
	import FleetTrace from '$lib/components/FleetTrace.svelte';
	import FleetTraceInline from '$lib/components/FleetTraceInline.svelte';
	import FleetRunChat from '$lib/components/FleetRunChat.svelte';
	import DreamInspector from '$lib/components/DreamInspector.svelte';
	import type { SessionAgent, SessionThread } from '$lib/session.svelte';
	import type { PageData } from './$types';

	type Props = { data: PageData };
	let { data }: Props = $props();

	// B.5 (§17): the condensed Grok-style trace is the default on the run
	// page; "Full trace" swaps to the verbose raw FleetTrace. Only one is
	// mounted at a time, so there's never a duplicate Session/WS.
	let traceView = $state<'condensed' | 'full'>('condensed');

	const completedAt = $derived(
		typeof data.archivedAt === 'number' ? data.archivedAt : undefined
	);
</script>

{#key data.sessionId}
	<div class="trace-shell">
		<div class="trace-toggle" role="group" aria-label="Trace view">
			<button
				type="button"
				class:active={traceView === 'condensed'}
				onclick={() => (traceView = 'condensed')}
			>
				Condensed
			</button>
			<button
				type="button"
				class:active={traceView === 'full'}
				onclick={() => (traceView = 'full')}
			>
				Full trace
			</button>
		</div>

		{#if traceView === 'condensed'}
			<FleetTraceInline
				namespace={data.namespace}
				sessionId={data.sessionId}
				query={data.query}
				eventsWsUrl={data.eventsWsUrl}
				initialAgents={data.initialAgents as SessionAgent[]}
				initialThreads={data.initialThreads as SessionThread[]}
				mode={data.mode}
				startedAt={data.startedAt}
				{completedAt}
			/>
		{:else}
			<FleetTrace {data} />
		{/if}
	</div>

	<!-- Completed-run surfaces (§17): the dream inspector (what this run
	     taught Fabrick) + the run-anchored follow-up chat. -->
	{#if data.mode === 'archived'}
		<DreamInspector atoms={data.dreamAtoms} />
		<FleetRunChat sessionId={data.sessionId} initialChat={data.chat} />
	{/if}
{/key}

<style>
	.trace-shell {
		max-width: 760px;
		margin: 0 auto;
		padding: 24px 32px 0;
	}
	.trace-toggle {
		display: inline-flex;
		gap: 2px;
		margin-bottom: 16px;
		padding: 2px;
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		background: var(--color-surface);
	}
	.trace-toggle button {
		all: unset;
		cursor: pointer;
		padding: 5px 14px;
		border-radius: 9999px;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-muted);
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}
	.trace-toggle button:hover {
		color: var(--color-ink);
	}
	.trace-toggle button.active {
		background: var(--color-ink);
		color: var(--color-surface);
	}
</style>
