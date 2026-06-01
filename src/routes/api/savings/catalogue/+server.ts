/**
 * GET /api/savings/catalogue — the fund-independent savings opportunity catalogue
 * (design.md §20, Slice 1).
 *
 * Public on purpose: this is market data, not user data. A logged-out or
 * zero-balance user can browse opportunities + risk synthesis without committing
 * any funds — the product's front door. Cached server-side (~daily-refresh knob).
 *
 * Response: SavingsCatalogue { defaults, lend, earn, multiply, counts, generatedAt }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSavingsCatalogue } from '$lib/server/kamino/catalogue';

export const GET: RequestHandler = async ({ url }) => {
	const force = url.searchParams.get('refresh') === '1';
	try {
		const catalogue = await getSavingsCatalogue(force);
		// No browser caching — the server-side cache (10min TTL) already prevents
		// hammering Kamino, and this keeps the client on fresh server data.
		return json(catalogue, { headers: { 'cache-control': 'no-store' } });
	} catch (err) {
		console.warn('[savings/catalogue] build failed:', err);
		throw error(502, 'catalogue build failed');
	}
};
