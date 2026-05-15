/**
 * POST /api/chat/[slug]/turn — send a user message, stream an assistant reply.
 *
 * Body: { content: string, persistUser?: boolean }
 *   - `content` is the user's message text.
 *   - `persistUser` defaults to true. Set false when the client knows
 *     the user message is already persisted (e.g. it was the
 *     firstUserMessage seed from POST /api/chat), to avoid duplicates.
 *
 * Returns a UI message stream (AI SDK v2's `toUIMessageStreamResponse`)
 * containing text deltas + tool calls + tool results, so the client can
 * render inline tool-call chips in real time alongside text.
 *
 * On stream completion the full `parts` array (text + tool-call +
 * tool-result, ordered) is persisted as an `assistant`-role turn so the
 * trace replays on reload. If the chat has no title yet, a fire-and-
 * forget title-generation call also runs.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { streamText, generateText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';
import {
	appendTurn,
	getMessagesForModel,
	resolveSlug,
	setChatTitle,
	type TurnPart
} from '$lib/server/db/chats';
import {
	chatModel,
	titleModel,
	CHAT_SYSTEM_PROMPT,
	resolveOpenrouterKey
} from '$lib/server/chat-model';
import { buildChatTools } from '$lib/server/chat-tools';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');

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
	if (session.userId !== locals.user.id) throw error(403, 'not your chat');

	// Resolve the API key per-request — user's BYOK key if set,
	// otherwise env fallback. Throws if neither is configured.
	const apiKey = await resolveOpenrouterKey(locals.user.id);

	if (persistUser) {
		await appendTurn({
			sessionId: session.id,
			role: 'user',
			content
		});
	}

	// Build the conversation context from history.
	const history = await getMessagesForModel(session.id);

	// Up-convert the simple {role, content} history into UIMessages so
	// AI SDK's UIMessage stream protocol can resume cleanly. Tool parts
	// from prior turns would also live here once we persist them in
	// history; for now we send text-only history (cheaper context,
	// faster turns).
	const uiHistory: UIMessage[] = history.map((m, i) => ({
		id: `hist-${i}`,
		role: m.role,
		parts: [{ type: 'text', text: m.content }]
	}));

	const result = streamText({
		model: chatModel(apiKey),
		system: CHAT_SYSTEM_PROMPT,
		messages: await convertToModelMessages(uiHistory),
		tools: buildChatTools(),
		// Hard cap: 5 tool-using steps per turn. Prevents the agent from
		// trying to do fleet-shaped work in a single chat turn.
		stopWhen: stepCountIs(5),
		toolChoice: 'auto'
	});

	return result.toUIMessageStreamResponse({
		onFinish: async ({ responseMessage }) => {
			// `responseMessage.parts` is the full ordered array of UI
			// message parts the model produced (text deltas reassembled,
			// tool calls with args, tool results). Persist verbatim so
			// the chat UI can replay the trace on reload.
			const parts = (responseMessage.parts ?? []) as unknown as TurnPart[];

			// Flatten the text content for legacy/text-only consumers
			// (Fleet context propagation, title gen, etc.).
			const flatText = parts
				.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
				.map((p) => p.text)
				.join('')
				.trim();

			try {
				await appendTurn({
					sessionId: session.id,
					role: 'assistant',
					content: flatText,
					parts,
					agentName: 'chat'
				});
			} catch (err) {
				console.error('[chat/turn] failed to persist assistant turn:', err);
			}

			if (!session.title) {
				generateChatTitle(slug, content, apiKey).catch((err) => {
					console.error('[chat/turn] title generation failed:', err);
				});
			}
		}
	});
};

/**
 * Produce a 3-6 word chat title from the user's first message. Runs
 * detached from the request lifecycle; failure is non-fatal.
 */
async function generateChatTitle(
	slug: string,
	firstUserMessage: string,
	apiKey: string
): Promise<void> {
	const { text } = await generateText({
		model: titleModel(apiKey),
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
