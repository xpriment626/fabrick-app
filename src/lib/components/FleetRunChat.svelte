<!--
	Run-anchored follow-up chat (design.md §17). Mirrors the /discover/[slug]
	chat half, anchored to a completed fleet run instead of a story. First
	turn creates-or-reuses the (fleet_run, sessionId) chat via
	POST /api/fleet/[sessionId]/chat; follow-ups stream from
	/api/chat/[slug]/turn (whose system prompt seeds the run synthesis).

	Rendered only on completed runs — a live run has no synthesis to discuss.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Markdown from '$lib/components/Markdown.svelte';
	import ToolCallChip from '$lib/components/ToolCallChip.svelte';
	import ChatComposer from '$lib/components/ChatComposer.svelte';
	import { getArtifactRenderer, shouldSuppressChip } from '$lib/components/artifacts/registry';
	import { readUIMessages } from '$lib/client/ui-message-stream';
	import type { ChatTurn, TurnPart } from '$lib/server/db/chats';

	type Props = {
		sessionId: string;
		initialChat: { slug: string; turns: ChatTurn[] } | null;
		signedIn?: boolean;
	};
	let { sessionId, initialChat, signedIn = true }: Props = $props();

	// svelte-ignore state_referenced_locally
	let turns = $state<ChatTurn[]>(initialChat?.turns ? [...initialChat.turns] : []);
	// svelte-ignore state_referenced_locally
	let chatSlug = $state<string | null>(initialChat?.slug ?? null);
	let composeValue = $state('');
	let streaming = $state(false);
	let errorMsg = $state<string | null>(null);

	// Reset when the run (sessionId) changes — the run page swaps via a
	// {#key} block, but guard anyway.
	// svelte-ignore state_referenced_locally
	let currentSession = $state(sessionId);
	$effect.pre(() => {
		if (sessionId === currentSession) return;
		currentSession = sessionId;
		turns = initialChat?.turns ? [...initialChat.turns] : [];
		chatSlug = initialChat?.slug ?? null;
		composeValue = '';
		streaming = false;
		errorMsg = null;
	});

	const placeholder = $derived(
		streaming ? 'Thinking…' : 'Ask a follow-up about this run…'
	);

	async function scrollToBottom() {
		await tick();
		if (typeof window === 'undefined') return;
		window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
	}

	/** First turn hits /api/fleet/[sessionId]/chat to create-or-find the
	 *  anchored chat AND persist the user message; later turns skip straight
	 *  to /api/chat/[slug]/turn. */
	async function ensureChatSlug(
		content: string
	): Promise<{ chatSlug: string; userPrePersisted: boolean }> {
		if (chatSlug) return { chatSlug, userPrePersisted: false };
		const res = await fetch(`/api/fleet/${encodeURIComponent(sessionId)}/chat`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ content })
		});
		if (!res.ok) {
			const body = await res.text().catch(() => '');
			throw new Error(`failed to create run chat: ${res.status} ${body}`);
		}
		const out = (await res.json()) as { chatSlug: string };
		chatSlug = out.chatSlug;
		return { chatSlug: out.chatSlug, userPrePersisted: true };
	}

	async function sendTurn(content: string) {
		if (streaming) return;
		streaming = true;
		errorMsg = null;

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
			const { chatSlug: slug, userPrePersisted } = await ensureChatSlug(content);
			const res = await fetch(`/api/chat/${slug}/turn`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content, persistUser: !userPrePersisted })
			});
			if (!res.ok || !res.body) {
				const body = await res.text().catch(() => '');
				throw new Error(`turn failed: ${res.status} ${body || res.statusText}`);
			}

			for await (const message of readUIMessages(res.body)) {
				const parts = (message.parts ?? []) as TurnPart[];
				const flatText = parts
					.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
					.map((p) => p.text)
					.join('');
				turns = turns.map((t) =>
					t.id === placeholderId ? { ...t, parts: [...parts], content: flatText } : t
				);
				scrollToBottom();
			}

			turns = turns.map((t) => (t.id === placeholderId ? { ...t, status: 'complete' } : t));
			// Surface the new run-chat in the sidebar's Fleet history.
			setTimeout(() => invalidateAll(), 1200);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			turns = turns.filter((t) => t.id !== placeholderId);
		} finally {
			streaming = false;
		}
	}

	function onComposerSubmit() {
		const text = composeValue.trim();
		if (!text || streaming) return;
		composeValue = '';
		sendTurn(text);
	}

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
	function artifactFor(p: TurnPart) {
		if (!isToolPart(p)) return null;
		const tp = p as ToolPart;
		if (tp.state !== 'output-available') return null;
		const toolName = tp.type.replace(/^tool-/, '');
		const renderer = getArtifactRenderer(toolName);
		if (!renderer) return null;
		return { renderer, output: tp.output };
	}
</script>

<section class="run-chat">
	<div class="text-muted mb-3 text-xs uppercase tracking-wide">Follow-ups</div>

	{#if turns.length > 0}
		<div class="space-y-5">
			{#each turns as turn (turn.id)}
				{#if turn.role === 'user'}
					<div class="flex justify-end">
						<div
							class="bg-surface border-border max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tr-md border px-4 py-2.5 text-sm leading-relaxed"
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
								<span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#d97757]"></span>
							{/if}
						</div>
						{#each parts as part, i (i)}
							{#if isTextPart(part)}
								<Markdown
									text={(part as { text: string }).text}
									variant="chat"
									class="text-ink text-[15px] leading-relaxed"
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
						{/each}
						{#if turn.status === 'streaming' && parts.length === 0}
							<div class="text-muted italic">thinking…</div>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{:else}
		<p class="text-muted text-sm">
			Ask a follow-up to dig into this run's findings — the chat has the full synthesis loaded.
		</p>
	{/if}

	{#if errorMsg}
		<div class="mt-4 rounded-lg border border-red-300/40 bg-red-50/60 px-3 py-2 text-sm text-red-700" role="alert">
			{errorMsg}
		</div>
	{/if}
</section>

<div class="compose">
	<ChatComposer
		bind:value={composeValue}
		{placeholder}
		disabled={!signedIn || streaming}
		submitting={streaming}
		showFleet={false}
		onSubmit={onComposerSubmit}
		variant="embedded"
		label="Fleet run follow-up input"
	/>
</div>

<style>
	.run-chat {
		max-width: 760px;
		margin: 0 auto;
		padding: 0 32px 160px;
	}
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
