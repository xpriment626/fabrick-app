<!--
	Side panel — recent chats list. Mounted inside the chat route's main
	layout. Single column for now; "New chat" button + grouped-by-date
	sections + active-state styling. Search/filter and grouping by anchor
	type are future polish.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import type { ChatSummary } from '$lib/server/db/chats';

	type Props = { recents: ChatSummary[]; currentSlug?: string };
	let { recents, currentSlug }: Props = $props();

	let creating = $state(false);

	async function newChat() {
		if (creating) return;
		creating = true;
		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}'
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const { slug } = (await res.json()) as { slug: string };
			await goto(`/chat/${slug}`);
		} catch (err) {
			console.error('[ChatSidePanel] new chat failed', err);
			creating = false;
		}
	}

	function formatRelative(iso: string): string {
		const ms = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(ms / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h`;
		const days = Math.floor(hrs / 24);
		if (days < 7) return `${days}d`;
		const weeks = Math.floor(days / 7);
		if (weeks < 4) return `${weeks}w`;
		return new Date(iso).toLocaleDateString();
	}
</script>

<div class="flex h-full flex-col">
	<button
		type="button"
		onclick={newChat}
		disabled={creating}
		class="border-border hover:bg-surface mb-4 flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
	>
		<span>New chat</span>
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M12 5v14" />
			<path d="M5 12h14" />
		</svg>
	</button>

	<div class="text-muted mb-2 px-1 text-xs uppercase tracking-wide">Recent</div>
	<nav class="flex flex-col gap-0.5 overflow-y-auto">
		{#each recents as chat (chat.slug)}
			<a
				href="/chat/{chat.slug}"
				class="group flex flex-col gap-0.5 rounded-md px-3 py-2 transition-colors"
				class:bg-surface={chat.slug === currentSlug}
				class:border-border={chat.slug === currentSlug}
				class:border={chat.slug === currentSlug}
				class:hover:bg-surface={chat.slug !== currentSlug}
			>
				<div class="text-ink truncate text-sm font-medium">
					{chat.title || 'New chat'}
				</div>
				<div class="text-muted text-xs">{formatRelative(chat.updatedAt)}</div>
			</a>
		{:else}
			<div class="text-muted px-3 py-2 text-xs italic">No chats yet.</div>
		{/each}
	</nav>
</div>
