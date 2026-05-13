/**
 * POST /api/chat/[slug]/turn — send a user message, stream an assistant reply.
 *
 * Body: { content: string, persistUser?: boolean }
 *   - `content` is the user's message text.
 *   - `persistUser` defaults to true. Set false when the client knows
 *     the user message is already persisted (e.g. it was the
 *     firstUserMessage seed from POST /api/chat), to avoid duplicates.
 *
 * Returns a text stream of the assistant's reply (AI SDK
 * `toTextStreamResponse`). On stream completion, the full assistant text
 * is persisted as an `assistant`-role turn. If the chat has no title
 * yet, a fire-and-forget title-generation call runs in the background.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { streamText, generateText } from 'ai';
import {
	appendTurn,
	getMessagesForModel,
	resolveSlug,
	setChatTitle
} from '$lib/server/db/chats';
import {
	chatModel,
	titleModel,
	CHAT_SYSTEM_PROMPT
} from '$lib/server/chat-model';

export const POST: RequestHandler = async ({ request, params }) => {
	const slug = params.slug;
	if (!slug) throw error(400, 'slug required');

	let body: { content?: unknown; persistUser?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'expected JSON body');
	}

	const content = typeof body.content === 'string' ? body.content.trim() : '';
	if (!content) throw error(400, '`content` must be a non-empty string');

	const persistUser = body.persistUser !== false;

	const session = await resolveSlug(slug);
	if (!session) throw error(404, `chat not found: ${slug}`);

	if (persistUser) {
		await appendTurn({
			sessionId: session.id,
			role: 'user',
			content
		});
	}

	// Build the conversation context from history. Includes the user
	// message we just appended (or the seeded one) — we don't pre-fetch
	// then append to avoid an extra read.
	const history = await getMessagesForModel(session.id);

	const result = streamText({
		model: chatModel(),
		system: CHAT_SYSTEM_PROMPT,
		messages: history,
		onFinish: async ({ text }) => {
			// Persist the completed assistant turn. The stream has already
			// flushed to the client by this point — DB write happens
			// async-from-client view.
			try {
				await appendTurn({
					sessionId: session.id,
					role: 'assistant',
					content: text,
					agentName: 'chat'
				});
			} catch (err) {
				console.error('[chat/turn] failed to persist assistant turn:', err);
			}

			// Fire-and-forget title generation if the chat has no title
			// yet. Uses a cheap model and the user's first message as the
			// only input.
			if (!session.title) {
				generateChatTitle(slug, content).catch((err) => {
					console.error('[chat/turn] title generation failed:', err);
				});
			}
		}
	});

	return result.toTextStreamResponse();
};

/**
 * Produce a 3-6 word chat title from the user's first message. Runs
 * detached from the request lifecycle; failure is non-fatal.
 */
async function generateChatTitle(slug: string, firstUserMessage: string): Promise<void> {
	const { text } = await generateText({
		model: titleModel(),
		system: `Generate a short title (3-6 words, sentence case, no quotes, no trailing punctuation) that summarizes the TOPIC of the user's first chat message. DO NOT answer the message. DO NOT explain. Return ONLY the title text itself.

Examples:
Input: "What is the canonical CEX listing path for a new Solana memecoin?"
Output: Solana memecoin CEX listing path

Input: "How do I size a Drift perp position relative to my margin?"
Output: Drift perp position sizing

Input: "Compare BONK and WIF"
Output: BONK vs WIF comparison`,
		prompt: firstUserMessage
	});
	const title = text.trim().replace(/^["']|["']$/g, '').slice(0, 80);
	if (title) await setChatTitle(slug, title);
}
