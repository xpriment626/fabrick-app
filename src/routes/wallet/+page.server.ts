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
import type { PageServerLoad } from './$types';
import { loadWalletSnapshot } from '$lib/server/wallet';
import {
	walletSnapshot as fallbackWallet,
	type WalletSnapshot
} from '$lib/placeholder-data';

export const load: PageServerLoad = async ({
	locals
}): Promise<{ walletSnapshot: WalletSnapshot }> => {
	if (!locals.user) throw redirect(302, '/');
	const address = locals.user.solanaAddress;
	if (!address) return { walletSnapshot: fallbackWallet };
	try {
		const walletSnapshot = await loadWalletSnapshot(address);
		return { walletSnapshot };
	} catch (err) {
		console.warn('[wallet] snapshot fell back to placeholder:', err);
		return { walletSnapshot: fallbackWallet };
	}
};
