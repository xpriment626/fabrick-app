<!--
	Dev-only first-roll surface for live Coral session events.

	Idle mode: textarea + submit button → POSTs /api/dev/run, navigates back
	to this same route with `?ns=...&sid=...&ws=...&q=...` query params.

	Active mode: opens the WebSocket whose URL came back from the API, dumps
	every event as a row in a chronological reel. Rough on purpose — once we
	see what events actually come through we'll iterate this into the
	Grok-style trace reel from the spec.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	type AnyEvent = { type?: string; [k: string]: unknown };

	let query = $state('');
	let submitting = $state(false);
	let submitError = $state<string | null>(null);

	const ns = $derived(page.url.searchParams.get('ns'));
	const sid = $derived(page.url.searchParams.get('sid'));
	const wsUrl = $derived(page.url.searchParams.get('ws'));
	const initialQuery = $derived(page.url.searchParams.get('q'));
	const isActive = $derived(!!(ns && sid && wsUrl));

	let events = $state<AnyEvent[]>([]);
	let wsState = $state<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle');
	let sessionStartedAt = $state<number | null>(null);
	let now = $state<number>(Date.now());

	const elapsedS = $derived(
		sessionStartedAt ? Math.max(0, Math.round((now - sessionStartedAt) / 1000)) : 0
	);

	$effect(() => {
		if (!wsUrl) return;
		wsState = 'connecting';
		sessionStartedAt = Date.now();
		const ws = new WebSocket(wsUrl);
		ws.onopen = () => {
			wsState = 'open';
		};
		ws.onmessage = (msg) => {
			try {
				const ev = JSON.parse(msg.data as string) as AnyEvent;
				events = [...events, ev];
			} catch {
				events = [...events, { type: 'parse_error', raw: msg.data }];
			}
		};
		ws.onerror = () => {
			wsState = 'error';
		};
		ws.onclose = () => {
			wsState = 'closed';
		};
		const timer = setInterval(() => (now = Date.now()), 250);
		return () => {
			clearInterval(timer);
			ws.close();
		};
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!query.trim()) return;
		submitting = true;
		submitError = null;
		try {
			const res = await fetch('/api/dev/run', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: query.trim() })
			});
			if (!res.ok) {
				submitError = `${res.status}: ${await res.text()}`;
				return;
			}
			const data = (await res.json()) as {
				namespace: string;
				sessionId: string;
				eventsWsUrl: string;
			};
			const params = new URLSearchParams({
				ns: data.namespace,
				sid: data.sessionId,
				ws: data.eventsWsUrl,
				q: query.trim()
			});
			await goto(`/dev/session?${params.toString()}`);
		} catch (err) {
			submitError = err instanceof Error ? err.message : String(err);
		} finally {
			submitting = false;
		}
	}

	function summarize(ev: AnyEvent): string {
		const t = ev.type ?? 'unknown';
		const d = (ev.data ?? ev) as Record<string, unknown>;
		if (t === 'thread_message_sent') {
			const m = (d.message ?? d) as Record<string, unknown>;
			const sender = String(m.senderName ?? '?');
			const text = String(m.text ?? '').slice(0, 120);
			return `${sender}: ${text}${(m.text as string)?.length > 120 ? '…' : ''}`;
		}
		if (typeof t === 'string' && t.startsWith('agent_')) {
			const name = String(d.name ?? d.agentName ?? '?');
			return `${name} — ${t.replace('agent_', '')}`;
		}
		return t;
	}
</script>

<svelte:head>
	<title>{isActive ? `Run · ${initialQuery ?? ''}` : 'Start a research run'} — Fabrick dev</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
	<header class="flex items-baseline justify-between">
		<div>
			<p class="eyebrow text-muted">Fabrick · dev surface</p>
			<h1 class="text-ink mt-1 text-3xl font-semibold tracking-[var(--tracking-display)]">
				Research run
			</h1>
		</div>
		{#if isActive}
			<a
				href="/dev/session"
				class="text-muted hover:text-ink text-sm underline decoration-dotted underline-offset-4"
			>
				New run
			</a>
		{/if}
	</header>

	{#if !isActive}
		<form onsubmit={submit} class="flex flex-col gap-3">
			<textarea
				bind:value={query}
				rows="3"
				placeholder="What should the orchestrator research?"
				class="bg-surface border-border text-ink placeholder:text-muted/70 resize-none rounded-[var(--radius-card)] border p-4 text-base shadow-[var(--shadow-card)] outline-none focus:border-[var(--color-ink)]/40"
				disabled={submitting}
			></textarea>
			<div class="flex items-center justify-between">
				<p class="text-muted text-xs">
					Posts to /api/dev/run, spawns the orchestrator agent, subscribes to live
					events.
				</p>
				<button
					type="submit"
					class="bg-ink text-bg disabled:bg-muted rounded-[var(--radius-pill)] px-5 py-2 text-sm font-medium disabled:cursor-not-allowed"
					disabled={submitting || query.trim().length === 0}
				>
					{submitting ? 'Spawning…' : 'Start run'}
				</button>
			</div>
			{#if submitError}
				<p class="text-[var(--color-negative)] text-sm">{submitError}</p>
			{/if}
		</form>
	{:else}
		<section class="flex flex-col gap-2">
			<div class="bg-surface border-border rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)]">
				<p class="eyebrow text-muted">User query</p>
				<p class="text-ink mt-1 text-base">{initialQuery}</p>
			</div>

			<div class="text-muted flex items-center gap-3 text-xs">
				<span
					class="inline-flex h-2 w-2 rounded-full"
					class:bg-positive={wsState === 'open'}
					class:bg-warning={wsState === 'connecting'}
					class:bg-muted={wsState === 'idle' || wsState === 'closed'}
					class:bg-negative={wsState === 'error'}
				></span>
				<span>WS: {wsState}</span>
				<span>·</span>
				<span>{events.length} events</span>
				<span>·</span>
				<span>{elapsedS}s elapsed</span>
			</div>
		</section>

		<section class="flex flex-col gap-3">
			{#if events.length === 0}
				<div class="border-border text-muted rounded-[var(--radius-card)] border border-dashed p-6 text-center text-sm">
					Agents thinking — waiting for first event…
				</div>
			{:else}
				{#each events as ev, i (i)}
					<details class="bg-surface border-border group rounded-[var(--radius-tile)] border p-3">
						<summary class="cursor-pointer list-none">
							<div class="flex items-baseline justify-between gap-3">
								<span class="text-ink text-sm font-medium">{ev.type ?? '?'}</span>
								<span class="text-muted text-xs">#{i + 1}</span>
							</div>
							<p class="text-ink/70 mt-1 text-sm">{summarize(ev)}</p>
						</summary>
						<pre class="bg-bg text-ink/80 mt-3 overflow-x-auto rounded-md p-3 text-xs leading-relaxed">{JSON.stringify(ev, null, 2)}</pre>
					</details>
				{/each}
			{/if}
		</section>
	{/if}
</main>
