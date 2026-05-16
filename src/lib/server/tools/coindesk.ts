/**
 * CoinDesk Data API-backed tools — curated crypto news firehose.
 *
 * The article/list endpoint is unauthenticated and returns up to 100
 * articles per call, aggregated from RSS sources (Decrypt, Coinpaprika,
 * AMB Crypto, etc.). Articles come pre-tagged with categories (SOL, BTC,
 * ALTCOIN, DEFI, ...) and a machine-derived sentiment label, which we
 * surface as-is for the orchestrator to weight.
 *
 * Endpoints used:
 *  - GET /news/v1/article/list?lang=EN&limit=100&categories=<NAME>
 *  - GET /news/v1/category/list
 *
 * Docs: https://developers.coindesk.com/documentation/data-api/news
 */

import { z } from 'zod';

const BASE = 'https://data-api.coindesk.com/news/v1';

async function fetchJson<T>(url: string, hint: string): Promise<T> {
	const res = await fetch(url, {
		headers: { accept: 'application/json' },
		signal: AbortSignal.timeout(8000)
	});
	if (!res.ok) {
		throw new Error(`${hint} ${res.status}: ${await res.text()}`);
	}
	return (await res.json()) as T;
}

/* ---- news_get_articles ----------------------------------------------- */

export const newsGetArticlesInput = z
	.object({
		category: z
			.string()
			.optional()
			.describe(
				'CoinDesk category name (uppercase). Common values: "SOL", "BTC", "ETH", "ALTCOIN", "DEFI", "NFT", "TRADING", "CRYPTOCURRENCY". Use news_get_categories to discover the full list.'
			),
		query: z
			.string()
			.optional()
			.describe(
				'Optional keyword filter applied post-fetch against TITLE/BODY/KEYWORDS. Comma- or space-separated; matches any.'
			),
		sinceMinutesAgo: z
			.number()
			.int()
			.positive()
			.optional()
			.describe(
				'Limit to articles published within the last N minutes. Common values: 60 (last hour), 1440 (24h), 10080 (7d).'
			),
		sentiment: z
			.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL'])
			.optional()
			.describe('Filter to articles tagged with this sentiment label by CoinDesk.'),
		limit: z.number().int().min(1).max(50).default(15)
	})
	.describe('Inputs for news_get_articles');

export type NewsGetArticlesInput = z.infer<typeof newsGetArticlesInput>;

export const newsGetArticlesOutput = z.object({
	articles: z.array(
		z.object({
			title: z.string(),
			url: z.string(),
			source: z.string(),
			publishedAt: z.number().describe('Unix seconds'),
			publishedAtIso: z.string(),
			sentiment: z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL']).nullable(),
			categories: z.array(z.string()),
			snippet: z.string(),
			imageUrl: z.string().nullable()
		})
	),
	count: z.number().int(),
	queriedCategory: z.string().nullable()
});

type RawArticle = {
	TITLE?: string;
	URL?: string;
	PUBLISHED_ON?: number;
	BODY?: string;
	KEYWORDS?: string;
	SENTIMENT?: string;
	IMAGE_URL?: string;
	CATEGORY_DATA?: { CATEGORY?: string; NAME?: string }[];
	SOURCE_DATA?: { NAME?: string };
};

/**
 * CoinDesk's IMAGE_URL field is populated on every article, but ~half
 * the time it's a generic per-source placeholder (e.g. the source's
 * logo on a colored background) rather than a real article-specific
 * image. Two patterns we've observed in the wild:
 *
 *   https://resources.cryptocompare.com/news/<source_id>/default.png
 *   https://images.cryptocompare.com/news/default/<source_slug>.png
 *
 * Both contain the literal segment `/default`. That's the cheap,
 * stable signal — checking for it in the path catches both patterns
 * without false positives we've seen in real article filenames
 * (which are numeric IDs like `61963857.jpeg`).
 */
