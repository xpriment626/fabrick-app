<!-- Global left sidebar for the savings-focused Fabrick shell. -->
<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	type Props = { recents: unknown[] };
	let { recents: _recents }: Props = $props();

	let expanded = $state(false);

	$effect(() => {
		if (typeof document !== 'undefined') {
			document.documentElement.style.setProperty(
				'--sidebar-w',
				expanded ? '220px' : '60px'
			);
		}
	});

	onMount(() => {
		try {
			expanded = localStorage.getItem('fabrick.sidebar.expanded') === '1';
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

	const onSavings = $derived(page.url.pathname === '/');
	const onWallet = $derived(page.url.pathname === '/wallet');
	const onSettings = $derived(page.url.pathname === '/settings');
</script>

<aside class="sidebar" class:expanded aria-label="Main navigation">
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
				<span class="collapse-icon" aria-hidden="true">&lt;</span>
			{:else}
				<span class="mark" aria-hidden="true">f</span>
			{/if}
		</button>
	</div>

	<nav class="nav" aria-label="Sections">
		<a href="/" class="nav-item" class:active={onSavings} title="Savings">
			<span class="nav-icon" aria-hidden="true">$</span>
			{#if expanded}<span class="nav-label">Savings</span>{/if}
		</a>
		<a href="/wallet" class="nav-item" class:active={onWallet} title="Wallet">
			<span class="nav-icon" aria-hidden="true">□</span>
			{#if expanded}<span class="nav-label">Wallet</span>{/if}
		</a>
		<a href="/settings" class="nav-item" class:active={onSettings} title="Settings">
			<span class="nav-icon" aria-hidden="true">o</span>
			{#if expanded}<span class="nav-label">Settings</span>{/if}
		</a>
	</nav>

	<div class="footer">
		<div class="avatar" title="User">
			<span>U</span>
		</div>
		{#if expanded}<span class="footer-label">User</span>{/if}
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
		width: 220px;
		padding: 12px;
	}

	.top {
		display: flex;
		align-items: center;
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
	.wordmark {
		font-size: 18px;
		font-weight: 800;
		letter-spacing: -0.02em;
		padding-left: 8px;
	}
	.mark {
		font-size: 20px;
		font-weight: 800;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}
	.collapse-icon {
		color: var(--color-muted);
		font-size: 24px;
		line-height: 1;
		margin-right: 7px;
	}

	.nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 8px;
	}
	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 38px;
		padding: 0 10px;
		border-radius: 8px;
		color: var(--color-muted);
		text-decoration: none;
		font-size: 13px;
		font-weight: 600;
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
	.nav-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		font-size: 14px;
		font-weight: 800;
	}

	.footer {
		margin-top: auto;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 8px 4px;
		border-top: 1px solid var(--color-border);
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
