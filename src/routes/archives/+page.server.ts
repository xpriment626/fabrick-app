/**
 * Legacy redirect. The Fleet Archives surface graduated to the Fleet
 * control panel at `/fleet` (design.md §17). Keep this stub so old links,
 * bookmarks, and the prior nav target resolve.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	throw redirect(308, '/fleet');
};
