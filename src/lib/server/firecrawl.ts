/**
 * Minimal Firecrawl v2 client — scrape a URL and return clean markdown.
 *
 * Auth: Bearer FIRECRAWL_API_KEY. If unset, scrape calls throw a
 * recognizable error so callers can fall back gracefully (e.g. render
 * snippet-only).
 *
 * Why Firecrawl and not Exa: we evaluated Exa's /contents endpoint as
 * a substitute (already-configured EXA_API_KEY, same $0.001/page). On
 * three real news URLs from our CoinDesk feed, Exa returned (a) clean
 * text but chrome-heavy with no working `excludeSections` (ZyCrypto),
 * (b) near-empty content blocked by anti-scraping (CoinTurk), (c)
 * binary garbage from a compressed-response mishandle (AMB Crypto).
 * Firecrawl's `onlyMainContent: true` reliably extracts article body
 * across the same sites with its purpose-built reader pipeline. The
 * extra env var is worth the reliability for a user-facing render.
 *
 * Caching: callers route through `api_cache.getOrFetch` (Tier-2). We
 * don't lean on Firecrawl's own maxAge — one cache discipline across
 * all upstream-fetch surfaces.
 */

import { env } from '$env/dynamic/private';

export class FirecrawlConfigError extends Error {
	constructor() {
		super('FIRECRAWL_API_KEY not set');
		this.name = 'FirecrawlConfigError';
	}
}

export type ScrapedDoc = {
	markdown: string;
	title: string | null;
	sourceURL: string;
	statusCode: number | null;
};

/**
 * Scrape a single URL via Firecrawl v2, returning clean markdown of
 * the page's main content. Throws FirecrawlConfigError if the key
 * isn't set — callers should catch and fall back rather than blowing
 * up the page.
 */
export async function scrapeMarkdown(url: string): Promise<ScrapedDoc> {
	const apiKey = env.FIRECRAWL_API_KEY;
	if (!apiKey) throw new FirecrawlConfigError();

	const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${apiKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			url,
			formats: ['markdown'],
			onlyMainContent: true,
			blockAds: true
		})
	});

	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`firecrawl scrape failed: ${res.status} ${body.slice(0, 200)}`);
	}

	const payload = (await res.json()) as {
		success?: boolean;
		data?: {
			markdown?: string;
			metadata?: { title?: string; sourceURL?: string; statusCode?: number };
		};
		error?: string;
	};

	if (!payload.success || !payload.data?.markdown) {
		throw new Error(`firecrawl returned no markdown: ${payload.error ?? 'unknown'}`);
	}

	return {
		markdown: payload.data.markdown,
		title: payload.data.metadata?.title ?? null,
		sourceURL: payload.data.metadata?.sourceURL ?? url,
		statusCode: payload.data.metadata?.statusCode ?? null
	};
}
