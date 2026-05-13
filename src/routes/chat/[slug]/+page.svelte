<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import ToolCallChip from '$lib/components/ToolCallChip.svelte';
	import { readUIMessages } from '$lib/client/ui-message-stream';
	import type { PageData } from './$types';
	import type { ChatTurn, TurnPart } from '$lib/server/db/chats';

	type Props = { data: PageData };
	let { data }: Props = $props();

	// Local reactive copy of turns — server-loaded turns + any
	// in-flight turn we're streaming.
	let turns = $state<ChatTurn[]>([...data.chat.turns]);
	let composeValue = $state('');
	let streaming = $state(false);
	let errorMsg = $state<string | null>(null);
	let listEl: HTMLDivElement;

	async function scrollToBottom() {
		await tick();
		listEl?.scrollTo({ top: listEl.scrollHeight, behavior: 'smooth' });
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

	function onCompose(e: SubmitEvent) {
		e.preventDefault();
		const text = composeValue.trim();
		if (!text || streaming) return;
		composeValue = '';
		sendTurn(text);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			const form = (e.target as HTMLElement).closest('form');
			form?.requestSubmit();
		}
	}

	onMount(() => {
		scrollToBottom();
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
</script>

<main class="mx-auto flex min-h-screen max-w-[820px] flex-col px-8 py-6">
	<header class="mb-4">
		<h1 class="text-ink text-[20px] font-extrabold tracking-[-0.02em]">
			{data.chat.title || 'New chat'}
		</h1>
	</header>

	<div bind:this={listEl} class="flex-1 space-y-5 overflow-y-auto pb-32">
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
				<div class="flex flex-col gap-2">
					<div class="text-muted flex items-center gap-2 text-xs uppercase tracking-wide">
						<span>{turn.agentName ?? 'assistant'}</span>
						{#if turn.status === 'streaming'}
							<span
								class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#d97757]"
							></span>
						{/if}
					</div>

					{#each parts as part, i (i)}
						{#if isTextPart(part)}
							<div class="text-ink whitespace-pre-wrap text-[15px] leading-relaxed">
								{(part as { text: string }).text}
							</div>
						{:else if isToolPart(part)}
							<div>
								<ToolCallChip part={part as never} />
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

	<form onsubmit={onCompose} class="compose">
		<div
			class="border-border bg-surface flex items-end gap-2 rounded-2xl border p-2 shadow-sm"
		>
			<textarea
				bind:value={composeValue}
				placeholder={streaming ? 'Thinking…' : 'Ask anything…'}
				disabled={streaming}
				onkeydown={onKeydown}
				rows="1"
				class="text-ink placeholder:text-muted/60 min-h-[36px] flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-snug focus:outline-none"
			></textarea>
			<button
				type="submit"
				disabled={!composeValue.trim() || streaming}
				class="bg-ink text-bg disabled:bg-muted/30 disabled:text-ink/50 flex h-9 w-9 items-center justify-center rounded-xl transition-opacity hover:opacity-90 disabled:cursor-default"
				aria-label="Send"
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M5 12h14" />
					<path d="m13 6 6 6-6 6" />
				</svg>
			</button>
		</div>
	</form>
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
</style>
