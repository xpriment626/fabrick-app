<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import ToolCallChip from '$lib/components/ToolCallChip.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import ChatComposer from '$lib/components/ChatComposer.svelte';
	import FleetTraceInline from '$lib/components/FleetTraceInline.svelte';
	import { getArtifactRenderer, shouldSuppressChip } from '$lib/components/artifacts/registry';
	import { readUIMessages } from '$lib/client/ui-message-stream';
	import type { PageData } from './$types';
	import type { ChatTurn, TurnPart } from '$lib/server/db/chats';
	import type { SessionAgent, SessionThread } from '$lib/session.svelte';

	/** Client-only part the chat page synthesizes when a fleet run is
	 *  dispatched from this chat. Carries everything FleetTraceInline
	 *  needs to subscribe to the live Coral session. Not persisted as a
	 *  research_turn — on reload, prior runs appear in the existing
	 *  `data.fleetRuns` re-entry list at the top of the chat. */
	type FleetTracePart = {
		type: 'fleet-trace';
		namespace: string;
		sessionId: string;
		eventsWsUrl: string;
		query: string;
		startedAt: number;
		initialAgents: SessionAgent[];
		initialThreads: SessionThread[];
		mode: 'live' | 'archived';
	};

	type Props = { data: PageData };
	let { data }: Props = $props();

	// Local reactive copy of turns — server-loaded turns + any
	// in-flight turn we're streaming. Intentional initial-value
	// capture; the $effect.pre below resyncs from `data` on slug change.
	// svelte-ignore state_referenced_locally
	let turns = $state<ChatTurn[]>([...data.chat.turns]);
	let composeValue = $state('');
	let streaming = $state(false);
	let errorMsg = $state<string | null>(null);
	let listEl: HTMLDivElement;
	let fleetMode = $state(false);
	let dispatchingFleet = $state(false);

	// Sticky scroll: only auto-scroll the message list when the user is
	// already at (or near) the bottom. If they scrolled up to read older
	// content, leave them where they are while streaming continues
	// invisibly below.
	let stickToBottom = $state(true);
	const STICK_THRESHOLD_PX = 80;

	// SvelteKit reuses this component instance when the user navigates
	// between chat slugs (/chat/A → /chat/B). The `data` prop updates
	// reactively, but local `$state` is initialized once at component
	// construction — so without this effect, navigating to a different
	// chat would keep the prior chat's turns rendered on screen and
	// "silently" only refresh on hard reload.
	//
	// Reset every piece of local state when the slug changes, so the new
	// chat loads as if from a fresh mount.
	// svelte-ignore state_referenced_locally
	let currentSlug = $state(data.chat.slug);
	$effect.pre(() => {
		if (data.chat.slug === currentSlug) return;
		currentSlug = data.chat.slug;
		turns = [...data.chat.turns];
		composeValue = '';
		streaming = false;
		dispatchingFleet = false;
		fleetMode = false;
		errorMsg = null;
		stickToBottom = true;
		// Defer scroll until after Svelte renders the new turns.
		queueMicrotask(() => scrollToBottom({ force: true }));
	});

	function updateStickFromScroll() {
		if (!listEl) return;
		const distanceFromBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
		stickToBottom = distanceFromBottom < STICK_THRESHOLD_PX;
	}

	const placeholder = $derived(
		dispatchingFleet
			? 'Dispatching fleet…'
			: streaming
				? 'Thinking…'
				: fleetMode
					? 'Ask the fleet a research question…'
					: 'Ask anything…'
	);

	async function dispatchFleet(content: string) {
		if (dispatchingFleet) return;
		dispatchingFleet = true;
		errorMsg = null;

		// Optimistically render the user's query as a chat bubble. Not
		// persisted server-side yet (the kickoff endpoint only writes a
		// research_runs row); on reload it disappears, the same way the
		// pre-inline behavior worked.
		const userTurnId = `local-user-${Date.now()}`;
		turns = [
			...turns,
			{
				id: userTurnId,
				role: 'user',
				agentName: null,
				content,
				parts: null,
				status: 'complete',
				runId: null,
				createdAt: new Date().toISOString()
			}
		];

		// Placeholder assistant turn — replaced with the fleet-trace part
		// once we have the Coral sessionId. Keeps the timeline ordered if
		// the kickoff takes a second.
		const fleetTurnId = `fleet-${Date.now()}`;
		turns = [
			...turns,
			{
				id: fleetTurnId,
				role: 'assistant',
				agentName: 'fleet',
				content: '',
				parts: [],
				status: 'streaming',
				runId: null,
				createdAt: new Date().toISOString()
			}
		];
		stickToBottom = true;
		scrollToBottom();

		try {
			const res = await fetch('/api/fleet/run', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: content, slug: data.chat.slug })
			});
			if (!res.ok) {
				const body = await res.text().catch(() => '');
				throw new Error(`fleet kickoff failed: ${res.status} ${body || res.statusText}`);
			}
			const out = (await res.json()) as {
				namespace?: string;
				sessionId?: string;
				eventsWsUrl?: string;
			};
			if (!out.namespace || !out.sessionId || !out.eventsWsUrl) {
				throw new Error('Server returned an incomplete fleet kickoff payload');
			}

			const fleetPart: FleetTracePart = {
				type: 'fleet-trace',
				namespace: out.namespace,
				sessionId: out.sessionId,
				eventsWsUrl: out.eventsWsUrl,
				query: content,
				startedAt: Date.now(),
				initialAgents: [],
				initialThreads: [],
				mode: 'live'
			};

			turns = turns.map((t) =>
				t.id === fleetTurnId ? { ...t, parts: [fleetPart as TurnPart] } : t
			);
			scrollToBottom();

			// Surface the new run in the top "Fleet runs from this chat"
			// list on next nav — non-fatal if it lags.
			setTimeout(() => invalidateAll(), 1500);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			turns = turns.filter((t) => t.id !== fleetTurnId && t.id !== userTurnId);
		} finally {
			dispatchingFleet = false;
		}
	}

	async function scrollToBottom(opts: { force?: boolean } = {}) {
		if (!opts.force && !stickToBottom) return;
		await tick();
		// `behavior: 'auto'` during streaming — smooth scrolling fires
		// scroll events that race with stickToBottom detection and can
		// flip it false mid-scroll. Instant scroll is also what Claude
		// + Perplexity do for streaming chat output.
		listEl?.scrollTo({ top: listEl.scrollHeight, behavior: 'auto' });
	}

	async function sendTurn(content: string, opts: { alreadyPersisted?: boolean } = {}) {
		if (streaming) return;
		streaming = true;
		errorMsg = null;

		if (!opts.alreadyPersisted) {
			turns = [
				...turns,
				{
					id: `local-${Date.now()}`,
					role: 'user',
					agentName: null,
					content,
					parts: null,
					status: 'complete',
					runId: null,
					createdAt: new Date().toISOString()
				}
			];
		}

		// Placeholder assistant turn. As UIMessage snapshots arrive we
		// replace its `parts` with the latest accumulated state.
		const placeholderId = `streaming-${Date.now()}`;
		turns = [
			...turns,
			{
				id: placeholderId,
				role: 'assistant',
				agentName: 'chat',
				content: '',
				parts: [],
				status: 'streaming',
				runId: null,
				createdAt: new Date().toISOString()
			}
		];
		scrollToBottom();

		try {
			const res = await fetch(`/api/chat/${data.chat.slug}/turn`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					content,
					persistUser: !opts.alreadyPersisted
				})
			});
			if (!res.ok || !res.body) {
				const body = await res.text().catch(() => '');
				throw new Error(`turn failed: ${res.status} ${body || res.statusText}`);
			}

			// readUIMessages yields successive snapshots of the same
			// UIMessage as it accumulates. Each iteration we replace the
			// placeholder turn's `parts` + flatten text into `content`.
			for await (const message of readUIMessages(res.body)) {
				const parts = (message.parts ?? []) as TurnPart[];
				const flatText = parts
					.filter(
						(p): p is { type: 'text'; text: string; state?: 'streaming' | 'done' } =>
							p.type === 'text'
					)
					.map((p) => p.text)
					.join('');
				turns = turns.map((t) =>
					t.id === placeholderId
						? { ...t, parts: [...parts], content: flatText }
						: t
				);
				scrollToBottom();
			}

			turns = turns.map((t) =>
				t.id === placeholderId ? { ...t, status: 'complete' } : t
			);

			// Refresh layout data (recents list + chat title which the
			// server's fire-and-forget title-gen may have just written).
			setTimeout(() => invalidateAll(), 1200);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			turns = turns.filter((t) => t.id !== placeholderId);
		} finally {
			streaming = false;
		}
	}

	/** ChatComposer's onSubmit handler — runs synchronously, clears the
	 * value, then fan-outs to the streaming or fleet-dispatch path. The
	 * composer handles textarea-height reset on its side. */
	function onComposerSubmit() {
		const text = composeValue.trim();
		if (!text || streaming || dispatchingFleet) return;
		composeValue = '';
		// Submitting a new turn re-engages stickiness — the user wants
		// to see their reply land at the bottom even if they were
		// scrolled up reading prior context.
		stickToBottom = true;
		if (fleetMode) {
			dispatchFleet(text);
		} else {
			sendTurn(text);
		}
	}

	onMount(() => {
		scrollToBottom({ force: true });
		if (data.autosend && turns.length === 1 && turns[0]?.role === 'user') {
			sendTurn(turns[0].content, { alreadyPersisted: true });
		}
	});

	/**
	 * Resolve the parts array we should render for a turn. Streaming
	 * turns have parts on them already. Loaded-from-DB turns carry
	 * either a persisted parts array OR plain `content` text (legacy /
	 * user turns); we synthesize a single text part for those so the
	 * rendering path stays uniform.
	 */
	function partsForTurn(turn: ChatTurn): TurnPart[] {
		if (turn.parts && turn.parts.length > 0) return turn.parts;
		return turn.content ? [{ type: 'text', text: turn.content }] : [];
	}

	function isToolPart(p: TurnPart): boolean {
		return typeof p.type === 'string' && p.type.startsWith('tool-');
	}
	function isTextPart(p: TurnPart): boolean {
		return p.type === 'text';
	}

	type ToolPart = Extract<TurnPart, { type: `tool-${string}` }>;

	/** Renderer + output payload for a completed tool part, or null. */
	function artifactFor(p: TurnPart) {
		if (!isToolPart(p)) return null;
		const tp = p as ToolPart;
		if (tp.state !== 'output-available') return null;
		const toolName = tp.type.replace(/^tool-/, '');
		const renderer = getArtifactRenderer(toolName);
		if (!renderer) return null;
		return { renderer, output: tp.output };
	}

	function fleetRunHref(coralSessionId: string): string {
		return `/research/${encodeURIComponent(data.chat.slug)}/${encodeURIComponent(coralSessionId)}`;
	}

	function fleetRunLabel(status: string, startedAt: string): string {
		const d = new Date(startedAt);
		const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
		const prefix =
			status === 'running'
				? 'In progress'
				: status === 'complete'
					? 'Completed'
					: status === 'failed'
						? 'Failed'
						: 'Fleet run';
		return `${prefix} · ${date} ${time}`;
	}

	function fleetStatusColor(status: string): string {
		if (status === 'running') return '#16a34a';
		if (status === 'failed') return '#dc2626';
		return 'var(--color-muted)';
	}
