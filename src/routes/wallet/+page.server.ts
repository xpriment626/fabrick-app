/**
 * Wallet route loader.
 *
 * Reads the authed user's Privy embedded Solana wallet snapshot. If
 * the user is unauthenticated, redirect to the home page (which has
 * the sign-in entry point). If they're authed but the wallet hasn't
 * been provisioned yet (rare — Privy auto-creates on first sign-in),
 * fall back to the placeholder so the page still renders.
 *
 * The DeFi / NFTs / Activity tabs stay "Coming soon" until the
 * `onchain-researcher` agent goes live in build-order step 4 and starts
 * answering position queries via TopLedger's MCP server.
 */

import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';
import { loadWalletSnapshot } from '$lib/server/wallet';
import { listSavingsAccounts } from '$lib/server/savings-accounts';
import {
	walletSnapshot as fallbackWallet,
	type WalletSnapshot
} from '$lib/placeholder-data';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/');

	// Savings accounts drive the §20 create-account gate (no account → create CTA;
	// junior → catalogue view; senior → proposed-allocation card). Survives reload.
	let savingsAccounts: Awaited<ReturnType<typeof listSavingsAccounts>> = [];
	try {
		savingsAccounts = await listSavingsAccounts(locals.user.id);
	} catch (err) {
		console.warn('[wallet] savings accounts load failed:', err);
	}

	// Agent-signing enablement config (§18 Phase A). Non-secret identifiers:
	// the authorization-key id Fabrick's server signs with + the wallet policy
	// that bounds it. The authorization PRIVATE key never leaves the server.
	// The card renders its "enable" affordance only when both are configured.
	const agentSigning = {
		authKeyId: env.PRIVY_AUTHORIZATION_KEY_ID ?? null,
		policyId: env.PRIVY_TEST_POLICY_ID ?? null
	};

	const address = locals.user.solanaAddress;
	if (!address) {
		return { walletSnapshot: fallbackWallet as WalletSnapshot, agentSigning, savingsAccounts };
	}
	try {
		const walletSnapshot = await loadWalletSnapshot(address);
		return { walletSnapshot, agentSigning, savingsAccounts };
	} catch (err) {
		console.warn('[wallet] snapshot fell back to placeholder:', err);
		return { walletSnapshot: fallbackWallet as WalletSnapshot, agentSigning, savingsAccounts };
	}
};
