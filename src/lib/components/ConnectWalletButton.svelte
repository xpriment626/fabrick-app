<!--
	Floating top-right pill — "Sign in" when anonymous, user menu when
	authed. Opens LoginModal on click when anonymous; toggles a small
	dropdown with the user's email + sign-out action when authed.

	Persistent across all routes. Wallet creation happens automatically
	on first sign-in (Privy dashboard config), so the user goes from
	"Sign in" → modal → email code → wallet provisioned by Privy →
	cookie set → page reloads → menu shows their address.
-->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import LoginModal from './LoginModal.svelte';
	import { clearFabrickSession, getPrivy } from '$lib/client/privy';

	type Props = {
		user: {
			id: string;
			email: string | null;
			displayName: string | null;
			solanaAddress: string | null;
		} | null;
	};
	let { user }: Props = $props();

	let modalOpen = $state(false);
	let menuOpen = $state(false);
	let signingOut = $state(false);

	function avatarChar(): string {
		if (user?.email) return user.email[0]?.toUpperCase() ?? '?';
		if (user?.displayName) return user.displayName[0]?.toUpperCase() ?? '?';
		return '?';
	}

	function shortAddr(addr: string | null): string {
		if (!addr) return '';
		if (addr.length <= 9) return addr;
		return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
	}

	async function signOut() {
		if (signingOut) return;
		signingOut = true;
		try {
			// Clear our cookie first so re-renders see the user as gone.
			await clearFabrickSession();
			try {
				const privy = await getPrivy();
				// `js-sdk-core` exposes logout under different paths between
				// versions (`privy.logout`, `privy.user.logout`, `privy.auth.logout`).
				// Try all known shapes — best-effort, non-fatal if none match.
				const p = privy as unknown as {
					logout?: () => Promise<void>;
					user?: { logout?: () => Promise<void> };
					auth?: { logout?: () => Promise<void> };
				};
				const fn = p.logout ?? p.user?.logout ?? p.auth?.logout;
				if (typeof fn === 'function') await fn.call(privy);
			} catch (err) {
				console.warn('[connect] privy logout failed (non-fatal):', err);
			}
			// Hardening for demo recordings: nuke any Privy-owned
			// localStorage entries even if the SDK's logout path didn't
			// match. Without this, `privy.initialize()` on the next
			// sign-in could auto-restore the previous session and skip
			// the email/OTP flow we want to demonstrate.
			try {
				const keys: string[] = [];
				for (let i = 0; i < localStorage.length; i++) {
					const k = localStorage.key(i);
					if (k && (k.startsWith('privy:') || k.startsWith('privy-'))) keys.push(k);
				}
				for (const k of keys) localStorage.removeItem(k);
			} catch {
				/* localStorage unavailable — non-fatal */
			}
			menuOpen = false;
			await invalidateAll();
			await goto('/');
		} finally {
			signingOut = false;
		}
	}

	function copyAddr() {
		if (!user?.solanaAddress) return;
		navigator.clipboard?.writeText(user.solanaAddress).catch(() => {});
	}

	function onWindowClick(e: MouseEvent) {
		if (!menuOpen) return;
		const target = e.target as HTMLElement;
		if (!target.closest?.('.menu') && !target.closest?.('.pill')) {
			menuOpen = false;
		}
	}
</script>

<svelte:window onclick={onWindowClick} />

{#if user}
	<div class="anchor">
		<button
			type="button"
			class="pill"
			onclick={() => (menuOpen = !menuOpen)}
			aria-expanded={menuOpen}
			aria-haspopup="menu"
		>
			<span class="avatar">{avatarChar()}</span>
			<span class="ident">
				{#if user.solanaAddress}
					{shortAddr(user.solanaAddress)}
				{:else}
					{user.email ?? user.displayName ?? 'Account'}
				{/if}
			</span>
		</button>

		{#if menuOpen}
			<div class="menu" role="menu">
				<div class="menu-head">
					{#if user.email}
						<div class="menu-email">{user.email}</div>
					{/if}
					{#if user.solanaAddress}
						<button type="button" class="menu-addr" onclick={copyAddr} title="Copy address">
							<span class="addr-mono">{shortAddr(user.solanaAddress)}</span>
							<span class="addr-copy">copy</span>
						</button>
					{:else}
						<div class="menu-empty">Wallet provisioning…</div>
					{/if}
				</div>
				<div class="menu-sep"></div>
				<a class="menu-item" href="/wallet" onclick={() => (menuOpen = false)}>Wallet</a>
				<a class="menu-item" href="/settings" onclick={() => (menuOpen = false)}>Settings</a>
				<div class="menu-sep"></div>
				<button type="button" class="menu-item danger" onclick={signOut} disabled={signingOut}>
					{signingOut ? 'Signing out…' : 'Sign out'}
				</button>
			</div>
		{/if}
	</div>
{:else}
	<button
		type="button"
		onclick={() => (modalOpen = true)}
		class="connect-btn"
		aria-label="Sign in"
	>
		Sign in
	</button>
	<LoginModal bind:open={modalOpen} onClose={() => (modalOpen = false)} />
{/if}

<style>
	.connect-btn,
	.pill {
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: 25;
		border: none;
		background: var(--color-ink);
		color: var(--color-bg);
		padding: 9px 16px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 120ms ease;
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.5) inset,
			0 6px 16px -8px rgba(28, 25, 23, 0.18);
	}
	.connect-btn:hover,
	.pill:hover {
		opacity: 0.92;
	}
	.connect-btn:active,
	.pill:active {
		transform: scale(0.98);
	}

	.anchor {
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: 25;
	}
	.anchor .pill {
		position: static;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px 6px 6px;
	}
	.avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--color-bg) 90%, var(--color-ink));
		color: var(--color-ink);
		font-size: 11px;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		text-transform: uppercase;
	}
	.ident {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.01em;
	}

	.menu {
		position: absolute;
		top: 44px;
		right: 0;
		min-width: 220px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		box-shadow: 0 12px 32px -12px rgba(28, 25, 23, 0.22);
		padding: 6px;
		display: flex;
		flex-direction: column;
	}
	.menu-head {
		padding: 8px 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.menu-email {
		font-size: 13px;
		font-weight: 500;
		color: var(--color-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.menu-addr {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		gap: 6px;
		align-items: baseline;
	}
	.addr-mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 11px;
		color: var(--color-muted);
	}
	.addr-copy {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-muted);
		opacity: 0.6;
	}
	.menu-addr:hover .addr-mono {
		color: var(--color-ink);
	}
	.menu-empty {
		font-size: 11px;
		color: var(--color-muted);
		font-style: italic;
	}
	.menu-sep {
		height: 1px;
		background: var(--color-border);
		margin: 4px 0;
	}
	.menu-item {
		all: unset;
		display: block;
		padding: 8px 10px;
		font-size: 13px;
		color: var(--color-ink);
		cursor: pointer;
		border-radius: 6px;
		text-align: left;
	}
	.menu-item:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-ink) 4%, transparent);
	}
	.menu-item.danger {
		color: var(--color-negative);
	}
	.menu-item:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
