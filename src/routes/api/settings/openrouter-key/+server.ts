import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => {
	throw error(410, 'OpenRouter BYOK is disabled in the USDC savings app.');
};

export const DELETE: RequestHandler = () => {
	throw error(410, 'OpenRouter BYOK is disabled in the USDC savings app.');
};
