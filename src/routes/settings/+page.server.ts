import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/');

	return {
		account: {
			id: locals.user.id,
			email: locals.user.email,
			displayName: locals.user.displayName,
			solanaAddress: locals.user.solanaAddress
		}
	};
};
