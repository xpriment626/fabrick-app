/**
 * GET /api/wallet/devnet — native SOL + SPL balances for the authed user's
 * wallet on devnet (§18 wallet-page cluster toggle).
 *
 * Lazy companion to the SSR mainnet snapshot: the wallet page only calls this
 * when the user flips the toggle to Devnet, so the common (mainnet) load path
 * pays nothing. Same Privy embedded wallet, different cluster — the address is
 * identical across clusters.
 *
 * Response: DevnetBalance { address, lamports, sol, tokens[] }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDevnetBalance } from '$lib/server/devnet-balance';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'sign in required');

	const address = locals.user.solanaAddress;
	if (!address) throw error(400, 'no wallet provisioned');

	try {
		return json(await getDevnetBalance(address));
	} catch (err) {
		console.warn('[wallet/devnet] balance fetch failed:', err);
		throw error(502, 'devnet balance fetch failed');
	}
};
