<!--
	Agent-signing enablement (design.md §18) — the wallet-page "enable" flow,
	modeled on the "enable trading" opt-in pattern (Hyperliquid et al.).

	Our Privy app uses TEE execution; the correct primitive is SESSION SIGNERS
	(addSessionSigners), client-side. It needs Privy's embedded-wallet iframe —
	which getPrivy() now mounts for us via ensureEmbeddedWalletProxy (the
	vanilla-JS recipe), fixing the earlier "proxy not initialized" error.

	Flow (js-sdk-core, imperative — no React, no server round-trip):
	  1. privy = getPrivy()  → await ensureEmbeddedWalletProxy(privy)  (iframe ready)
	  2. privy.user.get() → getUserEmbeddedSolanaWallet(user)
	  3. addSessionSigners({client, wallet, signers:[{signer_id, override_policy_ids}]})

	Needs a real client Privy session — run the app with DEV_AUTH_PRIVY_DID
	unset/blank and sign in normally. The dev bypass gives no client session.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { getPrivy, ensureEmbeddedWalletProxy } from '$lib/client/privy';
	import { addSessionSigners, getUserEmbeddedSolanaWallet } from '@privy-io/js-sdk-core';

	type Props = { authKeyId: string | null; policyId: string | null };
	let { authKeyId, policyId }: Props = $props();

	type Phase = 'loading' | 'ready' | 'enabling' | 'enabled' | 'error' | 'no-session';

	const configured = $derived(Boolean(authKeyId && policyId));

	let phase = $state<Phase>('loading');
	let walletAddr = $state<string | null>(null);
	let errorMsg = $state<string | null>(null);

	onMount(() => {
		void inspect();
	});

	/** Resolve the client session's embedded Solana wallet + its enabled state.
	 *  `wallet.delegated` flips true once a session signer is provisioned
	 *  (verified server-side: the wallet carrying our signer reports
	 *  delegated=true). Fabrick only ever adds its own signer, so delegated ===
	 *  "agent signing enabled" — no backend call needed. (If we ever need to
	 *  confirm the SPECIFIC signer+policy, check the wallet's additional_signers
	 *  server-side instead.) */
	async function inspect() {
		try {
			const privy = await getPrivy();
			const { user } = await privy.user.get();
			const wallet = getUserEmbeddedSolanaWallet(user);
			if (!wallet) {
				phase = 'no-session';
				return;
			}
			walletAddr = wallet.address;
			phase = wallet.delegated ? 'enabled' : 'ready';
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			phase = 'error';
		}
	}

	async function enable() {
		if (phase === 'enabling' || !configured) return;
		phase = 'enabling';
		errorMsg = null;
		try {
			const privy = await getPrivy();
			const { user } = await privy.user.get();
			const wallet = getUserEmbeddedSolanaWallet(user);
			if (!wallet) {
				phase = 'no-session';
				return;
			}
			walletAddr = wallet.address;

			// Ensure the embedded-wallet iframe (secure context) is mounted +
			// ready before transacting — fixes "proxy not initialized".
			await ensureEmbeddedWalletProxy(privy);

			// Provision Fabrick's authorization key as a policy-scoped session
			// signer on the TEE wallet (client-side, via the iframe).
			await addSessionSigners({
				client: privy,
				wallet,
				signers: [{ signer_id: authKeyId!, override_policy_ids: [policyId!] }]
			});

			phase = 'enabled';
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			phase = 'error';
		}
	}
</script>

<section class="rounded-card border border-border bg-surface p-6">
	<div class="mb-2 flex items-center gap-2">
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="text-positive"
		>
			<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
		</svg>
		<h3 class="text-[17px] font-bold text-ink">Agent signing</h3>
		{#if phase === 'enabled'}
			<span
				class="ml-auto rounded-full bg-positive/12 px-2.5 py-0.5 text-[11px] font-semibold text-positive"
			>
				Enabled
			</span>
		{/if}
	</div>

	<p class="mb-4 text-[13px] leading-relaxed text-muted">
		Let Fabrick rebalance USDC savings within a strict on-chain policy. Allocation context comes
		from Savings MCP; signing stays scoped to your embedded wallet.
	</p>

	{#if !configured}
		<p class="text-[12.5px] text-negative">
			Not configured — set <code>PRIVY_AUTHORIZATION_KEY_ID</code> and
			<code>PRIVY_TEST_POLICY_ID</code> in <code>.env</code>.
		</p>
	{:else if phase === 'loading'}
		<p class="text-[12.5px] text-muted">Checking wallet…</p>
	{:else if phase === 'no-session'}
		<p class="text-[12.5px] text-muted">
			No wallet session. Run <code>npm run dev</code> with <code>DEV_AUTH_PRIVY_DID</code> unset
			and sign in for real.
		</p>
	{:else if phase === 'enabled'}
		<div class="flex items-center justify-between gap-3">
			<span class="text-[12.5px] text-muted">
				{#if walletAddr}Active on {walletAddr.slice(0, 4)}…{walletAddr.slice(-4)}{/if}
			</span>
			<span class="text-[12px] text-muted">Revoke — coming soon</span>
		</div>
	{:else}
		<div class="flex items-center gap-3">
			<button
				type="button"
				onclick={enable}
				disabled={phase === 'enabling'}
				class="rounded-[10px] bg-ink px-4 py-2 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{phase === 'enabling' ? 'Enabling…' : 'Enable agent signing'}
			</button>
			{#if walletAddr}
				<span class="text-[12px] text-muted">{walletAddr.slice(0, 4)}…{walletAddr.slice(-4)}</span>
			{/if}
		</div>
	{/if}

	{#if errorMsg}
		<p class="mt-3 text-[12px] text-negative">{errorMsg}</p>
	{/if}
</section>
