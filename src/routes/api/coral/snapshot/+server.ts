import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	throw error(410, 'Coral research snapshots are disabled in the USDC savings app.');
};
