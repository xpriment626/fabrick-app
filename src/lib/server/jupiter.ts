/**
 * Jupiter adapter — Price V3 + Token V2 metadata search.
 *
 * Phantom and Solflare both source SOL-ecosystem prices from Jupiter, so
 * agreeing with their canonical shows consistency for the user. The lite
 * endpoint is keyless and rate-limited at 60 rpm; supplying a portal API
 * key promotes us to higher tiers and the authed host.
 *
 * Free tier: https://lite-api.jup.ag/price/v3
 * Portal tier: https://api.jup.ag/price/v3 (with x-api-key header)
 *
 * Docs: https://dev.jup.ag/docs/price-api/v3
 */

import { JUPITER_API_KEY } from '$env/static/private';

const LITE_BASE = 'https://lite-api.jup.ag/price/v3';
const PRO_BASE = 'https://api.jup.ag/price/v3';
const TOKEN_SEARCH_LITE = 'https://lite-api.jup.ag/tokens/v2/search';
const TOKEN_SEARCH_PRO = 'https://api.jup.ag/tokens/v2/search';

export type TokenPrice = {
	mint: string;
	usdPrice: number;
	/** Already expressed as a percent, e.g. -0.58 means -0.58%. */
	priceChange24h: number;
	decimals: number;
};

type JupiterPriceResponse = Record<
	string,
	{
		usdPrice: number;
		priceChange24h: number;
		decimals: number;
		blockId?: number;
		liquidity?: number;
		createdAt?: string;
	}
>;

/**
 * Fetch USD prices + 24h change for one or more SPL token mints.
 *
 * Jupiter caps the v3 endpoint at 50 mints per call. v0 only ever asks for
 * a handful (market tile + wallet tokens, deduped) so we don't bother
 * batching here — fail loudly if the cap is ever exceeded.
 */
export async function getTokenPrices(mints: readonly string[]): Promise<Map<string, TokenPrice>> {
	if (mints.length === 0) return new Map();
	if (mints.length > 50) {
		throw new Error(`getTokenPrices: 50 mint cap exceeded (${mints.length} requested)`);
	}

	const usePro = JUPITER_API_KEY && JUPITER_API_KEY.length > 0;
	const url = `${usePro ? PRO_BASE : LITE_BASE}?ids=${mints.join(',')}`;
	const headers: Record<string, string> = { accept: 'application/json' };
	if (usePro) headers['x-api-key'] = JUPITER_API_KEY;

	const res = await fetch(url, { headers });
	if (!res.ok) {
		throw new Error(`Jupiter Price V3 ${res.status}: ${await res.text()}`);
	}

	const json = (await res.json()) as JupiterPriceResponse;
	const out = new Map<string, TokenPrice>();
	for (const [mint, entry] of Object.entries(json)) {
		// Jupiter occasionally returns entries with `null` for unpriceable
		// tokens; treat those as missing rather than as $0.
		if (entry.usdPrice == null) continue;
		out.set(mint, {
			mint,
			usdPrice: entry.usdPrice,
			priceChange24h: entry.priceChange24h ?? 0,
			decimals: entry.decimals
		});
	}
	return out;
}

export type TokenSearchMeta = {
	mint: string;
	symbol: string;
	name: string;
	decimals: number;
	icon?: string;
};

type JupiterTokenSearchEntry = {
	id: string;
	symbol: string;
	name: string;
	decimals: number;
	icon?: string;
};

/**
 * Look up display metadata (symbol, name, icon, decimals) for one or more
 * mints via the Jupiter token V2 search endpoint. Used to enrich SPL
 * tokens that aren't in our local registry so the wallet route can render
 * any address gracefully.
 *
 * Accepts comma-separated mints in a single request (verified — the
 * endpoint handles batched lookups). Mints Jupiter doesn't recognize are
 * silently dropped.
 */
export async function searchTokenMetadata(
	mints: readonly string[]
): Promise<Map<string, TokenSearchMeta>> {
	if (mints.length === 0) return new Map();

	const usePro = JUPITER_API_KEY && JUPITER_API_KEY.length > 0;
	const url = `${usePro ? TOKEN_SEARCH_PRO : TOKEN_SEARCH_LITE}?query=${mints.join(',')}`;
	const headers: Record<string, string> = { accept: 'application/json' };
	if (usePro) headers['x-api-key'] = JUPITER_API_KEY;

	const res = await fetch(url, { headers });
	if (!res.ok) {
		throw new Error(`Jupiter token search ${res.status}: ${await res.text()}`);
	}

	const arr = (await res.json()) as JupiterTokenSearchEntry[];
	const out = new Map<string, TokenSearchMeta>();
	for (const entry of arr) {
		out.set(entry.id, {
			mint: entry.id,
			symbol: entry.symbol,
			name: entry.name,
			decimals: entry.decimals,
			icon: entry.icon
		});
	}
	return out;
}
