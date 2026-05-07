/**
 * Helius adapter — wallet token balances.
 *
 * Uses the v0 `addresses/{address}/balances` endpoint, which returns native
 * SOL (in lamports) plus all SPL token balances in a single call. Other
 * Helius capabilities (DAS API, parsed transactions, LaserStream) are out
 * of scope for this slice — the wallet preview only needs balances.
 *
 * Docs: https://docs.helius.dev — REST endpoints under `api.helius.xyz/v0`.
 */

import { HELIUS_API_KEY } from '$env/static/private';

const BASE = 'https://api.helius.xyz/v0';

export type RawTokenBalance = {
	mint: string;
	/** Raw on-chain amount before decimals are applied. */
	amount: number;
	decimals: number;
	tokenAccount: string;
};

export type WalletBalances = {
	address: string;
	/** Native SOL balance in lamports (1 SOL = 1_000_000_000 lamports). */
	nativeLamports: number;
	tokens: RawTokenBalance[];
};

type BalancesResponse = {
	nativeBalance: number;
	tokens: RawTokenBalance[];
};

/**
 * Fetch native SOL + SPL balances for a Solana address.
 *
 * Throws if the API key is missing or the request fails. Callers in
 * `+page.server.ts` are expected to catch and fall back to placeholder
 * data so the route still renders.
 */
export async function getWalletBalances(address: string): Promise<WalletBalances> {
	if (!HELIUS_API_KEY) {
		throw new Error('HELIUS_API_KEY is not set');
	}

	const url = `${BASE}/addresses/${address}/balances?api-key=${HELIUS_API_KEY}`;
	const res = await fetch(url, { headers: { accept: 'application/json' } });
	if (!res.ok) {
		throw new Error(`Helius balances ${res.status}: ${await res.text()}`);
	}

	const json = (await res.json()) as BalancesResponse;
	return {
		address,
		nativeLamports: json.nativeBalance ?? 0,
		tokens: json.tokens ?? []
	};
}

/** Convert lamports to a SOL amount (number, with full decimal precision). */
export const LAMPORTS_PER_SOL = 1_000_000_000;
export function lamportsToSol(lamports: number): number {
	return lamports / LAMPORTS_PER_SOL;
}

/** Convert a raw on-chain integer amount to a human-readable token amount. */
export function rawToToken(amount: number, decimals: number): number {
	return amount / 10 ** decimals;
}
