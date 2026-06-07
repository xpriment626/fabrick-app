import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	throw error(410, 'Research memory dismissal is disabled in the USDC savings app.');
};
