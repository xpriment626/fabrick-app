<!--
	Global left sidebar. Two states:

	- Collapsed (~60px): icon-only rail. Brand mark, New chat, Search
	  placeholder, Research feed link, Wallet link. User avatar at bottom.
	- Expanded (~260px): wordmark + collapse toggle, New chat button,
	  search input placeholder, Nav (Research / Wallet), History grouped
	  by Today/Yesterday/Earlier, user profile at bottom.

	State persists in localStorage so reloads remember. CSS variable
	`--sidebar-w` is set on `<html>` from the script so other layout
	regions (ambient bar, main content) can stay aligned without prop
	drilling.

	The chat history list reads from `recents` passed down by the root
	layout's server load.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { ChatSummary } from '$lib/server/db/chats';

	type Props = { recents: ChatSummary[] };
	let { recents }: Props = $props();

	let expanded = $state(false);
	let creating = $state(false);

	// Reactive width var applied to <html> so CSS elsewhere can use
	// var(--sidebar-w). Updated whenever `expanded` changes.
	$effect(() => {
		if (typeof document !== 'undefined') {
			document.documentElement.style.setProperty(
				'--sidebar-w',
				expanded ? '260px' : '60px'
			);
		}
	});

	onMount(() => {
		// Restore last state from localStorage.
		try {
			const saved = localStorage.getItem('fabrick.sidebar.expanded');
			if (saved === '1') expanded = true;
		} catch {
			// localStorage unavailable; default collapsed.
		}
	});

	function toggle() {
		expanded = !expanded;
		try {
			localStorage.setItem('fabrick.sidebar.expanded', expanded ? '1' : '0');
		} catch {
			// no-op
		}
	}

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
			console.error('[Sidebar] new chat failed', err);
		} finally {
			creating = false;
		}
	}

	/** Bucket recents by date for the History section. */
	type Bucket = { label: string; items: ChatSummary[] };
	const buckets = $derived.by<Bucket[]>(() => {
		const now = Date.now();
		const startOfDay = (d: Date) => {
			const x = new Date(d);
			x.setHours(0, 0, 0, 0);
			return x.getTime();
		};
		const today = startOfDay(new Date(now));
		const yesterday = today - 24 * 3600 * 1000;
		const sevenDaysAgo = today - 7 * 24 * 3600 * 1000;

		const t: ChatSummary[] = [];
		const y: ChatSummary[] = [];
		const w: ChatSummary[] = [];
		const e: ChatSummary[] = [];

		for (const c of recents) {
			const ts = new Date(c.updatedAt).getTime();
			if (ts >= today) t.push(c);
			else if (ts >= yesterday) y.push(c);
			else if (ts >= sevenDaysAgo) w.push(c);
			else e.push(c);
		}

		const out: Bucket[] = [];
		if (t.length) out.push({ label: 'Today', items: t });
		if (y.length) out.push({ label: 'Yesterday', items: y });
		if (w.length) out.push({ label: 'Earlier this week', items: w });
		if (e.length) out.push({ label: 'Earlier', items: e });
		return out;
	});

	const currentChatSlug = $derived(
		page.url.pathname.startsWith('/chat/')
			? page.url.pathname.split('/')[2]
			: undefined
	);

	const onResearch = $derived(page.url.pathname === '/');
	const onWallet = $derived(page.url.pathname === '/wallet');
</script>

