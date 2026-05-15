<!--
	Ambient chat bar — fixed at the bottom of the viewport, persistent
	across every route via the layout. Glass-like (light translucent over
	a backdrop blur) so the content behind shows through diffused.

	Submits to /api/chat (creates a chat with the typed text as the first
	user turn), then navigates to /chat/{slug}?autosend=1 where the chat
	page picks up the seeded message and triggers the model streaming.

	Anonymous users see a "Sign in to chat" CTA instead — clicking
	opens the login modal. After auth the page reloads, the bar
	switches to live mode.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import LoginModal from './LoginModal.svelte';

	let value = $state('');
	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);
	let loginOpen = $state(false);

	const authed = $derived(Boolean(page.data.user));

	async function submit() {
		if (!authed) {
			loginOpen = true;
			return;
		}
		const q = value.trim();
		if (!q || submitting) return;
		submitting = true;
		errorMsg = null;
		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: q })
			});
			if (!res.ok) {
				const body = await res.text().catch(() => '');
				throw new Error(`${res.status} ${body || res.statusText}`);
			}
			const data = (await res.json()) as { slug: string };
			value = '';
			await goto(`/chat/${encodeURIComponent(data.slug)}?autosend=1`);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			submitting = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void submit();
		}
	}
</script>

<LoginModal bind:open={loginOpen} onClose={() => (loginOpen = false)} />

<div class="ambient-bar" aria-hidden="false">
	{#if errorMsg}
		<div class="ambient-error" role="alert">
			{errorMsg}
		</div>
	{/if}
	<div class="ambient-pill" class:submitting>
		<svg
			class="leading-icon"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M12 3v3" />
			<path d="M12 18v3" />
			<path d="M3 12h3" />
			<path d="M18 12h3" />
			<path d="m5.6 5.6 2.1 2.1" />
			<path d="m16.3 16.3 2.1 2.1" />
			<path d="m5.6 18.4 2.1-2.1" />
			<path d="m16.3 7.7 2.1-2.1" />
		</svg>

		<input
			bind:value
			type="text"
			placeholder={!authed
				? 'Sign in to ask Fabrick anything…'
				: submitting
					? 'Spinning up the fleet…'
					: 'Ask Fabrick anything…'}
			aria-label="Ambient chat input"
			disabled={submitting || !authed}
			onkeydown={onKeydown}
			onclick={() => {
				if (!authed) loginOpen = true;
			}}
		/>

		<button
			type="button"
			class="send-btn"
			aria-label={authed ? 'Send' : 'Sign in'}
			disabled={authed && (!value.trim() || submitting)}
			onclick={submit}
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
				aria-hidden="true"
			>
				<path d="M5 12h14" />
				<path d="m13 6 6 6-6 6" />
			</svg>
		</button>
	</div>
</div>

<style>
	.ambient-bar {
		position: fixed;
		bottom: 24px;
		/* Center within the main content area, accounting for the
		   sidebar width set by the Sidebar component on <html>. The
		   left/transform pair shifts the centerline right by half the
		   sidebar width. */
		left: calc(50% + var(--sidebar-w, 60px) / 2);
		transform: translateX(-50%);
		width: min(680px, calc(100% - var(--sidebar-w, 60px) - 32px));
		z-index: 40;
		pointer-events: auto;
		transition:
			left 180ms ease,
			width 180ms ease;
	}

	.ambient-pill {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 56px;
		padding: 0 6px 0 18px;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--color-surface) 68%, transparent);
		backdrop-filter: blur(20px) saturate(140%);
		-webkit-backdrop-filter: blur(20px) saturate(140%);
		border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.55) inset,
			0 12px 30px -12px rgba(28, 25, 23, 0.12),
			0 2px 6px -2px rgba(28, 25, 23, 0.06);
		transition: opacity 0.2s ease;
	}

	.ambient-pill.submitting {
		opacity: 0.7;
	}

	.ambient-error {
		margin-bottom: 8px;
		padding: 8px 14px;
		border-radius: 10px;
		background: color-mix(in srgb, #dc2626 14%, var(--color-surface));
		border: 1px solid color-mix(in srgb, #dc2626 30%, transparent);
		color: #b91c1c;
		font-size: 13px;
		font-weight: 500;
	}

	.leading-icon {
		color: var(--color-muted);
		flex-shrink: 0;
		opacity: 0.85;
	}

	input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		font-family: inherit;
		font-size: 14px;
		font-weight: 500;
		color: var(--color-ink);
		letter-spacing: -0.005em;
	}

	input::placeholder {
		color: color-mix(in srgb, var(--color-muted) 90%, transparent);
		font-weight: 500;
	}

	.send-btn {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border: none;
		border-radius: var(--radius-pill);
		background: var(--color-ink);
		color: var(--color-bg);
		cursor: pointer;
		transition:
			opacity 0.15s ease,
			transform 0.15s ease;
	}

	.send-btn:disabled {
		background: color-mix(in srgb, var(--color-muted) 30%, transparent);
		color: color-mix(in srgb, var(--color-ink) 50%, transparent);
		cursor: default;
	}

	.send-btn:not(:disabled):hover {
		opacity: 0.92;
	}

	.send-btn:not(:disabled):active {
		transform: scale(0.97);
	}
</style>
