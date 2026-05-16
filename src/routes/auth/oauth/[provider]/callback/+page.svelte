<!--
	OAuth redirect landing page.

	Privy's `js-sdk-core` (vanilla, framework-agnostic) doesn't bundle the
	redirect-handling that the React SDK's `useLoginWithOAuth` hook does
	implicitly. We orchestrate it ourselves:

	  1. LoginModal "Continue with X" → privy.auth.oauth.generateURL(...)
	     → window.location.href = url   (full-page redirect to provider via
	     Privy's hosted OAuth intermediary)
	  2. Privy hands off to the provider, the provider sends the user back
	     to Privy, Privy redirects to this page with:
	       /auth/oauth/[provider]/callback?privy_oauth_state=…&privy_oauth_code=…
	     (NOT the bare OAuth `code` + `state` — Privy's own intermediary
	     handles the provider-side exchange, then forwards Privy-namespaced
	     params to us.)
	  3. This page reads privy_oauth_code + privy_oauth_state from the URL
	  4. privy.auth.oauth.loginWithCode(code, state, provider) → Privy session
	  5. exchangeForFabrickSession(privy) → fabrick-session cookie
	  6. goto('/') to return the user home

	The route is keyed on `[provider]` so adding Google / Apple / Discord
	later is a button-and-config change, not new infrastructure.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { getPrivy, exchangeForFabrickSession } from '$lib/client/privy';
	import type { OAuthProviderID } from '@privy-io/js-sdk-core';

	type Status = 'pending' | 'success' | 'error';
	let status = $state<Status>('pending');
	let errorMsg = $state<string | null>(null);

	const provider = $derived(page.params.provider as OAuthProviderID);

	onMount(async () => {
		try {
			// Provider can short-circuit the flow with ?error= if the
			// user denied consent or something else went wrong upstream.
			const oauthError = page.url.searchParams.get('error');
			if (oauthError) {
				throw new Error(
					page.url.searchParams.get('error_description') ?? oauthError
				);
			}

			// Privy's hosted intermediary forwards Privy-namespaced params
			// after exchanging with the upstream provider — NOT the raw
			// OAuth code/state. Read those.
			const code = page.url.searchParams.get('privy_oauth_code');
			const state = page.url.searchParams.get('privy_oauth_state');
			if (!code || !state) {
				throw new Error(
					'Auth session oauth returned invalid credentials (missing privy_oauth_code or privy_oauth_state)'
				);
			}

			const privy = await getPrivy();
			await privy.auth.oauth.loginWithCode(code, state, provider);
			await exchangeForFabrickSession(privy);
			status = 'success';

			// Refresh SSR data so the layout picks up the new session
			// before we navigate.
			await invalidateAll();
			await goto('/');
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			status = 'error';
		}
	});

	function backToHome() {
		void goto('/');
	}
</script>

<main class="wrap">
	<div class="card">
		{#if status === 'pending'}
			<div class="spinner" aria-hidden="true"></div>
			<h1>Signing you in…</h1>
			<p>Hang tight while we finish the {provider} handshake.</p>
		{:else if status === 'error'}
			<h1>Sign-in failed</h1>
			<p>{errorMsg ?? 'Unknown error.'}</p>
			<button type="button" class="primary" onclick={backToHome}>Back to Fabrick</button>
		{:else}
			<h1>Signed in.</h1>
			<p>Redirecting…</p>
		{/if}
	</div>
</main>

<style>
	.wrap {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}
	.card {
		max-width: 380px;
		width: 100%;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 16px;
		padding: 32px;
		text-align: center;
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.55) inset,
			0 24px 48px -16px rgba(28, 25, 23, 0.18);
	}
	h1 {
		margin: 14px 0 6px;
		font-size: 17px;
		font-weight: 700;
		color: var(--color-ink);
		letter-spacing: -0.01em;
	}
	p {
		margin: 0;
		font-size: 13px;
		color: var(--color-muted);
		line-height: 1.5;
	}
	.spinner {
		width: 28px;
		height: 28px;
		margin: 0 auto;
		border-radius: 50%;
		border: 2.5px solid color-mix(in srgb, var(--color-ink) 14%, transparent);
		border-top-color: var(--color-ink);
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.primary {
		margin-top: 18px;
		background: var(--color-ink);
		color: var(--color-bg);
		border: none;
		padding: 10px 18px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.primary:hover {
		opacity: 0.9;
	}
</style>
