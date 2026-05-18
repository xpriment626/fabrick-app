<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Markdown from '$lib/components/Markdown.svelte';
	import ToolCallChip from '$lib/components/ToolCallChip.svelte';
	import ChatComposer from '$lib/components/ChatComposer.svelte';
	import { getArtifactRenderer, shouldSuppressChip } from '$lib/components/artifacts/registry';
	import { readUIMessages } from '$lib/client/ui-message-stream';
	import type { PageData } from './$types';
	import type { ChatTurn, TurnPart } from '$lib/server/db/chats';
	import ResearchCard from '$lib/components/ResearchCard.svelte';

	type Props = { data: PageData };
	let { data }: Props = $props();

	const story = $derived(data.story);
	const fetchedDate = $derived.by(() => {
		const d = new Date(story.fetchedAt);
		return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
	});
	const sourceLabel = $derived(story.story.sources?.[0] ?? 'CoinDesk');
	const hasImage = $derived(!!story.story.imageUrl);
	let imageBroken = $state(false);

	// Chat state — turns start with any persisted ones from the loader,
	// and grow as the user sends follow-ups. These intentionally capture
	// the initial `data` values; the $effect.pre below re-syncs them
	// when the user navigates to a different story slug.
	// svelte-ignore state_referenced_locally
	let turns = $state<ChatTurn[]>(data.chat?.turns ? [...data.chat.turns] : []);
	// svelte-ignore state_referenced_locally
	let chatSlug = $state<string | null>(data.chat?.slug ?? null);
	let composeValue = $state('');
	let streaming = $state(false);
	let errorMsg = $state<string | null>(null);

	// Sticky scroll — disengage when the user scrolls up to read the
	// article or earlier replies, re-engage when they come back to the
	// bottom (or when they submit a new turn).
	let stickToBottom = $state(true);
	const STICK_THRESHOLD_PX = 120;

	// SvelteKit reuses this component instance across /discover/A →
	// /discover/B navigation. Reset local state when the story slug
	// changes so prior-story chat turns + composer value don't leak
	// into the new story's view. Mirrors the chat page's slug-reset.
	// svelte-ignore state_referenced_locally
	let currentStorySlug = $state(data.story.slug);
	$effect.pre(() => {
		if (data.story.slug === currentStorySlug) return;
		currentStorySlug = data.story.slug;
		turns = data.chat?.turns ? [...data.chat.turns] : [];
		chatSlug = data.chat?.slug ?? null;
		composeValue = '';
		streaming = false;
		errorMsg = null;
		stickToBottom = true;
		imageBroken = false;
	});

	function updateStickFromScroll() {
		if (typeof window === 'undefined') return;
		const distanceFromBottom =
			document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
		stickToBottom = distanceFromBottom < STICK_THRESHOLD_PX;
	}

	const placeholder = $derived(
		!data.signedIn
			? 'Sign in to ask follow-ups about this story…'
			: streaming
				? 'Thinking…'
				: 'Ask a follow-up about this story…'
	);

	async function scrollChatToBottom(opts: { force?: boolean } = {}) {
		if (!opts.force && !stickToBottom) return;
		await tick();
		if (typeof window === 'undefined') return;
		window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
	}

	/**
	 * Resolve the chat slug for this turn. First turn (no chat yet) hits
	 * /api/discover/[slug]/chat to create-or-find the anchored session
	 * AND persist the user message in one round trip. Subsequent turns
	 * skip that hop and go straight to /api/chat/[chatSlug]/turn with
	 * `persistUser: true` — saves a roundtrip + a duplicate DB write.
	 *
	 * Returns { chatSlug, userPrePersisted }: when userPrePersisted is
	 * true, the caller should pass `persistUser: false` to /turn so it
	 * doesn't insert a duplicate user row.
	 */
	async function ensureChatSlug(
		content: string
	): Promise<{ chatSlug: string; userPrePersisted: boolean }> {
		if (!data.signedIn) throw new Error('Sign in to chat with this story');

		if (chatSlug) return { chatSlug, userPrePersisted: false };

		const res = await fetch(`/api/discover/${story.slug}/chat`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ content })
		});
		if (!res.ok) {
			const body = await res.text().catch(() => '');
			throw new Error(`failed to create chat: ${res.status} ${body}`);
		}
		const out = (await res.json()) as { chatSlug: string };
		chatSlug = out.chatSlug;
		return { chatSlug: out.chatSlug, userPrePersisted: true };
	}

	async function sendTurn(content: string) {
		if (streaming) return;
		streaming = true;
		errorMsg = null;

		// Optimistic user turn.
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
		scrollChatToBottom();

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
					.filter(
						(p): p is { type: 'text'; text: string; state?: 'streaming' | 'done' } =>
							p.type === 'text'
					)
					.map((p) => p.text)
					.join('');
				turns = turns.map((t) =>
					t.id === placeholderId ? { ...t, parts: [...parts], content: flatText } : t
				);
				scrollChatToBottom();
			}

			turns = turns.map((t) => (t.id === placeholderId ? { ...t, status: 'complete' } : t));
			// Refresh layout (sidebar / chat list shows the new thread).
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
		// Submitting always re-engages auto-scroll, even if the user
		// scrolled up to re-read the article first.
		stickToBottom = true;
		sendTurn(text);
	}

	function openLoginViaTopBar() {
		// Anon user clicked into a disabled composer surface. The home /
		// layout-level Sign In button is what owns the LoginModal; we
		// can't open it from here without lifting modal state. For now,
		// scroll the user toward the top so the "Sign in" button is
		// visible — good enough for a v0 affordance.
		if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	onMount(() => {
		if (turns.length > 0) scrollChatToBottom({ force: true });
	});

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

<svelte:window onscroll={updateStickFromScroll} />

<main class="mx-auto max-w-[760px] px-8 pb-40 pt-6">
	<!-- Header -->
	<header class="mb-8 flex items-center justify-between">
		<a
			href="/"
			class="text-muted hover:text-ink inline-flex items-center gap-1.5 text-sm transition-colors"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="m15 18-6-6 6-6" />
			</svg>
			Back to Discover
		</a>
		<div class="flex items-center gap-1">
			<button
				type="button"
				class="text-muted hover:text-ink hover:bg-ink/5 flex h-9 w-9 items-center justify-center rounded-full transition-colors"
				title="Bookmark (coming soon)"
				aria-label="Bookmark"
				disabled
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
				</svg>
			</button>
			<button
				type="button"
				class="text-muted hover:text-ink hover:bg-ink/5 flex h-9 w-9 items-center justify-center rounded-full transition-colors"
				title="Share (coming soon)"
				aria-label="Share"
				disabled
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="18" cy="5" r="3" />
					<circle cx="6" cy="12" r="3" />
					<circle cx="18" cy="19" r="3" />
					<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
					<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
				</svg>
			</button>
		</div>
	</header>

	<!-- Title -->
	<h1 class="text-ink mb-3 text-[34px] font-extrabold leading-[1.15] tracking-[-0.035em]">
		{story.story.headline}
	</h1>

	<!-- Meta row + source pill -->
	<div class="text-muted mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
		<span>Published {fetchedDate}</span>
		<span aria-hidden="true">·</span>
		<a
			href={story.sourceUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="hover:text-ink inline-flex items-center gap-1 underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
		>
			via {sourceLabel}
			<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M7 17 17 7" />
				<path d="M7 7h10v10" />
			</svg>
		</a>
		{#if story.bodySource === 'snippet'}
			<span aria-hidden="true">·</span>
			<span class="text-muted/80 italic" title="Full article body unavailable — set FIRECRAWL_API_KEY to scrape upstream">
				snippet only
			</span>
		{/if}
	</div>

	<!-- Cover image -->
	{#if hasImage && !imageBroken}
		<div class="border-border bg-surface mb-7 overflow-hidden rounded-xl border">
			<img
				src={story.story.imageUrl}
				alt=""
				class="block h-auto w-full"
				onerror={() => (imageBroken = true)}
			/>
		</div>
	{/if}

	<!-- Body -->
	<article class="border-border mb-10 border-b pb-10">
		<Markdown text={story.body} variant="article" class="text-ink" />
	</article>

	<!-- Chat turns (if any) -->
	{#if turns.length > 0}
		<section class="mb-12 space-y-5">
			<div class="text-muted mb-2 text-xs uppercase tracking-wide">Follow-ups</div>
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
			{#if errorMsg}
				<div class="rounded-lg border border-red-300/40 bg-red-50/60 px-3 py-2 text-sm text-red-700" role="alert">
					{errorMsg}
				</div>
			{/if}
		</section>
	{/if}

	<!-- Discover more -->
	{#if data.related.length > 0}
		<section class="mb-10">
			<h2 class="text-ink mb-4 text-[18px] font-extrabold tracking-[-0.02em]">Discover more</h2>
			<div class="grid grid-cols-3 gap-4">
				{#each data.related as related (related.id)}
					<ResearchCard story={related} />
				{/each}
			</div>
		</section>
	{/if}
</main>

<!-- Fixed bottom composer -->
<div class="compose">
	<ChatComposer
		bind:value={composeValue}
		{placeholder}
		disabled={!data.signedIn || streaming}
		submitting={streaming}
		showFleet={false}
		onSubmit={onComposerSubmit}
		onDisabledClick={openLoginViaTopBar}
		variant="embedded"
		label="Story follow-up input"
	/>
</div>

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
