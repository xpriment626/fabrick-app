<!--
	Global left sidebar (design.md §17 — fleet-first IA). Two states:

	- Collapsed (~60px): icon-only rail. Brand mark, Search placeholder,
	  News / Fleet / Wallet links. User avatar at bottom.
	- Expanded (~260px): wordmark + collapse toggle, search input
	  placeholder, Nav (News / Fleet / Wallet), History grouped by
	  Today/Yesterday/Earlier, user profile at bottom.

	No generic "New chat" entry: there is no unanchored chat (§17). A
	conversation starts by opening a News story or a Fleet run. Run history
	lives on the Fleet page (composition tabs); the History list here is
	anchored conversations.

	State persists in localStorage so reloads remember. CSS variable
	`--sidebar-w` is set on `<html>` from the script so other layout
	regions stay aligned without prop drilling.
-->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { ChatSummary } from '$lib/server/db/chats';

	type Props = { recents: ChatSummary[] };
	let { recents }: Props = $props();

	let expanded = $state(false);

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

	/** Bucket a chat list by date for a History section. */
	type Bucket = { label: string; items: ChatSummary[] };
	function bucketByDate(items: ChatSummary[]): Bucket[] {
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

		for (const c of items) {
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
	}

	// §17: split history per surface — Fleet (run-anchored follow-ups) vs
	// News (story/everything else). Two sections, mirroring Cowork's Recents.
	const newsBuckets = $derived(bucketByDate(recents.filter((c) => c.anchorType !== 'fleet_run')));
	const fleetBuckets = $derived(bucketByDate(recents.filter((c) => c.anchorType === 'fleet_run')));
	const hasAnyHistory = $derived(newsBuckets.length > 0 || fleetBuckets.length > 0);

	const currentChatSlug = $derived(
		page.url.pathname.startsWith('/chat/')
			? page.url.pathname.split('/')[2]
			: undefined
	);

	const onNews = $derived(page.url.pathname === '/');
	const onFleet = $derived(page.url.pathname === '/fleet');
	const onWallet = $derived(page.url.pathname === '/wallet');

	let openMenuSlug = $state<string | null>(null);
	let deletingSlug = $state<string | null>(null);

	function toggleMenu(e: MouseEvent, slug: string) {
		e.preventDefault();
		e.stopPropagation();
		openMenuSlug = openMenuSlug === slug ? null : slug;
	}

	function onWindowClick(e: MouseEvent) {
		if (!openMenuSlug) return;
		const target = e.target as Element | null;
		if (!target?.closest(`[data-menu-for="${openMenuSlug}"]`)) {
			openMenuSlug = null;
		}
	}

	async function deleteChat(slug: string) {
		if (deletingSlug) return;
		deletingSlug = slug;
		openMenuSlug = null;
		try {
			const res = await fetch(`/api/chat/${encodeURIComponent(slug)}`, {
				method: 'DELETE'
			});
			if (!res.ok) throw new Error(`${res.status}`);
			// If the user is sitting inside the chat they just deleted,
			// punt them to home — the route would 404 otherwise.
			if (slug === currentChatSlug) await goto('/');
			void invalidateAll();
		} catch (err) {
			console.error('[Sidebar] delete chat failed', err);
		} finally {
			deletingSlug = null;
		}
	}
</script>

<svelte:window onclick={onWindowClick} />

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

	<!-- Action group: search (no generic "New chat" — §17: chat is anchored
	     to a News story or a Fleet run, never started blank). -->
	<div class="actions">
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
		<a href="/" class="nav-item" class:active={onNews} title="News">
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
				<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
				<path d="M18 14h-8M15 18h-5M10 6h8v4h-8z" />
			</svg>
			{#if expanded}<span class="nav-label">News</span>{/if}
		</a>
		<a href="/fleet" class="nav-item" class:active={onFleet} title="Fleet">
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
				<rect x="2" y="3" width="20" height="5" rx="1" />
				<path d="M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" />
				<path d="M10 12h4" />
			</svg>
			{#if expanded}<span class="nav-label">Fleet</span>{/if}
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

	<!-- History (only when expanded). §17: two surfaces — News + Fleet. -->
	{#snippet historySection(heading: string, sectionBuckets: Bucket[])}
		{#if sectionBuckets.length > 0}
			<div class="history-section">
				<div class="history-heading">{heading}</div>
				{#each sectionBuckets as bucket (bucket.label)}
					<div class="history-bucket">
						<div class="history-bucket-label">{bucket.label}</div>
						<ul class="history-list">
							{#each bucket.items as chat (chat.slug)}
								<li
									class="history-row"
									class:current={chat.slug === currentChatSlug}
									class:menu-open={openMenuSlug === chat.slug}
								>
									<a
										href="/chat/{chat.slug}"
										class="history-link"
										title={chat.title || 'Untitled'}
									>
										{chat.title || 'Untitled'}
									</a>
									<div class="history-menu-wrap" data-menu-for={chat.slug}>
										<button
											type="button"
											class="history-menu-btn"
											aria-label="Chat options"
											aria-haspopup="menu"
											aria-expanded={openMenuSlug === chat.slug}
											onclick={(e) => toggleMenu(e, chat.slug)}
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="currentColor"
												aria-hidden="true"
											>
												<circle cx="5" cy="12" r="1.5" />
												<circle cx="12" cy="12" r="1.5" />
												<circle cx="19" cy="12" r="1.5" />
											</svg>
										</button>
										{#if openMenuSlug === chat.slug}
											<div class="history-menu" role="menu">
												<button
													type="button"
													role="menuitem"
													class="history-menu-item danger"
													disabled={deletingSlug === chat.slug}
													onclick={() => deleteChat(chat.slug)}
												>
													{deletingSlug === chat.slug ? 'Deleting…' : 'Delete'}
												</button>
											</div>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{/if}
	{/snippet}

	{#if expanded}
		<div class="history">
			{#if !hasAnyHistory}
				<div class="history-heading">History</div>
				<div class="history-empty">No conversations yet.</div>
			{:else}
				{@render historySection('News', newsBuckets)}
				{@render historySection('Fleet', fleetBuckets)}
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
	.history-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
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
	.history-row {
		position: relative;
		display: flex;
		align-items: stretch;
		border-radius: 6px;
		transition: background-color 120ms ease;
	}
	.history-row:hover,
	.history-row.menu-open {
		background: color-mix(in srgb, var(--color-ink) 4%, transparent);
	}
	.history-row.current {
		background: color-mix(in srgb, var(--color-ink) 8%, transparent);
	}
	.history-link {
		flex: 1;
		min-width: 0;
		display: block;
		padding: 6px 8px;
		font-size: 13px;
		color: var(--color-ink);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.history-row.current .history-link {
		font-weight: 500;
	}
	.history-menu-wrap {
		position: relative;
		display: flex;
		align-items: center;
		opacity: 0;
		transition: opacity 120ms ease;
		padding-right: 4px;
	}
	.history-row:hover .history-menu-wrap,
	.history-row.menu-open .history-menu-wrap {
		opacity: 1;
	}
	.history-menu-btn {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 5px;
		color: var(--color-muted);
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}
	.history-menu-btn:hover {
		background: color-mix(in srgb, var(--color-ink) 8%, transparent);
		color: var(--color-ink);
	}
	.history-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		min-width: 130px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 4px;
		box-shadow: 0 12px 24px -8px rgba(28, 25, 23, 0.16);
		z-index: 20;
		display: flex;
		flex-direction: column;
	}
	.history-menu-item {
		all: unset;
		cursor: pointer;
		padding: 7px 10px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-ink);
	}
	.history-menu-item:hover {
		background: color-mix(in srgb, var(--color-ink) 6%, transparent);
	}
	.history-menu-item.danger {
		color: #b91c1c;
	}
	.history-menu-item.danger:hover {
		background: color-mix(in srgb, #dc2626 8%, transparent);
	}
	.history-menu-item:disabled {
		opacity: 0.5;
		cursor: default;
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
