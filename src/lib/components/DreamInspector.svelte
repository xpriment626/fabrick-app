<!--
	Dream inspector (design.md §17 B.5 / §16 surface A). The "What this run
	taught Fabrick" panel: the raw atoms the dream pass extracted from THIS
	run, salience-ranked, dismissable. Nested + collapsed by default — it's
	an inspector you open, not chrome on the run. Raw on purpose (shows the
	system's literal inferences) so the user can see + correct them.
-->
<script lang="ts">
	type Atom = {
		id: string;
		content: string;
		salience: number | null;
		topicId: string | null;
	};

	type Props = { atoms: Atom[] };
	let { atoms }: Props = $props();

	let expanded = $state(false);
	// Local dismissed set so the UI updates optimistically without a reload.
	let dismissed = $state<Set<string>>(new Set());
	const visible = $derived(atoms.filter((a) => !dismissed.has(a.id)));

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
</script>

{#if atoms.length > 0}
	<section class="inspector">
		<button
			type="button"
			class="head"
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

		{#if expanded}
			<div class="body">
				<p class="hint">
					Memory the dream pass extracted from this run — carried into future runs and chats.
					Dismiss anything that's off.
				</p>
				{#if visible.length === 0}
					<p class="empty">All dismissed.</p>
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
{/if}

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
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 12px 16px;
		box-sizing: border-box;
	}
	.head:hover {
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
	}
	.count {
		font-size: 11px;
		font-weight: 600;
		color: var(--color-muted);
		background: var(--color-subtle, #f2efea);
		border-radius: 9999px;
		padding: 1px 8px;
	}
	.chev {
		margin-left: auto;
		color: var(--color-muted);
		transition: transform 160ms ease;
	}
	.chev.open {
		transform: rotate(180deg);
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
