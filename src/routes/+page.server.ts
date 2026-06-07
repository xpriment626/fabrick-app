/**
 * Home route loader.
 *
 * Public USDC savings catalogue + wallet preview. Market data comes from
 * Savings MCP; wallet/user state stays in Fabrick.
 */

import { getSavingsCatalogue } from '$lib/server/savings-mcp';
import { loadWalletSnapshot } from '$lib/server/wallet';
import {
	walletSnapshot as fallbackWallet,
	type WalletSnapshot
} from '$lib/placeholder-data';
import type { SavingsCatalogue } from '$lib/savings/types';

export const load = async ({ locals }) => {
	const [catalogueResult, walletSnapshot] = await Promise.all([
		loadCatalogue(),
		loadWalletPreview(locals.user?.solanaAddress ?? null)
	]);

	return {
		catalogue: catalogueResult.catalogue,
		catalogueError: catalogueResult.error,
		walletSnapshot
	};
};

async function loadCatalogue(): Promise<{ catalogue: SavingsCatalogue | null; error: string | null }> {
	try {
		return { catalogue: await getSavingsCatalogue(), error: null };
	} catch (err) {
		console.warn('[home] Savings MCP catalogue failed:', err);
		return {
			catalogue: null,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}

async function loadWalletPreview(address: string | null): Promise<WalletSnapshot> {
	if (!address) return fallbackWallet;
	try {
		return await loadWalletSnapshot(address);
	} catch (err) {
		console.warn('[home] wallet preview fell back to placeholder:', err);
		return fallbackWallet;
	}
}
