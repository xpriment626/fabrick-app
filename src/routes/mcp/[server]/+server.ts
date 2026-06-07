import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => {
	throw error(410, 'Embedded research MCP servers are disabled in the USDC savings app.');
};

export const GET: RequestHandler = () => {
	throw error(410, 'Embedded research MCP servers are disabled in the USDC savings app.');
};
