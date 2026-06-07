import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => {
	throw error(410, 'Research fleet dispatch is disabled in the USDC savings app.');
};