function articleImageOrNull(raw: string | undefined): string | null {
	if (!raw || typeof raw !== 'string') return null;
	if (!raw.startsWith('http')) return null;
	if (/\/default(?:\.png|\/)/i.test(raw)) return null;
	return raw;
}

function normalizeSentiment(s: string | undefined): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | null {
	if (!s) return null;
	const u = s.toUpperCase();
	if (u === 'POSITIVE' || u === 'NEGATIVE' || u === 'NEUTRAL') return u;
	return null;
}

export async function newsGetArticles(input: NewsGetArticlesInput) {
	const url = new URL(`${BASE}/article/list`);
	url.searchParams.set('lang', 'EN');
	url.searchParams.set('limit', '100');
	if (input.category) {
		url.searchParams.set('categories', input.category.toUpperCase());
	}

	const raw = await fetchJson<{ Data: RawArticle[] }>(
		url.toString(),
		`coindesk /article/list (category=${input.category ?? 'any'})`
	);

	const keywords =
		input.query
			?.split(/[\s,]+/)
			.map((k) => k.trim().toLowerCase())
			.filter(Boolean) ?? [];

	const sinceTs = input.sinceMinutesAgo
		? Math.floor(Date.now() / 1000) - input.sinceMinutesAgo * 60
		: null;

	const filtered = (raw.Data ?? [])
		.filter((a) => {
			const ts = a.PUBLISHED_ON ?? 0;
			if (sinceTs != null && ts < sinceTs) return false;
			if (input.sentiment && normalizeSentiment(a.SENTIMENT) !== input.sentiment) return false;
			if (keywords.length > 0) {
				const haystack = [
					a.TITLE ?? '',
					a.BODY ?? '',
					a.KEYWORDS ?? '',
					(a.CATEGORY_DATA ?? []).map((c) => c.CATEGORY ?? c.NAME ?? '').join(' ')
				]
					.join(' ')
					.toLowerCase();
				if (!keywords.some((k) => haystack.includes(k))) return false;
			}
			return Boolean(a.URL && a.TITLE);
		})
		.sort((a, b) => (b.PUBLISHED_ON ?? 0) - (a.PUBLISHED_ON ?? 0))
		.slice(0, input.limit)
		.map((a) => {
			const publishedAt = a.PUBLISHED_ON ?? 0;
			const body = (a.BODY ?? '').trim();
			return {
				title: (a.TITLE ?? '').trim(),
				url: a.URL ?? '',
				source: a.SOURCE_DATA?.NAME ?? 'CoinDesk',
				publishedAt,
				publishedAtIso: new Date(publishedAt * 1000).toISOString(),
				sentiment: normalizeSentiment(a.SENTIMENT),
				categories: (a.CATEGORY_DATA ?? [])
					.map((c) => c.CATEGORY ?? c.NAME ?? '')
					.filter(Boolean),
				snippet: body.length > 400 ? body.slice(0, 400) + '…' : body,
				imageUrl: articleImageOrNull(a.IMAGE_URL)
			};
		});

	return {
		articles: filtered,
		count: filtered.length,
		queriedCategory: input.category?.toUpperCase() ?? null
	};
}

/* ---- news_get_categories --------------------------------------------- */

export const newsGetCategoriesInput = z.object({}).describe('No inputs');

export type NewsGetCategoriesInput = z.infer<typeof newsGetCategoriesInput>;

export const newsGetCategoriesOutput = z.object({
	categories: z.array(z.string())
});

type RawCategory = { NAME?: string };

export async function newsGetCategories(_input: NewsGetCategoriesInput) {
	const raw = await fetchJson<{ Data: RawCategory[] }>(
		`${BASE}/category/list`,
		'coindesk /category/list'
	);

	const names = (raw.Data ?? [])
		.map((c) => c.NAME)
		.filter((n): n is string => Boolean(n))
		.sort();

	return { categories: names };
}
