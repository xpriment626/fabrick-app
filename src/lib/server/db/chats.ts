/**
 * Chat persistence helpers.
 *
 * "Chat" in user-facing language = `research_sessions` row anchored as
 * `freeform`. Each conversation message is a `research_turns` row;
 * normal chat replies use `role='assistant'`, fleet-mode turns will
 * later use `orchestrator`/`specialist`/`synthesizer` with a non-null
 * `run_id`.
 *
 * Until Privy auth + per-request RLS clients land (design.md §3.5.b),
 * everything runs through `supabaseAdmin` (service_role) and uses the
 * single hard-coded dev user. That trade is documented in supabase.ts.
 */

import { customAlphabet } from 'nanoid';
import { supabaseAdmin } from '$lib/server/supabase';
import type { Database, Json } from '$lib/server/database.types';

type AnchorType = Database['public']['Enums']['anchor_type'];

/** 8-char base58 slug. Matches the comment on `research_sessions.slug`. */
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const generateSlug = customAlphabet(BASE58, 8);

export type ChatSummary = {
	slug: string;
	title: string | null;
	createdAt: string;
	updatedAt: string;
};

/**
 * AI SDK v2 UIMessage part shape. We persist the ordered array as JSONB
 * so the chat UI can replay the full agent trace on reload.
 *
 * AI SDK v2 emits one combined part per tool invocation, namespaced as
 * `tool-${toolName}`, that carries both the input args and the
 * eventual output. It transitions through states:
 *   - input-streaming → input-available → output-available | output-error
 *
 * Steps are bounded by `step-start` markers. Text parts may have a
 * `state` of `streaming` while tokens are landing.
 *
 * Loose type — the AI SDK's exact discriminated union evolves; this is
 * the storage format, not the runtime API surface. We keep a permissive
 * escape hatch for forward compat.
 */
export type TurnPart =
	| { type: 'text'; text: string; state?: 'streaming' | 'done' }
	| { type: 'step-start' }
	| { type: 'reasoning'; text: string; state?: 'streaming' | 'done' }
	| {
			// tool-${toolName} — one per tool invocation, state transitions
			// through input-streaming → input-available → output-available
			type: `tool-${string}`;
			toolCallId: string;
			state:
				| 'input-streaming'
				| 'input-available'
				| 'output-available'
				| 'output-error';
			input?: unknown;
			output?: unknown;
			errorText?: string;
			providerExecuted?: boolean;
	  }
	| { type: string; [key: string]: unknown };

export type ChatTurn = {
	id: string;
	role: Database['public']['Enums']['turn_role'];
	agentName: string | null;
	content: string;
	/** Ordered AI SDK UIMessage parts — present on streamed assistant
	 * turns since the chat-tools wiring landed; null for legacy and for
	 * client-only placeholder turns the chat page synthesizes locally. */
	parts?: TurnPart[] | null;
	status: Database['public']['Enums']['turn_status'];
	runId: string | null;
	createdAt: string;
};

export type LoadedChat = {
	id: string;
	slug: string;
	title: string | null;
	userId: string;
	turns: ChatTurn[];
};

/** A fleet run dispatched from this chat — surfaced as a re-entry link
 *  in the chat UI so the user can navigate back to /research/[ns]/[sid]. */
export type ChatFleetRun = {
	coralSessionId: string;
	status: Database['public']['Enums']['run_status'];
	startedAt: string;
	finishedAt: string | null;
};

/**
 * Create a new chat. Optionally seed it with a first user turn in the
 * same call so `POST /api/chat { content }` is one atomic operation.
 */