</script>

<main class="mx-auto flex min-h-screen max-w-[820px] flex-col px-8 py-6">
	<header class="mb-4">
		<h1 class="text-ink text-[20px] font-extrabold tracking-[-0.02em]">
			{data.chat.title || 'New chat'}
		</h1>
	</header>

	{#if data.fleetRuns.length > 0}
		<section class="fleet-runs">
			<div class="fleet-runs-label">Fleet runs from this chat</div>
			<ul class="fleet-runs-list">
				{#each data.fleetRuns as run (run.coralSessionId)}
					<li>
						<a class="fleet-run-card" href={fleetRunHref(run.coralSessionId)}>
							<span
								class="fleet-run-dot"
								class:pulsing={run.status === 'running'}
								style:background-color={fleetStatusColor(run.status)}
							></span>
							<span class="fleet-run-text">{fleetRunLabel(run.status, run.startedAt)}</span>
							<svg
								width="12"
								height="12"
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
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<div
		bind:this={listEl}
		onscroll={updateStickFromScroll}
		class="flex-1 space-y-5 overflow-y-auto pb-32"
	>
		{#each turns as turn (turn.id)}
			{#if turn.role === 'user'}
				<div class="flex justify-end">
					<div
						class="bg-surface border-border max-w-[80%] rounded-2xl rounded-tr-md border px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
					>
						{turn.content}
					</div>
				</div>
			{:else}
				{@const parts = partsForTurn(turn)}
				{@const hasFleetTrace = parts.some(
					(p) => (p as { type: string }).type === 'fleet-trace'
				)}
				<div class="flex flex-col gap-2">
					{#if !hasFleetTrace}
						<div class="text-muted flex items-center gap-2 text-xs uppercase tracking-wide">
							<span>{turn.agentName ?? 'assistant'}</span>
							{#if turn.status === 'streaming'}
								<span
									class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#d97757]"
								></span>
							{/if}
						</div>
					{/if}

					{#each parts as part, i (i)}
						{#if isTextPart(part)}
							<Markdown
								text={(part as { text: string }).text}
								variant="chat"
								class="text-ink text-[15px] leading-relaxed"
							/>
						{:else if (part as { type: string }).type === 'fleet-trace'}
							{@const fp = part as unknown as FleetTracePart}
							<FleetTraceInline
								namespace={fp.namespace}
								sessionId={fp.sessionId}
								query={fp.query}
								eventsWsUrl={fp.eventsWsUrl}
								initialAgents={fp.initialAgents}
								initialThreads={fp.initialThreads}
								mode={fp.mode}
								startedAt={fp.startedAt}
							/>
						{:else if isToolPart(part)}
							{@const artifact = artifactFor(part)}
							{@const toolName = (part as ToolPart).type.replace(/^tool-/, '')}
							{@const suppressChip = shouldSuppressChip(toolName)}
							<div class="flex flex-col gap-2">
								{#if !suppressChip}
									<ToolCallChip part={part as never} />
								{/if}
								{#if artifact}
									{@const Renderer = artifact.renderer}
									<Renderer output={artifact.output} />
								{/if}
							</div>
						{/if}
						<!-- step-start, reasoning, and other parts are ignored for now -->
					{/each}

					{#if turn.status === 'streaming' && parts.length === 0}
						<div class="text-muted italic">thinking…</div>
					{/if}
				</div>
			{/if}
		{/each}

		{#if errorMsg}
			<div
				class="rounded-lg border border-red-300/40 bg-red-50/60 px-3 py-2 text-sm text-red-700"
				role="alert"
			>
				{errorMsg}
			</div>
		{/if}
	</div>

	<div class="compose">
		<ChatComposer
			bind:value={composeValue}
			{placeholder}
			disabled={streaming || dispatchingFleet}
			submitting={streaming || dispatchingFleet}
			showFleet={true}
			fleetActive={fleetMode}
			onFleetToggle={() => (fleetMode = !fleetMode)}
			onSubmit={onComposerSubmit}
			variant="embedded"
			label="Chat input"
		/>
	</div>
</main>

<style>
	.compose {
		position: fixed;
		bottom: 24px;
		left: calc(50% + var(--sidebar-w, 60px) / 2);
		transform: translateX(-50%);
		width: min(720px, calc(100% - var(--sidebar-w, 60px) - 32px));
		transition:
			left 180ms ease,
			width 180ms ease;
	}

	.fleet-runs {
		margin-bottom: 16px;
	}
	.fleet-runs-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-muted);
		margin-bottom: 6px;
	}
	.fleet-runs-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.fleet-run-card {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		border-radius: 10px;
		color: var(--color-ink);
		font-size: 13px;
		text-decoration: none;
		transition:
			background-color 120ms ease,
			border-color 120ms ease;
	}
	.fleet-run-card:hover {
		background: color-mix(in srgb, var(--color-ink) 3%, var(--color-surface));
		border-color: color-mix(in srgb, var(--color-ink) 20%, var(--color-border));
	}
	.fleet-run-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.fleet-run-dot.pulsing {
		animation: pulse-soft 1.6s ease-in-out infinite;
	}
	.fleet-run-text {
		flex: 1;
		font-weight: 500;
	}
	@keyframes pulse-soft {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}
</style>
