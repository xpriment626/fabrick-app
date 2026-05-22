<!--
	Fleet trace UI — agent status row + final-synthesis callout + raw
	message trace. Lifted out of `/research/[ns]/[sid]/+page.svelte` so
	the parent page can wrap it in `{#key data.sessionId}` and force a
	full remount when the user navigates between fleet runs.

	The previous in-place layout reused a single Session instance across
	sessionId changes, which left a stale WebSocket connected to one run
	while the URL claimed a different run. With this split, the parent's
	`{#key}` guarantees a fresh Session — fresh WS, fresh state — for
	every sessionId.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		Session,
		FLEET_SYNTHESIS_ENVELOPE_KEY,
		type SessionAgent,
		type SessionThread,
		type ThreadMessage,
		type FleetSynthesis
	} from '$lib/session.svelte';
	import Markdown from '$lib/components/Markdown.svelte';

	type FleetTraceData = {
		namespace: string;
		sessionId: string;
		query: string;
		eventsWsUrl: string;
		initialAgents: unknown;
		initialThreads: unknown;
		mode: 'archived' | 'live';
		archivedAt: number | string | null;
	};

	type Props = { data: FleetTraceData };
	let { data }: Props = $props();

	// Instantiate the reactive Session with the SSR snapshot. The
	// constructor seeds state immediately, then (in the browser) opens
	// the WebSocket and begins applying live events — unless `mode` is
	// 'archived', in which case the snapshot IS the final state and no
	// WS subscription opens. `data` is captured here intentionally;
	// remount-on-sessionId-change is the parent's responsibility via
	// `{#key data.sessionId}`, so these reads never go stale.
	/* svelte-ignore state_referenced_locally */
	const session = new Session({
		// svelte-ignore state_referenced_locally
		namespace: data.namespace,
		// svelte-ignore state_referenced_locally
		sessionId: data.sessionId,
		// svelte-ignore state_referenced_locally
		eventsWsUrl: data.eventsWsUrl,
		// svelte-ignore state_referenced_locally
		initialAgents: data.initialAgents as SessionAgent[],
		// svelte-ignore state_referenced_locally
		initialThreads: (data.initialThreads as SessionThread[]).map((t) => ({
			...t,
			messages: t.messages ?? [],
			unread: 0
		})),
		// svelte-ignore state_referenced_locally
		query: data.query,
		// svelte-ignore state_referenced_locally
		mode: data.mode
	});

	const isArchived = $derived(data.mode === 'archived');
	const archivedAtLabel = $derived.by(() => {
		if (!data.archivedAt) return '';
		const d = new Date(data.archivedAt);
		return d.toLocaleString([], {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	});

	onDestroy(() => session.close());

	const messagesView = $derived(session.allMessages);
	const finalSynthesis = $derived(session.finalSynthesis);
	const synthesisPayload = $derived(session.synthesisPayload);
	const agentsList = $derived(Array.from(session.agents.values()));
	const failed = $derived(session.failed);

	/** Best-effort body text for a trace message — unwraps the synthesis
	 *  envelope when present so the raw JSON doesn't render in the trace
	 *  reel. Falls through to the raw text for everything else. */
	function bodyForTrace(text: string): string {
		if (!text || text[0] !== '{') return text;
		try {
			const parsed = JSON.parse(text) as Record<string, unknown>;
			const inner = parsed[FLEET_SYNTHESIS_ENVELOPE_KEY] as FleetSynthesis | undefined;
			if (inner?.type === 'text' && typeof inner.body === 'string') return inner.body;
		} catch {
			/* not JSON, render raw */
		}
		return text;
	}

	function commStatusLabel(agent: SessionAgent): string {
		const s = agent.status;
		if (s.type === 'stopped') return 'stopped';
		if (s.type === 'waiting') return 'waiting';
		// running
		const cs = s.connectionStatus;
		if (cs.type === 'not_connected') return 'connecting';
		return cs.communicationStatus.type; // thinking | waiting_message | sleeping
	}

	function commStatusColor(agent: SessionAgent): string {
		const label = commStatusLabel(agent);
		if (label === 'thinking') return 'var(--color-accent, #d97757)';
		if (label === 'waiting_message') return 'var(--color-muted)';
		if (label === 'stopped') return '#999';
		if (label === 'sleeping') return '#aaa';
		return 'var(--color-ink)';
	}

	function formatTs(unixMs: number): string {
		const d = new Date(unixMs);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function isOrchestratorSynthesis(m: ThreadMessage): boolean {
		return m.senderName === 'research-orchestrator' && m.mentionNames.length === 0;
	}
</script>

<main class="mx-auto max-w-[1100px] px-10 py-8">
	<!-- Header: query + connection indicator -->
	<header class="mb-6">
		<div class="mb-1 flex items-center gap-3">
			<span
				class="inline-block h-2 w-2 rounded-full"
				style:background-color={isArchived ? '#a78bfa' : session.connected ? '#16a34a' : '#999'}
			></span>
			<span class="text-muted text-xs uppercase tracking-wide">
				{isArchived
					? `Archived · ${archivedAtLabel}`
					: session.connected
						? 'Live'
						: 'Disconnected'}
				· {data.namespace} / {data.sessionId.slice(0, 8)}
			</span>
		</div>
		<h1 class="text-ink text-[28px] font-extrabold leading-snug tracking-[-0.03em]">
			{data.query || 'Research session'}
		</h1>
	</header>

	{#if failed}
		<div class="mb-6 rounded-lg border border-[#dc2626]/35 bg-[#dc2626]/10 p-4" role="alert">
			<div class="text-[15px] text-[#991b1b]">
				<strong class="font-semibold">Fleet run failed.</strong>
				{failed.reason}
			</div>
		</div>
	{/if}

	<!-- Agent status row -->
	<section class="mb-6">
		<div class="text-muted mb-2 text-xs uppercase tracking-wide">Fleet</div>
		<div class="flex flex-wrap gap-2">
			{#each agentsList as agent (agent.name)}
				<div
					class="border-border bg-surface flex items-center gap-2 rounded-full border px-3 py-1.5"
				>
					<span
						class="h-1.5 w-1.5 rounded-full"
						style:background-color={commStatusColor(agent)}
					></span>
					<span class="text-ink text-sm font-medium">{agent.name}</span>
					<span class="text-muted text-xs">{commStatusLabel(agent)}</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- Final synthesis callout — appears the moment it lands. Switches
	     on the typed payload (v0: only `text`). Falls back to the raw
	     message body for legacy runs that didn't ship an envelope. -->
	{#if finalSynthesis}
		<section class="mb-6 rounded-lg border border-[#d97757]/30 bg-[#d97757]/5 p-5">
			<div class="text-muted mb-2 text-xs uppercase tracking-wide">Synthesis</div>
			{#if synthesisPayload?.type === 'text'}
				<Markdown
					text={synthesisPayload.body}
					variant="chat"
					class="text-ink text-[15px] leading-relaxed"
				/>
			{:else}
				<Markdown
					text={finalSynthesis.text}
					variant="chat"
					class="text-ink text-[15px] leading-relaxed"
				/>
			{/if}
			<div class="text-muted mt-3 text-xs">
				{formatTs(finalSynthesis.timestamp)}
			</div>
		</section>
	{/if}

	<!-- Trace reel -->
	<section>
		<div class="text-muted mb-2 text-xs uppercase tracking-wide">Trace</div>
		{#if messagesView.length === 0}
			<div class="text-muted py-8 text-center text-sm">
				Waiting for the orchestrator's first dispatch…
			</div>
		{:else}
			<ol class="space-y-3">
				{#each messagesView as msg (msg.id)}
					<li
						class="border-border bg-surface rounded-md border p-4"
						class:ring-1={isOrchestratorSynthesis(msg)}
						class:ring-\[\#d97757\]={isOrchestratorSynthesis(msg)}
					>
						<div class="mb-1.5 flex items-baseline justify-between">
							<div class="flex items-center gap-2">
								<span class="text-ink text-sm font-semibold">{msg.senderName}</span>
								{#if msg.mentionNames.length > 0}
									<span class="text-muted text-xs">
										→ {msg.mentionNames.map((n) => '@' + n).join(', ')}
									</span>
								{/if}
							</div>
							<span class="text-muted text-xs">{formatTs(msg.timestamp)}</span>
						</div>
						<Markdown
							text={bodyForTrace(msg.text)}
							variant="chat"
							class="text-ink text-sm leading-relaxed"
						/>
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</main>