<aside class="sidebar" class:expanded aria-label="Main navigation">
	<!-- Top: brand + collapse toggle -->
	<div class="top">
		<button
			type="button"
			onclick={toggle}
			class="brand"
			aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
			aria-expanded={expanded}
		>
			{#if expanded}
				<span class="wordmark">fabrick</span>
				<svg
					class="collapse-icon"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="m15 6-6 6 6 6" />
				</svg>
			{:else}
				<span class="mark" aria-hidden="true">f</span>
			{/if}
		</button>
	</div>

	<!-- Action group: new chat, search -->
	<div class="actions">
		<button
			type="button"
			onclick={newChat}
			disabled={creating}
			class="action-btn"
			title="New chat"
			aria-label="New chat"
		>
			<svg
				width="16"
				height="16"
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
			{#if expanded}<span class="action-label">New chat</span>{/if}
		</button>

		<button
			type="button"
			disabled
			class="action-btn"
			title="Search (coming soon)"
			aria-label="Search"
		>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.3-4.3" />
			</svg>
			{#if expanded}<span class="action-label">Search</span>{/if}
		</button>
	</div>

	<!-- Primary nav -->
	<nav class="nav" aria-label="Sections">
		<a href="/" class="nav-item" class:active={onResearch} title="Research">
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
				<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
			</svg>
			{#if expanded}<span class="nav-label">Research</span>{/if}
		</a>
		<a href="/wallet" class="nav-item" class:active={onWallet} title="Wallet">
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
				<path d="M18 12h.01" />
			</svg>
			{#if expanded}<span class="nav-label">Wallet</span>{/if}
		</a>
	</nav>

	<!-- History (only when expanded) -->
	{#if expanded}
		<div class="history">
			<div class="history-heading">History</div>
			{#if buckets.length === 0}
				<div class="history-empty">No chats yet.</div>
			{:else}
				{#each buckets as bucket (bucket.label)}
					<div class="history-bucket">
						<div class="history-bucket-label">{bucket.label}</div>
						<ul class="history-list">
							{#each bucket.items as chat (chat.slug)}
								<li>
									<a
										href="/chat/{chat.slug}"
										class="history-link"
										class:current={chat.slug === currentChatSlug}
										title={chat.title || 'New chat'}
									>
										{chat.title || 'New chat'}
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			{/if}
		</div>
	{/if}

	<!-- Footer: user avatar -->
	<div class="footer">
		<div class="avatar" title="Dev user">
			<span>D</span>
		</div>
		{#if expanded}<span class="footer-label">Dev User</span>{/if}
	</div>
</aside>

<style>
	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: 60px;
		display: flex;
		flex-direction: column;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		padding: 12px 8px;
		gap: 8px;
		z-index: 30;
		transition: width 180ms ease;
	}
	.sidebar.expanded {
		width: 260px;
		padding: 12px 12px;
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 40px;
		padding: 0 4px;
	}
	.brand {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		height: 32px;
		color: var(--color-ink);
		border-radius: 6px;
		transition: background-color 120ms ease;
	}
	.brand:hover {
		background: color-mix(in srgb, var(--color-ink) 5%, transparent);
	}
	.brand .wordmark {
		font-size: 18px;
		font-weight: 800;
		letter-spacing: -0.04em;
		padding-left: 8px;
	}
	.brand .mark {
		font-size: 20px;
		font-weight: 800;
		letter-spacing: -0.04em;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}
	.brand .collapse-icon {
		color: var(--color-muted);
		margin-right: 4px;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 4px;
	}
	.action-btn {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 10px;
		height: 36px;
		padding: 0 10px;
		border-radius: 8px;
		color: var(--color-ink);
		transition: background-color 120ms ease;
	}
	.sidebar:not(.expanded) .action-btn {
		justify-content: center;
		padding: 0;
	}
	.action-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-ink) 5%, transparent);
	}
	.action-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.action-label {
		font-size: 13px;
		font-weight: 500;
	}

	.nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 4px;
	}
	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 36px;
		padding: 0 10px;
		border-radius: 8px;
		color: var(--color-muted);
		text-decoration: none;
		font-size: 13px;
		font-weight: 500;
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}
	.sidebar:not(.expanded) .nav-item {
		justify-content: center;
		padding: 0;
	}
	.nav-item:hover {
		background: color-mix(in srgb, var(--color-ink) 5%, transparent);
		color: var(--color-ink);
	}
	.nav-item.active {
		color: var(--color-ink);
		background: color-mix(in srgb, var(--color-ink) 6%, transparent);
	}

	.history {
		margin-top: 8px;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-right: 4px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.history-heading {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-muted);
		padding: 4px 6px;
	}
	.history-empty {
		font-size: 12px;
		color: var(--color-muted);
		padding: 4px 6px;
		font-style: italic;
	}
	.history-bucket {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.history-bucket-label {
		font-size: 11px;
		font-weight: 500;
		color: var(--color-muted);
		padding: 2px 6px;
	}
	.history-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.history-link {
		display: block;
		padding: 6px 8px;
		font-size: 13px;
		color: var(--color-ink);
		text-decoration: none;
		border-radius: 6px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
		transition: background-color 120ms ease;
	}
	.history-link:hover {
		background: color-mix(in srgb, var(--color-ink) 4%, transparent);
	}
	.history-link.current {
		background: color-mix(in srgb, var(--color-ink) 8%, transparent);
		font-weight: 500;
	}

	.footer {
		margin-top: auto;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 8px;
		border-top: 1px solid var(--color-border);
		padding-top: 12px;
	}
	.sidebar:not(.expanded) .footer {
		justify-content: center;
		padding: 12px 0 4px;
	}
	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--color-ink) 80%, transparent);
		color: var(--color-bg);
		font-size: 12px;
		font-weight: 700;
		flex-shrink: 0;
	}
	.footer-label {
		font-size: 13px;
		color: var(--color-ink);
		font-weight: 500;
	}
</style>
