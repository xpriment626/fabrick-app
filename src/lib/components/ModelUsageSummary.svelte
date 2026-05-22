<!--
	Cost telemetry readout. Renders the `model_usage` blob captured by the
	fleet-gateway from coral `llm_proxy_call` events.

	  compact → one-line summary (token totals + calls + agent count)
	  full    → per-agent breakdown table

	USD is intentionally absent — rate tables are volatile (provider promos
	etc.); we surface raw tokens and let pricing live elsewhere if/when wanted.
-->
<script lang="ts">
	type AgentUsage = {
		model?: string;
		input_tokens?: number;
		output_tokens?: number;
		calls?: number;
	};
	type ModelUsage = {
		agents?: Record<string, AgentUsage>;
		totals?: { input_tokens?: number; output_tokens?: number; calls?: number };
		estimated_usd?: number | null;
	} | null;

	type Props = { usage: unknown; variant?: 'compact' | 'full' };
	let { usage, variant = 'compact' }: Props = $props();

	const u = $derived(usage as ModelUsage);
	const totals = $derived(u?.totals ?? null);
	const agentEntries = $derived(u?.agents ? Object.entries(u.agents) : []);
	const n = (v: number | undefined) => (v ?? 0).toLocaleString();
</script>

{#if u && totals}
	{#if variant === 'compact'}
		<span class="text-muted inline-flex items-center gap-2 text-xs">
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
			</svg>
			<span>{n(totals.input_tokens)} in · {n(totals.output_tokens)} out</span>
			<span class="text-border">·</span>
			<span>{n(totals.calls)} calls</span>
			<span class="text-border">·</span>
			<span>{agentEntries.length} agents</span>
		</span>
	{:else}
		<div class="rounded-card border-border bg-bg/40 border p-4">
			<div class="text-muted mb-3 text-[11px] font-semibold tracking-wide uppercase">
				Token usage
			</div>
			<table class="w-full text-sm">
				<thead>
					<tr class="text-muted text-left text-[11px] tracking-wide uppercase">
						<th class="pb-2 font-semibold">Agent</th>
						<th class="pb-2 font-semibold">Model</th>
						<th class="pb-2 text-right font-semibold">In</th>
						<th class="pb-2 text-right font-semibold">Out</th>
						<th class="pb-2 text-right font-semibold">Calls</th>
					</tr>
				</thead>
				<tbody>
					{#each agentEntries as [name, a] (name)}
						<tr class="border-border/60 border-t">
							<td class="text-ink py-2 font-medium">{name}</td>
							<td class="text-muted py-2 font-mono text-xs">{a.model ?? '—'}</td>
							<td class="text-ink py-2 text-right tabular-nums">{n(a.input_tokens)}</td>
							<td class="text-ink py-2 text-right tabular-nums">{n(a.output_tokens)}</td>
							<td class="text-ink py-2 text-right tabular-nums">{n(a.calls)}</td>
						</tr>
					{/each}
					<tr class="border-border border-t-2">
						<td class="text-ink py-2 font-semibold">Total</td>
						<td></td>
						<td class="text-ink py-2 text-right font-semibold tabular-nums">{n(totals.input_tokens)}</td>
						<td class="text-ink py-2 text-right font-semibold tabular-nums">{n(totals.output_tokens)}</td>
						<td class="text-ink py-2 text-right font-semibold tabular-nums">{n(totals.calls)}</td>
					</tr>
				</tbody>
			</table>
		</div>
	{/if}
{:else if variant === 'full'}
	<div class="text-muted text-xs italic">No cost telemetry recorded for this run.</div>
{/if}
