<!--
	Dream inspector (design.md §17 B.5 / §16 surface A + Stage 1). The "What
	this run taught Fabrick" panel: the raw atoms the dream pass extracted from
	THIS run, salience-ranked, dismissable. Nested + collapsed by default — an
	inspector you open, not chrome on the run. Raw on purpose (shows the
	system's literal inferences) so the user can see + correct them.

	Stage 1 adds manual dreaming: a "Dream now" (never dreamed) / "Re-dream"
	(re-extract) button that fires POST /api/fleet/[sessionId]/dream and
	repaints the atom list in place. A re-dream supersedes the prior atoms
	server-side, so the returned set is authoritative — we replace, not merge.
-->
<script lang="ts">
	type Atom = {
		id: string;
		content: string;
		salience: number | null;
		topicId: string | null;
	};

	type Props = {
		atoms: Atom[];
		/** Coral session id — the dream endpoint key. */
		sessionId: string;
		/** Epoch ms of the most recent dream over this run, or null if never. */
		lastDreamedAt?: number | null;
	};
	let { atoms: initialAtoms, sessionId, lastDreamedAt = null }: Props = $props();

	// Local, mutable copy so a re-dream repaints without a page reload. The run
	// page remounts this via {#key sessionId}, so seeding once from props is the
	// intended behaviour (no reactive re-sync needed).
	// svelte-ignore state_referenced_locally
	let atoms = $state<Atom[]>(initialAtoms);
	// svelte-ignore state_referenced_locally
	let lastDreamed = $state<number | null>(lastDreamedAt);
	let expanded = $state(false);
	let running = $state(false);
	let errorMsg = $state<string | null>(null);

	// Local dismissed set so the UI updates optimistically without a reload.
	let dismissed = $state<Set<string>>(new Set());
	const visible = $derived(atoms.filter((a) => !dismissed.has(a.id)));

	const hasDreamed = $derived(lastDreamed != null || atoms.length > 0);
	const dreamLabel = $derived(running ? 'Dreaming…' : hasDreamed ? 'Re-dream' : 'Dream now');

	async function dream() {
		if (running) return;
		running = true;
		errorMsg = null;
		try {
			const res = await fetch(`/api/fleet/${sessionId}/dream`, { method: 'POST' });
			if (!res.ok) throw new Error(`${res.status}`);
			const data = (await res.json()) as { atoms?: Atom[] };
			// Server superseded the prior set — the response is authoritative.
			atoms = data.atoms ?? [];
			dismissed = new Set();
			lastDreamed = Date.now();
			expanded = true;
		} catch (err) {
			console.error('[DreamInspector] dream failed', err);
			errorMsg = 'Dream failed — try again.';
		} finally {
			running = false;
		}
	}

	async function dismiss(id: string) {
		// Optimistic — drop it immediately; restore on failure.
		dismissed = new Set([...dismissed, id]);
		try {
			const res = await fetch('/api/memory/dismiss', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error(`${res.status}`);
		} catch (err) {
			console.error('[DreamInspector] dismiss failed', err);
			const next = new Set(dismissed);
			next.delete(id);
			dismissed = next;
		}
	}

	function salienceLabel(s: number | null): string {
		if (s == null) return '';
		return `${Math.round(s * 100)}%`;
	}

	function relativeTime(ms: number | null): string {
		if (ms == null) return '';
		const diff = Date.now() - ms;
		if (diff < 60_000) return 'just now';
		const mins = Math.floor(diff / 60_000);
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		const days = Math.floor(hrs / 24);
		return `${days}d ago`;
	}
</script>

<section class="inspector">
	<div class="head">
		<button
			type="button"
			class="head-toggle"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
		>
			<svg
				class="spark"
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
				<path d="M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M3 12h3m12 0h3M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1" />
			</svg>
			<span class="title">What this run taught Fabrick</span>
			<span class="count">{visible.length}</span>
			<svg
				class="chev"
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

		<button
			type="button"
			class="dream-btn"
			onclick={dream}
			disabled={running}
			title={hasDreamed ? 'Re-extract memory from this run' : 'Extract memory from this run'}
		>
			{#if running}
				<span class="spinner" aria-hidden="true"></span>
			{/if}
			{dreamLabel}
		</button>
	</div>

	{#if expanded}
		<div class="body">
			<p class="hint">
				Memory the dream pass extracted from this run — carried into future runs and chats.
				Dismiss anything that's off.
				{#if lastDreamed != null}
					<span class="dot">·</span> Last dreamed {relativeTime(lastDreamed)}
				{/if}
			</p>
			{#if errorMsg}
				<p class="error">{errorMsg}</p>
			{/if}
			{#if visible.length === 0}
				<p class="empty">
					{hasDreamed
						? 'Nothing worth remembering from this run.'
						: 'Not dreamed yet — run a dream pass to extract memory.'}
				</p>
			{:else}
				<ul class="atoms">
					{#each visible as atom (atom.id)}
						<li class="atom">
							<span class="sal" title="salience">{salienceLabel(atom.salience)}</span>
							<span class="content">{atom.content}</span>
							<button
								type="button"
								class="dismiss"
								title="Dismiss this memory"
								aria-label="Dismiss this memory"
								onclick={() => dismiss(atom.id)}
							>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M18 6 6 18M6 6l12 12" />
								</svg>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>

<style>
	.inspector {
		max-width: 760px;
		margin: 24px auto 0;
		border: 1px solid var(--color-border);
		border-radius: 12px;
		background: var(--color-surface);
		overflow: hidden;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px 8px 0;
	}
	.head-toggle {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
		padding: 12px 8px 12px 16px;
		box-sizing: border-box;
	}
	.head-toggle:hover {
		background: color-mix(in srgb, var(--color-ink) 3%, transparent);
	}
	.spark {
		color: var(--color-positive);
		flex-shrink: 0;
	}
	.title {
		font-size: 14px;
		font-weight: 600;
		color: var(--color-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.count {
		font-size: 11px;
		font-weight: 600;
		color: var(--color-muted);
		background: var(--color-subtle, #f2efea);
		border-radius: 9999px;
		padding: 1px 8px;
		flex-shrink: 0;
	}
	.chev {
		margin-left: auto;
		color: var(--color-muted);
		transition: transform 160ms ease;
		flex-shrink: 0;
	}
	.chev.open {
		transform: rotate(180deg);
	}
	.dream-btn {
		all: unset;
		cursor: pointer;
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--color-ink);
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		padding: 5px 13px;
		transition:
			background-color 120ms ease,
			border-color 120ms ease,
			opacity 120ms ease;
	}
	.dream-btn:hover {
		background: color-mix(in srgb, var(--color-ink) 4%, transparent);
		border-color: color-mix(in srgb, var(--color-ink) 25%, var(--color-border));
	}
	.dream-btn:disabled {
		cursor: default;
		opacity: 0.6;
	}
	.spinner {
		width: 11px;
		height: 11px;
		border: 2px solid color-mix(in srgb, var(--color-ink) 25%, transparent);
		border-top-color: var(--color-ink);
		border-radius: 50%;
		animation: spin 700ms linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.body {
		padding: 0 16px 14px;
		border-top: 1px solid var(--color-border);
	}
	.hint {
		font-size: 12.5px;
		color: var(--color-muted);
		margin: 12px 0;
		line-height: 1.5;
	}
	.dot {
		margin: 0 2px;
	}
	.error {
		font-size: 13px;
		color: #b3261e;
		margin: 0 0 12px;
	}
	.empty {
		font-size: 13px;
		color: var(--color-muted);
		font-style: italic;
	}
	.atoms {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.atom {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 8px 10px;
		border-radius: 8px;
		background: color-mix(in srgb, var(--color-ink) 2.5%, transparent);
	}
	.sal {
		flex-shrink: 0;
		font-size: 11px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--color-positive);
		min-width: 30px;
	}
	.content {
		flex: 1;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--color-ink);
	}
	.dismiss {
		all: unset;
		cursor: pointer;
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		color: var(--color-muted);
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}
	.dismiss:hover {
		background: color-mix(in srgb, var(--color-ink) 8%, transparent);
		color: var(--color-ink);
	}
</style>