export async function createChat(args: {
	userId: string;
	firstUserMessage?: string;
	title?: string;
	anchorType?: AnchorType;
	anchorValue?: string | null;
}): Promise<{ slug: string; firstTurnId: string | null }> {
	const slug = generateSlug();
	const insert = await supabaseAdmin
		.from('research_sessions')
		.insert({
			slug,
			user_id: args.userId,
			anchor_type: args.anchorType ?? 'freeform',
			anchor_value: args.anchorValue ?? null,
			title: args.title ?? null
		})
		.select('id, slug')
		.single();

	if (insert.error || !insert.data) {
		throw new Error(`createChat: ${insert.error?.message ?? 'no row returned'}`);
	}

	let firstTurnId: string | null = null;
	if (args.firstUserMessage && args.firstUserMessage.trim().length > 0) {
		const turn = await appendTurn({
			sessionId: insert.data.id,
			role: 'user',
			content: args.firstUserMessage.trim()
		});
		firstTurnId = turn.id;
	}

	return { slug: insert.data.slug, firstTurnId };
}

/** Resolve a slug to the internal session id (and optionally other fields). */
export async function resolveSlug(slug: string): Promise<{
	id: string;
	userId: string;
	title: string | null;
	anchorType: AnchorType;
	anchorValue: string | null;
} | null> {
	const res = await supabaseAdmin
		.from('research_sessions')
		.select('id, user_id, title, anchor_type, anchor_value')
		.eq('slug', slug)
		.is('archived_at', null)
		.maybeSingle();
	if (res.error) throw new Error(`resolveSlug: ${res.error.message}`);
	if (!res.data) return null;
	return {
		id: res.data.id,
		userId: res.data.user_id,
		title: res.data.title,
		anchorType: res.data.anchor_type,
		anchorValue: res.data.anchor_value
	};
}

/**
 * Find an existing chat anchored to a specific (anchorType, anchorValue)
 * pair for this user — used by /discover/[slug] to reuse a prior
 * conversation about the same story instead of creating fresh threads.
 * Returns null if no matching chat exists.
 */
export async function findChatByAnchor(args: {
	userId: string;
	anchorType: AnchorType;
	anchorValue: string;
}): Promise<{ id: string; slug: string; title: string | null } | null> {
	const res = await supabaseAdmin
		.from('research_sessions')
		.select('id, slug, title')
		.eq('user_id', args.userId)
		.eq('anchor_type', args.anchorType)
		.eq('anchor_value', args.anchorValue)
		.is('archived_at', null)
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (res.error) throw new Error(`findChatByAnchor: ${res.error.message}`);
	if (!res.data) return null;
	return { id: res.data.id, slug: res.data.slug, title: res.data.title };
}

/** Load a chat by slug for SSR rendering. */
export async function loadChat(slug: string): Promise<LoadedChat | null> {
	const session = await resolveSlug(slug);
	if (!session) return null;

	const turnsRes = await supabaseAdmin
		.from('research_turns')
		.select('id, role, agent_name, content, parts, status, run_id, created_at')
		.eq('session_id', session.id)
		.order('created_at', { ascending: true });
	if (turnsRes.error) throw new Error(`loadChat: ${turnsRes.error.message}`);

	const turns: ChatTurn[] = (turnsRes.data ?? []).map((t) => ({
		id: t.id,
		role: t.role,
		agentName: t.agent_name,
		content: t.content,
		parts: (t.parts as TurnPart[] | null) ?? null,
		status: t.status,
		runId: t.run_id,
		createdAt: t.created_at
	}));

	return { id: session.id, slug, title: session.title, userId: session.userId, turns };
}

/**
 * List fleet runs (Coral sessions) that were dispatched from this chat,
 * newest first. Used by the chat page to render re-entry links so the
 * user can navigate back into a fleet trace they kicked off here.
 */
export async function listFleetRunsForChat(
	sessionId: string,
	limit = 10
): Promise<ChatFleetRun[]> {
	const res = await supabaseAdmin
		.from('research_runs')
		.select('coral_session_id, status, started_at, finished_at')
		.eq('session_id', sessionId)
		.not('coral_session_id', 'is', null)
		.order('started_at', { ascending: false })
		.limit(limit);
	if (res.error) throw new Error(`listFleetRunsForChat: ${res.error.message}`);
	return (res.data ?? [])
		.filter((r): r is typeof r & { coral_session_id: string } => r.coral_session_id !== null)
		.map((r) => ({
			coralSessionId: r.coral_session_id,
			status: r.status,
			startedAt: r.started_at,
			finishedAt: r.finished_at
		}));
}

