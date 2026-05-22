<script lang="ts">
	import ModelUsageSummary from '$lib/components/ModelUsageSummary.svelte';
	import type { PageData } from './$types';

	let { data }: Props = $props();
	type Props = { data: PageData };

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

	function excerpt(s: string | null, max = 260): string {
		if (!s) return '';
		const clean = s.replace(/[#*`>_]/g, '').replace(/\s+/g, ' ').trim();
		return clean.length > max ? clean.slice(0, max).trimEnd() + '…' : clean;
	}

	function href(ns: string, sid: string): string {
		return `/research/${encodeURIComponent(ns)}/${encodeURIComponent(sid)}`;
	}
</script>

<svelte:head><title>Fleet Archives · Fabrick</title></svelte:head>

<div class="mx-auto w-full max-w-4xl px-6 py-10">
	<h1 class="text-ink font-display mb-6 text-3xl font-bold tracking-tight">Fleet Archives</h1>

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
	{:else}
		<div class="flex flex-col gap-4">
			{#each data.runs as run (run.id)}
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
						<span>{run.messageCount} messages</span>
						{#if run.modelUsage}
							<span class="text-border">·</span>
							<ModelUsageSummary usage={run.modelUsage} variant="compact" />
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
