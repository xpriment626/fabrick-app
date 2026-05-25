<script lang="ts">
	import ModelUsageSummary from '$lib/components/ModelUsageSummary.svelte';
	import NewRunComposer from '$lib/components/NewRunComposer.svelte';
	import type { PageData } from './$types';

	let { data }: Props = $props();
	type Props = { data: PageData };

	/** Composition id → human label. Falls back to a titleized id so new
	 *  modes render sensibly before they get an explicit label. */
	const COMPOSITION_LABELS: Record<string, string> = {
		research: 'Deep Research'
	};
	function compositionLabel(id: string): string {
		return COMPOSITION_LABELS[id] ?? id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	// Selected composition tab. `override` is the user's click; until they
	// click, fall back to the most-populated composition (kept reactive so it
	// tracks `data` across navigations).
	let override = $state<string | null>(null);
	const selected = $derived(override ?? data.compositions[0]?.id ?? 'research');
	const visibleRuns = $derived(data.runs.filter((r) => r.templateId === selected));

	function fmtDate(ms: number): string {
		try {
			return new Date(ms).toLocaleString(undefined, {
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	}

	function topicLabel(id: string): string {
		return id.replace(/[-_]/g, ' ');
	}

	function excerpt(s: string | null, max = 260): string {
		if (!s) return '';
		const clean = s.replace(/[#*`>_]/g, '').replace(/\s+/g, ' ').trim();
		return clean.length > max ? clean.slice(0, max).trimEnd() + '…' : clean;
	}

	function href(ns: string, sid: string): string {
		return `/research/${encodeURIComponent(ns)}/${encodeURIComponent(sid)}`;
	}
</script>

<svelte:head><title>Fleet · Fabrick</title></svelte:head>

<div class="mx-auto w-full max-w-4xl px-6 py-10">
	<h1 class="text-ink font-display mb-6 text-3xl font-bold tracking-tight">Fleet</h1>

	<!-- New Run — the deliberate fleet-dispatch entry point (§17 Phase C). -->
	<NewRunComposer />

	<!-- Composition tabs (§16): one per fleet template present. Data-driven —
	     new modes appear automatically. -->
	{#if data.compositions.length > 0}
		<div class="border-border mb-5 flex flex-wrap items-center gap-2" role="tablist">
			{#each data.compositions as comp (comp.id)}
				<button
					type="button"
					role="tab"
					aria-selected={selected === comp.id}
					onclick={() => (override = comp.id)}
					class="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors {selected ===
					comp.id
						? 'border-ink bg-ink text-surface'
						: 'border-border text-muted hover:text-ink hover:border-ink/40'}"
				>
					{compositionLabel(comp.id)}
					<span class="ml-1.5 text-xs opacity-60">{comp.count}</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- Search / filter space — placeholder per the sketch; wired later. -->
	<div
		class="border-border bg-surface text-muted mb-8 rounded-full border px-5 py-3 text-sm"
		role="search"
	>
		Search &amp; filters — coming soon
	</div>

	{#if data.runs.length === 0}
		<div class="border-border text-muted rounded-card border border-dashed px-6 py-16 text-center">
			No archived fleet runs yet. Dispatch a fleet from a chat and it'll land here when it completes.
		</div>
	{:else if visibleRuns.length === 0}
		<div class="border-border text-muted rounded-card border border-dashed px-6 py-16 text-center">
			No {compositionLabel(selected)} runs yet.
		</div>
	{:else}
		<div class="flex flex-col gap-4">
			{#each visibleRuns as run (run.id)}
				<a
					href={href(run.namespace, run.sessionId)}
					class="rounded-card border-border bg-surface block border p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_2px_8px_rgb(0_0_0/0.06)]"
				>
					<div class="mb-1 flex items-baseline justify-between gap-4">
						<h2 class="text-ink line-clamp-2 text-lg font-semibold tracking-tight">
							{run.query}
						</h2>
						<span class="text-muted shrink-0 text-xs">{fmtDate(run.completedAt)}</span>
					</div>

					{#if run.synthesisText}
						<p class="text-muted mt-2 line-clamp-3 text-sm leading-relaxed">
							{excerpt(run.synthesisText)}
						</p>
					{/if}

					<div
						class="border-border/60 text-muted mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs"
					>
						{#if run.topicId}
							<span class="bg-subtle text-ink rounded-full px-2.5 py-0.5 font-medium">
								{topicLabel(run.topicId)}
							</span>
							<span class="text-border">·</span>
						{/if}
						<span>{run.messageCount} messages</span>
						{#if run.modelUsage}
							<span class="text-border">·</span>
							<ModelUsageSummary usage={run.modelUsage} variant="compact" />
						{/if}
						{#if run.followupCount > 0}
							<span class="text-border">·</span>
							<span class="text-positive inline-flex items-center gap-1 font-medium">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
								</svg>
								{run.followupCount} follow-up{run.followupCount === 1 ? '' : 's'}
							</span>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
