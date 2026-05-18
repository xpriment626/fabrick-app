<!--
	Email passwordless + passkey login modal.

	Walks the email flow through the same states Privy's React SDK
	exposes — initial → sending-code → awaiting-code-input →
	submitting-code → done — implemented as Svelte 5 runes. Passkey is
	a one-button alternative for users who already have one provisioned.

	On successful login: POSTs the Privy access token to our backend
	(/api/auth/session) which mints the Supabase-compatible cookie.
	Then reloads so SSR sees the new session.
-->
<script lang="ts">
	import { getPrivy, exchangeForFabrickSession } from '$lib/client/privy';
	import { invalidateAll } from '$app/navigation';

	type Props = { open?: boolean; onClose: () => void };
	let { open = $bindable(false), onClose }: Props = $props();

	type Stage =
		| 'initial'
		| 'sending-code'
		| 'awaiting-code'
		| 'submitting-code'
		| 'passkey-pending'
		| 'oauth-redirecting'
		| 'done'
		| 'error';

	let stage = $state<Stage>('initial');
	let email = $state('');
	let code = $state('');
	let errorMsg = $state<string | null>(null);

	function reset() {
		stage = 'initial';
		email = '';
		code = '';
		errorMsg = null;
	}

	/**
	 * Best-effort: nuke any residual Privy session in the browser before
	 * starting a sign-in flow. Without this, a half-state SDK session
	 * (e.g. from a prior session whose Fabrick cookie expired or got
	 * cleared, or a dev-server kill while signed in) makes Privy's
	 * email-OTP path go down the "link email to current user" branch
	 * instead of "log into email's owner," producing the cryptic
	 * "Another user has already linked this email account" error.
	 *
	 * Same defensive cascade as ConnectWalletButton's signOut() since
	 * the SDK's logout path has churned between minor versions.
	 */
	async function clearStalePrivySession() {
		try {
			const privy = await getPrivy();
			const p = privy as unknown as {
				logout?: () => Promise<void>;
				user?: { logout?: () => Promise<void> };
				auth?: { logout?: () => Promise<void> };
			};
			const fn = p.logout ?? p.user?.logout ?? p.auth?.logout;
			if (typeof fn === 'function') await fn.call(privy);
		} catch (err) {
			console.warn('[login] privy preflight logout failed (non-fatal):', err);
		}
		try {
			const keys: string[] = [];
			for (let i = 0; i < localStorage.length; i++) {
				const k = localStorage.key(i);
				if (k && (k.startsWith('privy:') || k.startsWith('privy-'))) keys.push(k);
			}
			for (const k of keys) localStorage.removeItem(k);
		} catch {
			// localStorage may be blocked (private browsing strict mode); ignore.
		}
	}

	async function sendCode() {
		if (!email.trim()) return;
		stage = 'sending-code';
		errorMsg = null;
		try {
			await clearStalePrivySession();
			const privy = await getPrivy();
			await privy.auth.email.sendCode(email.trim());
			stage = 'awaiting-code';
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			stage = 'error';
		}
	}

	async function submitCode() {
		if (!code.trim()) return;
		stage = 'submitting-code';
		errorMsg = null;
		try {
			const privy = await getPrivy();
			await privy.auth.email.loginWithCode(email.trim(), code.trim());
			await exchangeForFabrickSession(privy);
			stage = 'done';
			await invalidateAll();
			onClose();
			reset();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			stage = 'error';
		}
	}

	/**
	 * Kick off a Privy OAuth flow. `js-sdk-core` gives us the provider
	 * URL; we redirect the whole page to it. The provider sends the user
	 * back to /auth/oauth/[provider]/callback?code=...&state=... where
	 * the callback page finishes the handshake.
	 */
	async function tryOAuth(provider: 'twitter') {
		stage = 'oauth-redirecting';
		errorMsg = null;
		try {
			await clearStalePrivySession();
			const privy = await getPrivy();
			const redirectURI = `${window.location.origin}/auth/oauth/${provider}/callback`;
			const { url } = await privy.auth.oauth.generateURL(provider, redirectURI);
			if (!url) throw new Error('Privy did not return an OAuth URL');
			window.location.href = url;
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			stage = 'error';
		}
	}

	async function tryPasskey() {
		stage = 'passkey-pending';
		errorMsg = null;
		try {
			await clearStalePrivySession();
			const privy = await getPrivy();
			// `passkey.login` is the API in js-sdk-core. If the user has
			// no passkey provisioned this will reject with a userland
			// error; surface it so they can fall back to email.
			const auth = privy.auth as unknown as {
				passkey: { login: () => Promise<unknown> };
			};
			await auth.passkey.login();
			await exchangeForFabrickSession(privy);
			stage = 'done';
			await invalidateAll();
			onClose();
			reset();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			stage = 'error';
		}
	}

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
			reset();
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			onClose();
			reset();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div
		class="backdrop"
		onclick={onBackdropClick}
		onkeydown={onKeydown}
		role="dialog"
		aria-modal="true"
		aria-label="Sign in to Fabrick"
		tabindex="-1"
	>
		<div class="modal">
			<div class="head">
				<h2>Sign in to Fabrick</h2>
				<p class="sub">Email code or passkey — your Solana wallet is created on first sign-in.</p>
			</div>

			{#if stage === 'initial' || stage === 'sending-code' || stage === 'error'}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						sendCode();
					}}
				>
					<label class="label" for="email">Email</label>
					<input
						id="email"
						type="email"
						placeholder="you@example.com"
						bind:value={email}
						autocomplete="email"
						required
						disabled={stage === 'sending-code'}
					/>
					<button
						type="submit"
						class="primary"
						disabled={!email.trim() || stage === 'sending-code'}
					>
						{stage === 'sending-code' ? 'Sending…' : 'Send code'}
					</button>
				</form>

				<div class="divider"><span>or</span></div>

				<button
					type="button"
					class="secondary"
					onclick={tryPasskey}
					disabled={stage === 'sending-code'}
				>
					Continue with passkey
				</button>

				<button
					type="button"
					class="secondary oauth-x"
					onclick={() => tryOAuth('twitter')}
					disabled={stage === 'sending-code'}
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
						/>
					</svg>
					<span>Continue with X</span>
				</button>
			{:else if stage === 'awaiting-code' || stage === 'submitting-code'}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						submitCode();
					}}
				>
					<p class="sent-to">Code sent to <strong>{email}</strong></p>
					<label class="label" for="code">6-digit code</label>
					<input
						id="code"
						type="text"
						inputmode="numeric"
						pattern="[0-9]*"
						maxlength="6"
						placeholder="123456"
						bind:value={code}
						autocomplete="one-time-code"
						required
						disabled={stage === 'submitting-code'}
					/>
					<button
						type="submit"
						class="primary"
						disabled={!code.trim() || stage === 'submitting-code'}
					>
						{stage === 'submitting-code' ? 'Verifying…' : 'Verify + continue'}
					</button>
					<button
						type="button"
						class="link"
						onclick={() => {
							code = '';
							stage = 'initial';
						}}
					>
						← Use a different email
					</button>
				</form>
			{:else if stage === 'passkey-pending'}
				<p class="status">Waiting for passkey…</p>
			{:else if stage === 'oauth-redirecting'}
				<p class="status">Redirecting to X…</p>
			{:else if stage === 'done'}
				<p class="status">Signed in.</p>
			{/if}

			{#if errorMsg}
				<div class="error">{errorMsg}</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(28, 25, 23, 0.4);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		padding: 16px;
	}
	.modal {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 16px;
		padding: 24px;
		width: 100%;
		max-width: 380px;
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.6) inset,
			0 24px 48px -16px rgba(28, 25, 23, 0.24);
	}
	.head {
		margin-bottom: 18px;
	}
	h2 {
		margin: 0 0 4px;
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--color-ink);
	}
	.sub {
		margin: 0;
		font-size: 12.5px;
		color: var(--color-muted);
		line-height: 1.4;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.label {
		font-size: 11px;
		color: var(--color-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 4px;
	}
	input {
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		border-radius: 10px;
		padding: 10px 12px;
		font-size: 14px;
		color: var(--color-ink);
		font-family: inherit;
	}
	input:focus {
		outline: 2px solid color-mix(in srgb, var(--color-ink) 18%, transparent);
		outline-offset: 0;
	}
	input:disabled {
		opacity: 0.5;
	}

	.primary {
		margin-top: 6px;
		background: var(--color-ink);
		color: var(--color-bg);
		border: none;
		padding: 10px 16px;
		border-radius: 10px;
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 120ms ease;
	}
	.primary:hover:not(:disabled) {
		opacity: 0.9;
	}
	.primary:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 16px 0;
		color: var(--color-muted);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--color-border);
	}

	.secondary {
		background: var(--color-bg);
		color: var(--color-ink);
		border: 1px solid var(--color-border);
		padding: 9px 16px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		width: 100%;
	}
	.secondary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-ink) 4%, var(--color-surface));
	}

	.oauth-x {
		margin-top: 8px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.oauth-x:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.sent-to {
		margin: 0 0 4px;
		font-size: 12.5px;
		color: var(--color-muted);
	}
	.sent-to strong {
		color: var(--color-ink);
	}

	.link {
		all: unset;
		cursor: pointer;
		font-size: 12px;
		color: var(--color-muted);
		text-align: center;
		margin-top: 6px;
	}
	.link:hover {
		color: var(--color-ink);
	}

	.status {
		font-size: 13px;
		color: var(--color-muted);
		text-align: center;
		margin: 8px 0;
	}

	.error {
		margin-top: 12px;
		padding: 8px 10px;
		font-size: 12px;
		color: var(--color-negative);
		background: color-mix(in srgb, var(--color-negative) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-negative) 28%, transparent);
		border-radius: 8px;
	}
</style>
