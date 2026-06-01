/**
 * Devnet balance adapter — for the wallet page's Mainnet/Devnet toggle (§18).
 *
 * The mainnet snapshot (lib/server/wallet.ts) goes through Helius's v0 REST
 * `balances` endpoint, which is mainnet-only. Devnet has no equivalent REST
 * surface, so we hit the devnet JSON-RPC directly: `getBalance` for native SOL
 * + `getTokenAccountsByOwner` for SPL holdings (the devnet USDC the Kamino
 * slice will use shows up here once airdropped/minted).
 *
 * Devnet SOL has no USD price (it's valueless test SOL), so unlike the mainnet
 * snapshot this returns raw amounts only — the UI presents SOL, not dollars.
 *
 * Uses the Helius devnet RPC when a key is present (reliable, higher limits),
 * falling back to the public devnet endpoint. Key stays server-side.
 */

import { HELIUS_API_KEY } from '$env/static/private';

const DEVNET_RPC = HELIUS_API_KEY
	? `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
	: 'https://api.devnet.solana.com';

/** SPL Token program (classic). Token-2022 is out of scope for the devnet view. */
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const LAMPORTS_PER_SOL = 1_000_000_000;

export type DevnetToken = {
	mint: string;
	/** Human-readable amount (decimals already applied). */
	uiAmount: number;
	decimals: number;
};

export type DevnetBalance = {
	address: string;
	lamports: number;
	sol: number;
	tokens: DevnetToken[];
};

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
	const res = await fetch(DEVNET_RPC, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
	});
	if (!res.ok) {
		throw new Error(`devnet rpc ${method} ${res.status}: ${await res.text()}`);
	}
	const json = (await res.json()) as { result?: T; error?: { message: string } };
	if (json.error) throw new Error(`devnet rpc ${method}: ${json.error.message}`);
	return json.result as T;
}

type ParsedTokenAccount = {
	account?: {
		data?: { parsed?: { info?: { mint?: string; tokenAmount?: { uiAmount?: number; decimals?: number; amount?: string } } } };
	};
};

/** Native SOL + non-zero SPL balances for an address on devnet. */
export async function getDevnetBalance(address: string): Promise<DevnetBalance> {
	const [bal, accts] = await Promise.all([
		rpc<{ value: number }>('getBalance', [address]),
		rpc<{ value: ParsedTokenAccount[] }>('getTokenAccountsByOwner', [
			address,
			{ programId: TOKEN_PROGRAM_ID },
			{ encoding: 'jsonParsed' }
		])
	]);

	const lamports = bal.value ?? 0;
	const tokens: DevnetToken[] = (accts.value ?? [])
		.map((acc) => {
			const info = acc.account?.data?.parsed?.info;
			const ta = info?.tokenAmount;
			return {
				mint: info?.mint ?? '',
				uiAmount: Number(ta?.uiAmount ?? 0),
				decimals: Number(ta?.decimals ?? 0)
			};
		})
		.filter((t) => t.mint && t.uiAmount > 0);

	return { address, lamports, sol: lamports / LAMPORTS_PER_SOL, tokens };
}
