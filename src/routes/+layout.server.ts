import type { LayoutServerLoad } from './$types';

/**
 * Root layout load. Threads the authenticated user (from
 * hooks.server.ts) into every page.
 *
 * Anonymous browsing is supported — the home page renders with public
 * Savings MCP market data, while wallet/account actions require sign-in.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		recents: []
	};
};
