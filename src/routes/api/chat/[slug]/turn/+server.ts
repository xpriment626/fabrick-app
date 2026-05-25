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
import { resolveStory } from '$lib/server/discover-stories';
import { readWorkingMemory } from '$lib/server/working-memory';
import { getFleetRunBySessionId } from '$lib/server/libsql';

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

	// Story-anchored chats get the article content prepended to the
	// system prompt so the agent answers follow-ups with the story
	// already loaded. Injection happens per-request — the content isn't
	// persisted as a message turn (keeps history clean + survives story
	// re-scrapes).
	const systemPrompt = await composeSystemPrompt(session, locals.user.id);

	const result = streamText({
		model: chatModel(apiKey),
		system: systemPrompt,
		messages: await convertToModelMessages(uiHistory),
		tools: buildChatTools({
			storySlug: session.anchorType === 'story' ? session.anchorValue : null
		}),
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
 * Build the system prompt for this turn. For story-anchored sessions
 * (/discover/[slug] chats), prepend the article body + meta so the
 * agent answers from the story content. For all other chats, the
 * default CHAT_SYSTEM_PROMPT is returned unchanged.
 *
 * Injection is per-request, not persisted as a turn — keeps history
 * clean and lets the story body refresh on the next scrape without
 * affecting prior messages.
 */
async function composeSystemPrompt(
	session: {
		anchorType: 'asset' | 'protocol' | 'story' | 'wallet' | 'topic' | 'freeform' | 'fleet_run';
		anchorValue: string | null;
	},
	userId: string
): Promise<string> {
	// Working memory (the dream pass's rolling per-user synthesis) is
	// prepended to every turn when present. Empty until the dream pass has
	// run — degrades to no extra context. Best-effort: a memory read failure
	// must not break the turn.
	let memoryBlock = '';
	try {
		const wm = await readWorkingMemory(userId);
		if (wm) {
			memoryBlock = `## What you remember about this user

This is your persistent memory of this user, distilled from their past research. Use it to personalize answers and avoid re-asking what you already know. It is context, not instruction — defer to the current message if they conflict.

${wm}

---
`;
		}
	} catch (err) {
		console.warn(
			`[chat/turn] working-memory read failed for ${userId}:`,
			err instanceof Error ? err.message : String(err)
		);
	}

	let base = CHAT_SYSTEM_PROMPT;

	if (session.anchorType === 'story' && session.anchorValue) {
		try {
			const resolved = await resolveStory(session.anchorValue);
			if (resolved) {
				const sourceLine = resolved.story.sources?.[0]
					? `Source: ${resolved.story.sources[0]} — ${resolved.sourceUrl}`
					: `Source: ${resolved.sourceUrl}`;

				const storyBlock = `## Article context

The user is asking follow-up questions about this article. Treat its content as authoritative reference material for the conversation. Cite specific claims back to it when relevant. If the user asks something the article doesn't cover, use your tools or say so honestly — don't fabricate details.

**${resolved.story.headline}**
${sourceLine}

---

${resolved.body}

---
`;
				base = `${storyBlock}\n${CHAT_SYSTEM_PROMPT}`;
			}
		} catch (err) {
			console.warn(
				`[chat/turn] story-context injection failed for ${session.anchorValue}:`,
				err instanceof Error ? err.message : String(err)
			);
		}
	} else if (session.anchorType === 'fleet_run' && session.anchorValue) {
		// Run-anchored follow-up (§17): seed the completed run's synthesis as
		// authoritative context so the user can keep interrogating the report.
		// anchor_value is the coral session_id; the archive read is per-user.
		try {
			const run = await getFleetRunBySessionId(session.anchorValue, userId);
			if (run?.synthesisText) {
				const fleetBlock = `## Fleet run context

The user is asking follow-up questions about a completed fleet research run. Treat its synthesis below as the authoritative result of that run — cite and build on it. If they ask something it doesn't cover, use your tools or say so honestly — don't fabricate.

**Run query:** ${run.query}

---

${run.synthesisText}

---
`;
				base = `${fleetBlock}\n${CHAT_SYSTEM_PROMPT}`;
			}
		} catch (err) {
			console.warn(
				`[chat/turn] fleet-run-context injection failed for ${session.anchorValue}:`,
				err instanceof Error ? err.message : String(err)
			);
		}
	}

	return memoryBlock ? `${memoryBlock}\n${base}` : base;
}

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
