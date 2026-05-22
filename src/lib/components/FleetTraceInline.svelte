<!--
	Inline fleet trace — Grok Expert-Mode-shaped compact trace that lives
	inside the chat thread (as opposed to FleetTrace.svelte, which owns
	the full /research/[ns]/[sid] page).

	Layout:
	  ┌─ header row ────────────────────────────┐
	  │ ●●●●● Agents thinking · 9s        [▾]  │  click to toggle
	  ├─ body (when expanded) ──────────────────┤
	  │ [agent ●] [agent ●] [agent ●]           │  compact pills
	  │                                          │
	  │ Campaign Plan Editor                     │
	  │ The user query is "test multi-agent…"   │  truncated 2 lines
	  │                                          │
	  │ POD Intelligence Journalist              │
	  │ User query appears to be a meta-test…   │
	  │                                          │
	  │ open full view ↗                         │
	  └──────────────────────────────────────────┘
	  └─ synthesis (when landed) ───────────────┐
	  │ <markdown body>                          │
	  └──────────────────────────────────────────┘

	On synthesis arrival the header auto-collapses and the synthesis
	renders below as the canonical assistant body. The user can re-expand
	at any time to inspect the back-and-forth.
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

	type Props = {
		namespace: string;
		sessionId: string;
		query: string;
		eventsWsUrl: string;
		initialAgents: SessionAgent[];
		initialThreads: SessionThread[];
		mode: 'live' | 'archived';
		startedAt: number;
	};

	let {
		namespace,
		sessionId,
		query,
		eventsWsUrl,
		initialAgents,
		initialThreads,
		mode,
		startedAt
	}: Props = $props();

	// Same Session machinery as FleetTrace.svelte. Capturing the props
	// once at construction is intentional — this component lives inside a
	// keyed list and remounts on sessionId change.
	/* svelte-ignore state_referenced_locally */
	const session = new Session({
		namespace,
		sessionId,
		eventsWsUrl,
		initialAgents,
		initialThreads: initialThreads.map((t) => ({
			...t,
			messages: t.messages ?? [],
			unread: 0
		})),
		query,
		mode
	});

	onDestroy(() => session.close());

	// Reactive views off the session.
	const messagesView = $derived(session.allMessages);
	const finalSynthesis = $derived(session.finalSynthesis);
	const synthesisPayload = $derived(session.synthesisPayload);
	const agentsList = $derived(Array.from(session.agents.values()));
	const failed = $derived(session.failed);

	// Elapsed-time ticker. Drives "Agents thinking · Xs". Both the live
	// and completed durations are measured purely client-side (against
	// `startedAt`, the dispatch instant) so the label never depends on the
	// server's message clock — that avoids both clock-skew drift and the
	// NaN we'd get if a message timestamp arrived unparseable.
	let nowMs = $state(Date.now());
	let completedAtMs = $state<number | null>(null);
	let tickHandle: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		// Freeze the completion instant once synthesis lands, and stop the
		// ticker — everything afterward is re-renders, not time-driven.
		if (finalSynthesis) {
			if (completedAtMs === null) completedAtMs = Date.now();
			if (tickHandle) {
				clearInterval(tickHandle);
				tickHandle = null;
			}
			return;
		}
		// Tick once per second while running. 1Hz is enough resolution for
		// a user-facing timer and avoids burning frames.
		tickHandle = setInterval(() => {
			nowMs = Date.now();
		}, 1000);
		return () => {
			if (tickHandle) {
				clearInterval(tickHandle);
				tickHandle = null;
			}
		};
	});

	const elapsedMs = $derived((completedAtMs ?? nowMs) - startedAt);

	function fmtElapsed(ms: number): string {
		if (!Number.isFinite(ms)) return '';
		const totalSec = Math.max(0, Math.floor(ms / 1000));
		if (totalSec < 60) return `${totalSec}s`;
		const m = Math.floor(totalSec / 60);
		const s = totalSec % 60;
		if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`;
		const h = Math.floor(m / 60);
		const rm = m % 60;
		return rm === 0 ? `${h}h` : `${h}h ${rm}m`;
	}

	const labelText = $derived(
		failed
			? 'Fleet run failed'
			: finalSynthesis
				? `Fleet completed · ${fmtElapsed(elapsedMs)}`
				: session.connected || mode === 'archived'
					? `Agents thinking · ${fmtElapsed(elapsedMs)}`
					: 'Connecting to fleet…'
	);

	// Expanded by default while running so the user sees activity. Auto-
	// collapses on first synthesis. The user can still toggle either way.
	let manuallyToggled = $state(false);
	let expanded = $state(true);

	$effect(() => {
		// Auto-collapse on synthesis arrival, but never override an
		// explicit user toggle.
		if (finalSynthesis && !manuallyToggled) {
			expanded = false;
		}
	});

	function onToggle() {
		manuallyToggled = true;
		expanded = !expanded;
	}

	// Strip the synthesis envelope from the trace reel so the raw JSON
	// doesn't leak into the mini-message bodies. Same helper as the
	// full-page FleetTrace.
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

	// Hide the final orchestrator synthesis from the reel — it renders
	// canonically below the trace as the assistant's response body, and
	// duplicating it inside the reel would be noise.
	function isFinalSynthesis(m: ThreadMessage): boolean {
		return m.senderName === 'research-orchestrator' && m.mentionNames.length === 0;
	}

	const reelMessages = $derived(messagesView.filter((m) => !isFinalSynthesis(m)));

	// Deterministic per-agent dot color so the avatar stack looks like
	// the Grok screenshot (distinct hues per agent) without us having to
	// hand-tag colors in the agent registry. Hash the name → palette idx.
	const AGENT_PALETTE = [
		'#d97757', // accent
		'#7c9eb2', // muted blue-grey
		'#a78bfa', // lavender
		'#84a98c', // sage
		'#e0a96d', // honey
		'#c08497', // dusty rose
		'#6b7a8f' // slate
	];

	function colorForAgent(name: string): string {
		let h = 0;
		for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
		const idx = Math.abs(h) % AGENT_PALETTE.length;
		return AGENT_PALETTE[idx];
	}

	function isAgentActive(agent: SessionAgent): boolean {
		const s = agent.status;
		if (s.type !== 'running') return false;
		const cs = s.connectionStatus;
		if (cs.type !== 'connected') return false;
		return cs.communicationStatus.type === 'thinking';
	}

	function commStatusLabel(agent: SessionAgent): string {
		const s = agent.status;
		if (s.type === 'stopped') return 'stopped';
		if (s.type === 'waiting') return 'waiting';
		const cs = s.connectionStatus;
		if (cs.type === 'not_connected') return 'connecting';
		return cs.communicationStatus.type;
	}

	const fullViewHref = $derived(
		`/research/${encodeURIComponent(namespace)}/${encodeURIComponent(sessionId)}` +
			(query ? `?q=${encodeURIComponent(query)}` : '')
	);
</script>

<div class="fleet-inline">
	<button
		type="button"
		class="header"
		class:running={!finalSynthesis && !failed && mode === 'live'}
		onclick={onToggle}
		aria-expanded={expanded}
	>
		<span class="avatars" aria-hidden="true">
			{#each agentsList.slice(0, 6) as agent (agent.name)}
				<span
					class="avatar"
					class:pulsing={isAgentActive(agent)}
					style:background-color={colorForAgent(agent.name)}
				></span>
			{/each}
		</span>
		<span class="label">{labelText}</span>
		<svg
			class="chevron"
			class:open={expanded}
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
			<path d="m6 9 6 6 6-6" />
		</svg>
	</button>

	{#if failed}
		<div class="fail-banner" role="alert">
			<strong>Fleet run failed.</strong>
			<span>{failed.reason}</span>
		</div>
	{/if}

	{#if expanded}
		<div class="body">
			<div class="pills">
				{#each agentsList as agent (agent.name)}
					<span class="pill">
						<span
							class="pill-dot"
							class:pulsing={isAgentActive(agent)}
							style:background-color={colorForAgent(agent.name)}
						></span>
						<span class="pill-name">{agent.name}</span>
						<span class="pill-status">{commStatusLabel(agent)}</span>
					</span>
				{/each}
			</div>

			<div class="reel">
				{#if reelMessages.length === 0}
					<div class="reel-empty">Waiting for the orchestrator's first dispatch…</div>
				{:else}
					{#each reelMessages as msg (msg.id)}
						<div class="reel-msg">
							<div class="reel-msg-head">
								<span
									class="reel-msg-dot"
									style:background-color={colorForAgent(msg.senderName)}
								></span>
								<span class="reel-msg-name">{msg.senderName}</span>
								{#if msg.mentionNames.length > 0}
									<span class="reel-msg-to">
										→ {msg.mentionNames.map((n) => '@' + n).join(', ')}
									</span>
								{/if}
							</div>
							<div class="reel-msg-body">{bodyForTrace(msg.text)}</div>
						</div>
					{/each}
				{/if}
			</div>

			<a class="open-full" href={fullViewHref}>
				open full view
				<svg
					width="11"
					height="11"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M7 17 17 7" />
					<path d="M7 7h10v10" />
				</svg>
			</a>
		</div>
	{/if}
</div>

{#if finalSynthesis}
	<div class="synthesis">
		{#if synthesisPayload?.type === 'text'}
			<Markdown text={synthesisPayload.body} variant="chat" />
		{:else}
			<Markdown text={finalSynthesis.text} variant="chat" />
		{/if}
	</div>
{/if}

<style>
	.fail-banner {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
		padding: 0.625rem 0.875rem;
		margin: 0.5rem 0.75rem 0;
		border: 1px solid color-mix(in srgb, #dc2626 35%, var(--color-border));
		background: color-mix(in srgb, #dc2626 8%, var(--color-surface));
		border-radius: 8px;
		font-size: 13px;
		color: #991b1b;
	}
	.fail-banner strong {
		font-weight: 600;
	}
	.fleet-inline {
		border: 1px solid var(--color-border);
		background: color-mix(in srgb, var(--color-ink) 1.5%, var(--color-surface));
		border-radius: 12px;
		overflow: hidden;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 14px;
		background: transparent;
		border: 0;
		cursor: pointer;
		color: var(--color-ink);
		font: inherit;
		text-align: left;
		transition: background-color 120ms ease;
	}
	.header:hover {
		background: color-mix(in srgb, var(--color-ink) 3%, transparent);
	}

	.avatars {
		display: inline-flex;
		align-items: center;
	}
	.avatar {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 2px solid var(--color-surface);
		margin-left: -5px;
	}
	.avatar:first-child {
		margin-left: 0;
	}
	.avatar.pulsing {
		animation: pulse-soft 1.6s ease-in-out infinite;
	}

	.label {
		flex: 1;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-ink);
		letter-spacing: -0.01em;
	}
	.header.running .label {
		color: color-mix(in srgb, var(--color-ink) 75%, transparent);
	}

	.chevron {
		color: var(--color-muted);
		transition: transform 180ms ease;
		flex-shrink: 0;
	}
	.chevron.open {
		transform: rotate(180deg);
	}

	.body {
		padding: 4px 14px 12px;
		border-top: 1px solid color-mix(in srgb, var(--color-ink) 6%, transparent);
	}

	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		padding: 10px 0 8px;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 9px;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-surface);
		font-size: 11px;
		line-height: 1.4;
		color: var(--color-ink);
	}
	.pill-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.pill-dot.pulsing {
		animation: pulse-soft 1.6s ease-in-out infinite;
	}
	.pill-name {
		font-weight: 500;
	}
	.pill-status {
		color: var(--color-muted);
		font-size: 10px;
		letter-spacing: 0.02em;
	}

	.reel {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 6px 0 2px;
	}
	.reel-empty {
		font-size: 12px;
		color: var(--color-muted);
		padding: 12px 0;
		text-align: center;
		font-style: italic;
	}
	.reel-msg {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.reel-msg-head {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11.5px;
		color: var(--color-muted);
	}
	.reel-msg-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.reel-msg-name {
		font-weight: 600;
		color: color-mix(in srgb, var(--color-ink) 85%, transparent);
		letter-spacing: -0.005em;
	}
	.reel-msg-to {
		color: var(--color-muted);
		font-size: 10.5px;
	}
	.reel-msg-body {
		font-size: 12.5px;
		line-height: 1.5;
		color: color-mix(in srgb, var(--color-ink) 70%, transparent);
		padding-left: 11px;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
		word-break: break-word;
	}

	.open-full {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 10px;
		font-size: 11px;
		color: var(--color-muted);
		text-decoration: none;
		letter-spacing: 0.02em;
		text-transform: lowercase;
		transition: color 120ms ease;
	}
	.open-full:hover {
		color: var(--color-ink);
	}

	.synthesis {
		margin-top: 14px;
	}

	@keyframes pulse-soft {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}
</style>
