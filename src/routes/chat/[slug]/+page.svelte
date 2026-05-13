<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { ChatTurn } from '$lib/server/db/chats';

	type Props = { data: PageData };
	let { data }: Props = $props();

	// Local reactive copy of turns — we append the in-flight assistant
	// reply here as tokens stream in.
	let turns = $state<ChatTurn[]>([...data.chat.turns]);
	let composeValue = $state('');
	let streaming = $state(false);
	let errorMsg = $state<string | null>(null);
	let listEl: HTMLDivElement;

	async function scrollToBottom() {
		await tick();
		listEl?.scrollTo({ top: listEl.scrollHeight, behavior: 'smooth' });
	}

	/**
	 * Send a user message. If `alreadyPersisted` is true, the message is
	 * not re-inserted (used for the autosend path where AmbientChatBar's
	 * POST /api/chat already seeded the first turn).
	 */
	async function sendTurn(content: string, opts: { alreadyPersisted?: boolean } = {}) {
		if (streaming) return;
		streaming = true;
		errorMsg = null;

		// Push user turn locally (skip if it's already in our SSR snapshot).
		if (!opts.alreadyPersisted) {
			turns = [
				...turns,
				{
					id: `local-${Date.now()}`,
					role: 'user',
					agentName: null,
					content,
					status: 'complete',
					runId: null,
					createdAt: new Date().toISOString()
				}
			];
		}

		// Add a placeholder assistant turn we'll append tokens into.
		const placeholderId = `streaming-${Date.now()}`;
		turns = [
			...turns,
			{
				id: placeholderId,
				role: 'assistant',
				agentName: 'chat',
				content: '',
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

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				const chunk = decoder.decode(value, { stream: true });
				turns = turns.map((t) =>
					t.id === placeholderId ? { ...t, content: t.content + chunk } : t
				);
				scrollToBottom();
			}
			// Mark the placeholder turn complete locally. The server has
			// persisted the real row by now; on next navigation/reload we'll
			// load the real id from DB.
			turns = turns.map((t) =>
				t.id === placeholderId ? { ...t, status: 'complete' } : t
			);

			// Refresh side panel + title from the DB (title gen runs
			// fire-and-forget on the server; small delay before invalidate
			// gives it time to land for a fresh chat).
			setTimeout(() => invalidateAll(), 1200);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			// Drop the placeholder on failure.
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
		// Autosend: AmbientChatBar created the chat with a seeded user
		// message and navigated here. Trigger the first model call.
		if (data.autosend && turns.length === 1 && turns[0]?.role === 'user') {
			sendTurn(turns[0].content, { alreadyPersisted: true });
		}
	});
</script>

<main class="mx-auto flex min-h-screen max-w-[820px] flex-col px-8 py-6">
	<header class="mb-4">
		<h1 class="text-ink text-[20px] font-extrabold tracking-[-0.02em]">
			{data.chat.title || 'New chat'}
		</h1>
	</header>

	<div
		bind:this={listEl}
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
					<div class="flex flex-col gap-1">
						<div class="text-muted text-xs uppercase tracking-wide">
							{turn.agentName ?? 'assistant'}
							{#if turn.status === 'streaming'}
								<span class="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#d97757]"
								></span>
							{/if}
						</div>
						<div
							class="text-ink whitespace-pre-wrap text-[15px] leading-relaxed"
						>
							{turn.content}
							{#if turn.status === 'streaming' && turn.content === ''}
								<span class="text-muted italic">thinking…</span>
							{/if}
						</div>
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
	/* Compose pinned to bottom of viewport, centered within the main
	   content area (i.e. respecting the sidebar width set by Sidebar). */
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
