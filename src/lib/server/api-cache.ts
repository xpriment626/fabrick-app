/**
 * Generic TTL cache for upstream API responses.
 *
 * Wraps `public.api_cache` in Supabase: every entry is keyed by an
 * arbitrary string (caller decides — e.g. `'news:coindesk:SOL:home'`)
 * and stores an already-shaped JSON payload alongside its fetch time.
 * The TTL is applied at READ time so different call sites can demand
 * different freshness from the same key.
 *
 * Pattern:
 *
 *   const stories = await getOrFetch(
 *     'news:coindesk:SOL:home',
 *     15 * 60 * 1000,           // 15-minute freshness
 *     async () => mapToStories(await newsGetArticles({ category: 'SOL' }))
 *   );
 *
 * Behaviour:
 *  - Cache hit (fresh): returns cached payload, NO upstream call.
 *  - Cache hit (stale): calls fetcher, writes back, returns fresh.
 *    Synchronous — the caller waits. Stale-while-revalidate would
 *    require a queue and isn't worth the complexity at v0; we'll
 *    layer SWR HTTP headers on top once Fabrick deploys to a CDN.
 *  - Cache miss: same as stale.
 *  - Fetcher throws: if a stale row exists, returns it (degraded
 *    freshness is better than a broken page); otherwise rethrows so
 *    the caller's own try/catch can fall back to placeholder data.
 *
 * The service-role admin client is used unconditionally — `api_cache`
 * has RLS enabled with no policies, so a per-user client would be
 * rejected. That's intentional: this is shared infrastructure, not
 * user-scoped data.
 */

import { supabaseAdmin } from '$lib/server/supabase';

type CacheRow = {
	cache_key: string;
	payload: unknown;
	fetched_at: string; // ISO timestamptz
};

/**
 * Fetch via cache. The fetcher is only invoked when the cached row is
 * missing or older than `ttlMs`.
 */
export async function getOrFetch<T>(
	cacheKey: string,
	ttlMs: number,
	fetcher: () => Promise<T>
): Promise<T> {
	const existing = await readRow(cacheKey);

	if (existing && !isStale(existing, ttlMs)) {
		return existing.payload as T;
	}

	try {
		const fresh = await fetcher();
		await writeRow(cacheKey, fresh);
		return fresh;
	} catch (err) {
		if (existing) {
			console.warn(
				`[api-cache] fetcher failed for ${cacheKey}; serving stale (fetched ${existing.fetched_at}):`,
				err instanceof Error ? err.message : String(err)
			);
			return existing.payload as T;
		}
		throw err;
	}
}

async function readRow(cacheKey: string): Promise<CacheRow | null> {
	const { data, error: err } = await supabaseAdmin
		.from('api_cache')
		.select('cache_key, payload, fetched_at')
		.eq('cache_key', cacheKey)
		.maybeSingle();

	if (err) {
		console.warn(`[api-cache] read failed for ${cacheKey}:`, err.message);
		return null;
	}
	return (data as CacheRow | null) ?? null;
}

async function writeRow(cacheKey: string, payload: unknown): Promise<void> {
	const { error: err } = await supabaseAdmin
		.from('api_cache')
		.upsert(
			{
				cache_key: cacheKey,
				payload: payload as never,
				fetched_at: new Date().toISOString()
			},
			{ onConflict: 'cache_key' }
		);
	if (err) {
		// Non-fatal: cache write failure means next request also fetches,
		// but the current request still returns the fresh payload.
		console.warn(`[api-cache] write failed for ${cacheKey}:`, err.message);
	}
}

function isStale(row: CacheRow, ttlMs: number): boolean {
	const fetchedAt = Date.parse(row.fetched_at);
	if (!Number.isFinite(fetchedAt)) return true;
	return Date.now() - fetchedAt > ttlMs;
}
