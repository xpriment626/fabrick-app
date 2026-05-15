/**
 * Settings page loader.
 *
 * Shows the user whether they've set a BYOK OpenRouter API key (via
 * the `user_settings_public` view, which exposes `set: boolean` +
 * `set_at` without leaking the ciphertext). Encrypted bytes never
 * cross the network — RLS denies SELECT on the encrypted column even
 * to the row's owner.
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/');

	const { data, error: viewErr } = await supabaseAdmin
		.from('user_settings_public')
		.select('openrouter_api_key_set, openrouter_api_key_set_at, subscription_tier')
		.eq('user_id', locals.user.id)
		.maybeSingle();

	if (viewErr) {
		console.error('[settings] user_settings_public read failed:', viewErr.message);
	}

	return {
		keyStatus: {
			set: data?.openrouter_api_key_set ?? false,
			setAt: data?.openrouter_api_key_set_at ?? null,
			tier: data?.subscription_tier ?? 'free'
		}
	};
};
