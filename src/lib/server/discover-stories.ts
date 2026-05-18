/**
 * Story resolution for `/discover/[slug]`.
 *
 * A "story" today = one CoinDesk article. The slug is the 22-char
 * base64url hash of its URL (see `news-to-stories.ts:storyId`). Future
 * stories will be Fabrick-synthesized — same slug shape, different
 * payload provenance.
 *
 * Resolution flow on a /discover/[slug] visit:
 *
 *   1. Look up `discover:story:{slug}` in api_cache (7-day TTL).
 *      - Fresh: return directly.
 *      - Stale: still has the source URL — re-scrape via Firecrawl and
 *        refresh the row.
 *   2. No row: scan the home `news:coindesk:SOL:home` cache for the
 *      article matching the slug. If found, extract URL, scrape the
 *      full body via Firecrawl, persist under `discover:story:{slug}`.
 *   3. Still no source: return null → 404.
 *
 * Firecrawl gracefully degrades: if FIRECRAWL_API_KEY isn't set OR the
 * scrape fails, we fall back to the CoinDesk snippet as the body. The
 * page still renders; chat-with-story is just shallower.
 */

import { supabaseAdmin } from '$lib/server/supabase';
import { scrapeMarkdown, FirecrawlConfigError } from '$lib/server/firecrawl';
import type { ResearchStory } from '$lib/placeholder-data';

const STORY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const HOME_NEWS_CACHE_KEY = 'news:coindesk:SOL:home:v2';

/**
 * Resolved story payload — story metadata plus the rendered body.
 * Persisted in api_cache under `discover:story:{slug}`.
 */
export type DiscoverStory = {
	slug: string;
	story: ResearchStory;
	/** Original upstream article URL (canonical link). */
	sourceUrl: string;
	/** Best-effort full article body in markdown. Falls back to snippet. */
	body: string;
	/** Where the body came from — affects how confidently we render. */
	bodySource: 'firecrawl' | 'snippet';
	/** ISO timestamp when this row was scraped. */
	fetchedAt: string;
};

function storyCacheKey(slug: string): string {
	return `discover:story:${slug}`;
}

function isStale(fetchedAt: string, ttlMs: number): boolean {
	const t = Date.parse(fetchedAt);
	if (!Number.isFinite(t)) return true;
	return Date.now() - t > ttlMs;
}

async function readStoryRow(slug: string): Promise<DiscoverStory | null> {
	const { data, error: err } = await supabaseAdmin
		.from('api_cache')
		.select('payload, fetched_at')
		.eq('cache_key', storyCacheKey(slug))
		.maybeSingle();
	if (err) {
		console.warn(`[discover] read failed for ${slug}:`, err.message);
		return null;
	}
	if (!data) return null;
	return data.payload as DiscoverStory;
}

async function writeStoryRow(story: DiscoverStory): Promise<void> {
	const { error: err } = await supabaseAdmin.from('api_cache').upsert(
		{
			cache_key: storyCacheKey(story.slug),
			payload: story as never,
			fetched_at: story.fetchedAt
		},
		{ onConflict: 'cache_key' }
	);
	if (err) console.warn(`[discover] write failed for ${story.slug}:`, err.message);
}

/** Find a story in the home news cache by slug. Used when no discover row exists yet. */
async function findStoryInHomeCache(slug: string): Promise<ResearchStory | null> {
	const { data } = await supabaseAdmin
		.from('api_cache')
		.select('payload')
		.eq('cache_key', HOME_NEWS_CACHE_KEY)
		.maybeSingle();
	if (!data) return null;
	const stories = data.payload as ResearchStory[];
	return stories.find((s) => s.id === slug) ?? null;
}

/**
 * Build a fresh DiscoverStory from a known ResearchStory + URL. Tries
 * Firecrawl first; degrades to the story snippet on missing key or
 * scrape failure.
 */
async function buildStory(
	slug: string,
	story: ResearchStory,
	sourceUrl: string
): Promise<DiscoverStory> {
	let body = story.excerpt ?? '';
	let bodySource: DiscoverStory['bodySource'] = 'snippet';

	try {
		const scraped = await scrapeMarkdown(sourceUrl);
		body = scraped.markdown;
		bodySource = 'firecrawl';
	} catch (err) {
		if (err instanceof FirecrawlConfigError) {
			console.info(`[discover] FIRECRAWL_API_KEY not set — using snippet body for ${slug}`);
		} else {
			console.warn(
				`[discover] firecrawl scrape failed for ${slug}; falling back to snippet:`,
				err instanceof Error ? err.message : String(err)
			);
		}
	}

	return {
		slug,
		story,
		sourceUrl,
		body,
		bodySource,
		fetchedAt: new Date().toISOString()
	};
}

/**
 * Resolve a story by slug. Returns null if neither the discover cache
 * nor the home news cache knows about it (→ 404).
 */
export async function resolveStory(slug: string): Promise<DiscoverStory | null> {
	const cached = await readStoryRow(slug);

	// Fresh row — done.
	if (cached && !isStale(cached.fetchedAt, STORY_TTL_MS)) {
		return cached;
	}

	// Stale row — refresh via re-scrape of the known URL.
	if (cached) {
		try {
			const refreshed = await buildStory(slug, cached.story, cached.sourceUrl);
			await writeStoryRow(refreshed);
			return refreshed;
		} catch (err) {
			console.warn(`[discover] refresh failed for ${slug}; serving stale:`, err);
			return cached;
		}
	}

	// No row — try to find the source in the home cache.
	const fromHome = await findStoryInHomeCache(slug);
	if (!fromHome || !fromHome.href) return null;

	const built = await buildStory(slug, fromHome, fromHome.href);
	await writeStoryRow(built);
	return built;
}

/**
 * Return a list of "related" stories for the bottom-of-page row, for
 * the current slug. v0: just the freshest items from the home cache,
 * minus the current slug, capped to `limit`. When we have anchor /
 * category metadata this can get smarter.
 */
export async function listRelatedStories(currentSlug: string, limit = 3): Promise<ResearchStory[]> {
	const { data } = await supabaseAdmin
		.from('api_cache')
		.select('payload')
		.eq('cache_key', HOME_NEWS_CACHE_KEY)
		.maybeSingle();
	if (!data) return [];
	const all = data.payload as ResearchStory[];
	return all.filter((s) => s.id !== currentSlug).slice(0, limit);
}