/** Append a turn. Returns the new turn id. */
export async function appendTurn(args: {
	sessionId: string;
	role: Database['public']['Enums']['turn_role'];
	content: string;
	parts?: TurnPart[] | null;
	agentName?: string | null;
	status?: Database['public']['Enums']['turn_status'];
	runId?: string | null;
}): Promise<{ id: string }> {
	const res = await supabaseAdmin
		.from('research_turns')
		.insert({
			session_id: args.sessionId,
			role: args.role,
			content: args.content,
			parts: (args.parts as Json | null | undefined) ?? null,
			agent_name: args.agentName ?? null,
			status: args.status ?? 'complete',
			run_id: args.runId ?? null
		})
		.select('id')
		.single();
	if (res.error || !res.data) {
		throw new Error(`appendTurn: ${res.error?.message ?? 'no row returned'}`);
	}
	// Bump the session's updated_at so the chat list sorts correctly.
	await supabaseAdmin
		.from('research_sessions')
		.update({ updated_at: new Date().toISOString() })
		.eq('id', args.sessionId);
	return { id: res.data.id };
}

/** List recent chats for the side panel. */
export async function listChats(userId: string, limit = 30): Promise<ChatSummary[]> {
	const res = await supabaseAdmin
		.from('research_sessions')
		.select('slug, title, created_at, updated_at')
		.eq('user_id', userId)
		.is('archived_at', null)
		.order('updated_at', { ascending: false })
		.limit(limit);
	if (res.error) throw new Error(`listChats: ${res.error.message}`);
	return (res.data ?? []).map((s) => ({
		slug: s.slug,
		title: s.title,
		createdAt: s.created_at,
		updatedAt: s.updated_at
	}));
}

/**
 * Soft-delete a chat by setting `archived_at`. `loadChat` /
 * `resolveSlug` / `listChats` all filter by `archived_at IS NULL`, so
 * the row disappears from the UI without hard-deletion + cascading
 * turn deletes. Reversible from SQL if needed.
 *
 * Returns true if a row was archived, false if the slug didn't exist
 * or wasn't owned by `userId` (caller can map to a 404/403).
 */
export async function archiveChat(slug: string, userId: string): Promise<boolean> {
	const res = await supabaseAdmin
		.from('research_sessions')
		.update({ archived_at: new Date().toISOString() })
		.eq('slug', slug)
		.eq('user_id', userId)
		.is('archived_at', null)
		.select('id')
		.maybeSingle();
	if (res.error) throw new Error(`archiveChat: ${res.error.message}`);
	return Boolean(res.data);
}

/** Set the chat's title (used after first-turn title generation). */
export async function setChatTitle(slug: string, title: string): Promise<void> {
	const res = await supabaseAdmin
		.from('research_sessions')
		.update({ title })
		.eq('slug', slug);
	if (res.error) throw new Error(`setChatTitle: ${res.error.message}`);
}

/** Fetch the conversation history in AI SDK format for a model call. */
export async function getMessagesForModel(
	sessionId: string
): Promise<{ role: 'user' | 'assistant' | 'system'; content: string }[]> {
	const res = await supabaseAdmin
		.from('research_turns')
		.select('role, content')
		.eq('session_id', sessionId)
		.order('created_at', { ascending: true });
	if (res.error) throw new Error(`getMessagesForModel: ${res.error.message}`);

	// Map our richer role enum onto the AI SDK's user/assistant/system.
	// orchestrator/specialist/synthesizer all collapse to 'assistant' for
	// chat-mode context (they're prior assistant-side output in history).
	return (res.data ?? [])
		.filter((t) => t.content && t.content.length > 0)
		.map((t) => ({
			role: t.role === 'user' ? 'user' : 'assistant',
			content: t.content
		}));
}
