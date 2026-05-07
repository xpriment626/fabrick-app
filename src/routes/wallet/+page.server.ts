/**
 * Wallet route loader.
 *
 * Same wallet snapshot as the home rail, just rendered at full fidelity in
 * the Tokens tab. Falls back to placeholder data when the Helius / Jupiter
 * combo is unreachable so the route always renders.
 *
 * The DeFi / NFTs / Activity tabs stay "Coming soon" until the
 * `onchain-researcher` agent goes live in build-order step 4 and starts
 * answering position queries via TopLedger's MCP server.
 */

import { loadWalletSnapshot } from '$lib/server/wallet';
import { SAMPLE_WALLET_ADDRESS } from '$lib/server/tokens';
import {
	walletSnapshot as fallbackWallet,
	type WalletSnapshot
} from '$lib/placeholder-data';

export const load = async (): Promise<{ walletSnapshot: WalletSnapshot }> => {
	try {
		const walletSnapshot = await loadWalletSnapshot(SAMPLE_WALLET_ADDRESS);
		return { walletSnapshot };
	} catch (err) {
		console.warn('[wallet] snapshot fell back to placeholder:', err);
		return { walletSnapshot: fallbackWallet };
	}
};
