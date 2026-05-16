/**
 * Map CoinDesk articles to the home-page ResearchStory shape.
 *
 * Each card on the home page is currently one CoinDesk article — the
 * "synthesized by N agents from M sources" framing in placeholder-data
 * doesn't apply until the agent fleet starts pre-aggregating
 * coverage per topic. For now: one article = one card, sentiment
 * drives the tag pill, publishedAt drives the relative timestamp.
 *
 * Source attribution comes from CoinDesk's RSS aggregation (Decrypt,
 * Coinpaprika, AMB Crypto, etc.), surfaced via the `source` field on
 * each article. We expose it through `ResearchStory.sources[0]` so
 * the ResearchCard can render "via <source>" once we wire that up.
 */

import { newsGetArticles, type NewsGetArticlesInput } from '$lib/server/tools/coindesk';
import { timeAgo } from '$lib/components/artifacts/utils';
import type { ResearchSentiment, ResearchStory } from '$lib/placeholder-data';

type CoinDeskSentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | null;

/**
 * Map CoinDesk's tri-state sentiment label to one of the design's
 * existing tags. We deliberately don't introduce a 'negative' tag —
 * the system already uses 'mixed' (amber) to convey "be cautious here",
 * which fits negative coverage. NEUTRAL becomes 'watch' (amber, "noted
 * but neutral").
 *
 * 'verified' is reserved for stories that came out of the Fabrick agent
 * fleet — single CoinDesk articles never earn that tag.
 */
function sentimentToTag(s: CoinDeskSentiment): ResearchSentiment {
	if (s === 'POSITIVE') return 'positive';
	if (s === 'NEGATIVE') return 'mixed';
	return 'watch';
}

/**
 * Stable, URL-derived id for a story. Using base64url of the URL keeps
 * ids consistent across reloads (so #each keyed by id doesn't churn the
 * DOM) without leaking the full URL into ids that show up in click
 * handlers, hashes, etc.
 */
function storyId(url: string): string {
	if (typeof globalThis.btoa !== 'function') {
		// Node 18+ has atob/btoa globally; fall back to Buffer just in case.
		return Buffer.from(url, 'utf8').toString('base64url').slice(0, 22);
	}
	return globalThis
		.btoa(url)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')
		.slice(0, 22);
}

export type LoadStoriesOptions = NewsGetArticlesInput;

export async function loadStoriesFromCoinDesk(
	options: LoadStoriesOptions
): Promise<ResearchStory[]> {
	const result = await newsGetArticles(options);
	return result.articles.map((a) => {
		const story: ResearchStory = {
			id: storyId(a.url || a.title),
			tag: sentimentToTag(a.sentiment),
			headline: a.title,
			excerpt: a.snippet,
			sourceCount: 1,
			sources: [a.source || 'CoinDesk'],
			timestamp: timeAgo(a.publishedAt),
			href: a.url || null,
			imageUrl: a.imageUrl
		};
		return story;
	});
}

/**
 * Convenience: split a flat story array into the home-page's
 * `featuredStory + secondaryStories + extraStories` shape so the
 * loader can return them directly.
 *
 * Layout we render today: 1 featured + 3 secondary + 3 extra = 7
 * stories total. If the upstream returns fewer than 7 we cap the
 * extras first; the featured + 3 secondaries are the minimum slots
 * we try to fill.
 */
export function splitForHomeLayout(stories: ResearchStory[]): {
	featuredStory: ResearchStory | null;
	secondaryStories: ResearchStory[];
	extraStories: ResearchStory[];
} {
	const [featured, ...rest] = stories;
	return {
		featuredStory: featured ?? null,
		secondaryStories: rest.slice(0, 3),
		extraStories: rest.slice(3, 6)
	};
}

