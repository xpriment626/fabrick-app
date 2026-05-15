// See https://svelte.dev/docs/kit/types#app for information about these interfaces

import type { AuthedUser } from '$lib/server/auth';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/**
			 * The authenticated user for the current request, populated by
			 * hooks.server.ts from the `fabrick-session` cookie. `null` when
			 * the request has no valid session.
			 */
			user: AuthedUser | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
