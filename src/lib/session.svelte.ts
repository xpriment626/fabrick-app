/**
 * Client-side reactive Session class.
 *
 * Holds the live state of one Coral session for our research trace
 * reel. Mirrors the canonical pattern from the official Coral console
 * (Coral-Protocol/console, src/lib/session.svelte.ts) — same WS event
 * taxonomy, same state shape, same per-event-type switch.
 *
 * Differences from the console's version:
 *   1. We accept an initial state snapshot via constructor (delivered by
 *      our `+page.server.ts` load function) instead of fetching `/extended`
 *      client-side. SSR-friendly, removes the race-gating Promise the
 *      console uses, and means deep-link reloads work first-paint.
 *   2. We use Svelte 5 runes (`$state`) directly without the SvelteSet
 *      participant set — plain arrays are fine for the small participant
 *      counts we run (<10 agents per session).
 *   3. No `toast` integration; we just log warnings to console.
 *
 * Reconnection: on `onclose` we reset state (matches console behavior).
 * The TTL on our sessions is short (10min) so a network blip during a
 * single research run is acceptable to fail-fast on.
 */

import { SvelteMap } from 'svelte/reactivity';

/* -------------- synthesis envelope ------------------------------------ */

/**
 * Discriminated union of fleet synthesis shapes. Must mirror the schema
 * declared in `fabrick-agents/src/mastra/fleet-modes.ts` — that schema
 * is the wire authority; this is the consumer-side type. v0 ships only
 * the `text` variant. Future variants add cases here + matching
 * renderers without touching the transport.
 *
 * On the wire: the orchestrator worker JSON-stringifies
 * `{ [ENVELOPE_KEY]: FleetSynthesis }` and sends it as the
 * `coral_send_message` content. Plain-text messages without the
 * envelope key fall back to legacy rendering (treat `message.text` as
 * markdown body).
 */
export type FleetSynthesis = { type: 'text'; body: string };

export const FLEET_SYNTHESIS_ENVELOPE_KEY = '__fabrick_synthesis__';

/** Parse a coral message text payload for a fleet synthesis envelope.
 *  Returns the typed synthesis if present, `null` otherwise. Errors are
 *  swallowed — non-JSON / non-envelope payloads just fall through. */
function parseSynthesisEnvelope(text: string): FleetSynthesis | null {
	if (!text || text.length < 2 || text[0] !== '{') return null;
	try {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		const inner = parsed[FLEET_SYNTHESIS_ENVELOPE_KEY] as FleetSynthesis | undefined;
		if (!inner || typeof inner !== 'object') return null;
		if (inner.type === 'text' && typeof (inner as { body?: unknown }).body === 'string') {
			return inner;
		}
		return null;
	} catch {
		return null;
	}
}

/** Coral serializes message timestamps as ISO-8601 strings (the same as
 *  thread/session timestamps), even though our `ThreadMessage.timestamp`
 *  contract is epoch-ms `number`. The trace UI does arithmetic on these
 *  (elapsed duration, chronological `allMessages` sort), and `string -
 *  number` / `string - string` both yield NaN — which surfaced as a
 *  "Fleet completed · NaNh NaNm" header. Coerce every ingested message to
 *  epoch-ms so the `number` contract holds. Tolerates already-numeric
 *  values; falls back to now() for anything unparseable. */
function toEpochMs(ts: unknown): number {
	if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
	if (typeof ts === 'string') {
		const parsed = Date.parse(ts);
		if (Number.isFinite(parsed)) return parsed;
	}
	return Date.now();
}

function normalizeMessages(messages: ThreadMessage[] | undefined): ThreadMessage[] {
	return (messages ?? []).map((m) => ({ ...m, timestamp: toEpochMs(m.timestamp) }));
}

/** Union two message lists by id. The snapshot (`incoming`) is
 *  authoritative for content, but messages present only in `existing`
 *  are preserved — that's what keeps a live WS message we've already
 *  applied (or a self-heal placeholder) from being clobbered when a
 *  reconcile snapshot hasn't caught up to it yet. Order doesn't matter
 *  here; `allMessages` re-sorts by timestamp. */
function mergeMessagesById(
	existing: ThreadMessage[],
	incoming: ThreadMessage[] | undefined
): ThreadMessage[] {
	const byId = new Map<string, ThreadMessage>();
	for (const m of existing) byId.set(m.id, m);
	for (const m of normalizeMessages(incoming)) byId.set(m.id, m);
	return Array.from(byId.values());
}

/* -------------- types (hand-written; trim of coral-server schema) ----- */

export type AgentCommunicationStatus =
	| { type: 'thinking' }
	| { type: 'waiting_message' }
	| { type: 'sleeping' };

export type AgentConnectionStatus =
	| { type: 'not_connected' }
	| { type: 'connected'; communicationStatus: AgentCommunicationStatus };

export type AgentStatus =
	| { type: 'running'; startTime?: string; connectionStatus: AgentConnectionStatus }
	| { type: 'waiting' }
	| { type: 'stopped' };

export type SessionAgent = {
	name: string;
	status: AgentStatus;
	annotations?: Record<string, string>;
};

export type ThreadMessage = {
	id: string;
	threadId: string;
	senderName: string;
	text: string;
	timestamp: number;
	mentionNames: string[];
};

export type ThreadState =
	| { state: 'open' }
	| { state: 'closed'; summary: string; timestamp: string };

export type SessionThread = {
	id: string;
	name?: string;
	participants: string[];
	messages: ThreadMessage[];
	state?: ThreadState;
	timestamp?: string;
	/** Client-side: count of messages added since last viewer interaction. */
	unread: number;
};

/* -------------- WS event taxonomy ------------------------------------- */

type SessionEvent =
	| { type: 'agent_connected'; name: string; timestamp: string }
	| { type: 'agent_wait_start'; name: string; timestamp: string }
	| { type: 'agent_wait_stop'; name: string; timestamp: string }
	| { type: 'agent_sleep_start'; name: string; timestamp: string }
	| { type: 'agent_sleep_stop'; name: string; timestamp: string }
	| { type: 'runtime_started'; name: string; timestamp: string }
	| { type: 'runtime_stopped'; name: string; timestamp: string }
	| { type: 'thread_created'; thread: SessionThread; timestamp: string }
	| { type: 'thread_message_sent'; message: ThreadMessage; timestamp: string }
	| { type: 'thread_closed'; threadId: string; summary: string; timestamp: string }
	| { type: 'thread_participant_added'; threadId: string; name: string; timestamp: string }
	| { type: 'thread_participant_removed'; threadId: string; name: string; timestamp: string }
	// Synthetic frame the fleet-gateway injects when a run settles without a
	// synthesis (coral closed early / errored / timed out). Not a coral event.
	| { type: 'gateway_run_failed'; reason: string; timestamp: string };

/* -------------- Session class ----------------------------------------- */

export type SessionInitOptions = {
	namespace: string;
	sessionId: string;
	eventsWsUrl: string;
	initialAgents: SessionAgent[];
	initialThreads: SessionThread[];
};

export type SessionMode = 'live' | 'archived';

export class Session {
	readonly namespace: string;
	readonly sessionId: string;
	readonly query: string;
	readonly mode: SessionMode;
	readonly startedAt: number;

	public connected = $state(false);
	/** Set when the gateway reports the run failed (no synthesis). Drives the
	 *  loud failure banner in the trace UIs instead of an endless timer. */
	public failed = $state<{ reason: string } | null>(null);
	public agents: SvelteMap<string, SessionAgent> = new SvelteMap();
	public threads: SvelteMap<string, SessionThread> = new SvelteMap();
	public archived = $state(false);

	/** Reactive flat-list of every thread message, sorted by timestamp.
	 *  As a `$derived.by` class field this re-evaluates automatically
	 *  whenever the `threads` SvelteMap mutates — used directly by the
	 *  trace UI without re-wrapping in another `$derived` at the call
	 *  site (though wrappers are harmless). */
	public allMessages: ThreadMessage[] = $derived.by(() => {
		const all: ThreadMessage[] = [];
		for (const t of this.threads.values()) {
			for (const m of t.messages) all.push(m);
		}
		all.sort((a, b) => a.timestamp - b.timestamp);
		return all;
	});

	/** The orchestrator's final synthesis turn — the orchestrator
	 *  message with empty mentions. `null` until one lands. */
	public finalSynthesis: ThreadMessage | null = $derived.by(() => {
		const all = this.allMessages;
		for (let i = all.length - 1; i >= 0; i--) {
			const m = all[i];
			if (m && m.senderName === 'research-orchestrator' && m.mentionNames.length === 0) {
				return m;
			}
		}
		return null;
	});

	/** The structured synthesis payload, parsed from the envelope on the
	 *  final synthesis message. `null` if no synthesis has landed yet, or
	 *  if it's a legacy run (pre-mode-registry) whose message body isn't
	 *  a Fabrick envelope. Consumers should prefer this over
	 *  `finalSynthesis.text` for rendering — it's typed and version-stable.
	 *  Legacy renderers can fall back to `finalSynthesis.text` when this
	 *  is null but `finalSynthesis` is not. */
	public synthesisPayload: FleetSynthesis | null = $derived.by(() => {
		const m = this.finalSynthesis;
		if (!m) return null;
		return parseSynthesisEnvelope(m.text);
	});

	private socket: WebSocket | null = null;
	private reconcilePending = false;

	constructor(opts: SessionInitOptions & { query?: string; mode?: SessionMode }) {
		this.namespace = opts.namespace;
		this.sessionId = opts.sessionId;
		this.query = opts.query ?? '';
		this.mode = opts.mode ?? 'live';
		this.startedAt = Date.now();

		// Seed initial state from the SSR snapshot.
		for (const agent of opts.initialAgents) {
			this.agents.set(agent.name, agent);
		}
		for (const thread of opts.initialThreads) {
			this.threads.set(thread.id, {
				...thread,
				messages: normalizeMessages(thread.messages),
				unread: 0
			});
		}

		// Archived sessions are read-only — no WS subscription, no
		// reconcile, no archive trigger. The snapshot from the load
		// function is the full and final state.
		if (this.mode === 'archived') {
			this.connected = false;
			this.archived = true;
			return;
		}

		// Only open the WebSocket in the browser. Skip during SSR.
		if (typeof window === 'undefined') return;

		this.socket = new WebSocket(opts.eventsWsUrl);
		this.socket.onopen = () => {
			this.connected = true;
			// Reconcile against the latest /extended snapshot — between
			// the SSR-time snapshot fetch and this WS subscription, the
			// orchestrator may have dispatched and created the research
			// thread. Without this refresh, the client never learns about
			// the thread and silently drops every `thread_message_sent`
			// event that arrives for it.
			void this.reconcileFromSnapshot();
		};
		this.socket.onerror = (ev) => {
			console.error('[session] WS error', ev);
			this.connected = false;
		};
		this.socket.onclose = () => {
			this.connected = false;
		};
		this.socket.onmessage = (ev) => {
			let data: SessionEvent;
			try {
				data = JSON.parse(ev.data) as SessionEvent;
			} catch {
				console.warn('[session] non-JSON WS frame', ev.data);
				return;
			}
			this.applyEvent(data);
		};
	}

	close() {
		this.socket?.close();
		this.socket = null;
	}

	/**
	 * Pull the latest `/extended` snapshot and merge it into local state.
	 * Used right after WS open to close the gap between the SSR snapshot
	 * and the live subscription. Idempotent — only fills in agents we
	 * don't have yet and threads we haven't seen.
	 */
	private async reconcileFromSnapshot(): Promise<void> {
		try {
			const url = `/api/coral/snapshot?namespace=${encodeURIComponent(this.namespace)}&sessionId=${encodeURIComponent(this.sessionId)}`;
			const res = await fetch(url);
			if (!res.ok) return;
			const snap = (await res.json()) as {
				agents?: SessionAgent[];
				threads?: SessionThread[];
			};
			for (const agent of snap.agents ?? []) {
				// Overwrite — server's view of agent status is canonical
				// at the moment of the snapshot. Live WS events resume
				// from here. Always sets a fresh object reference so the
				// keyed `{#each}` over `agents.values()` re-renders.
				this.agents.set(agent.name, { ...agent });
			}
			for (const thread of snap.threads ?? []) {
				const existing = this.threads.get(thread.id);
				if (existing) {
					// Union messages by id rather than blindly replacing —
					// a live WS message (or a self-heal placeholder) we've
					// already applied may not be in this snapshot yet, and we
					// must not lose it. Keep the client's unread counter.
					this.threads.set(thread.id, {
						...thread,
						messages: mergeMessagesById(existing.messages, thread.messages),
						unread: existing.unread
					});
				} else {
					this.threads.set(thread.id, {
						...thread,
						messages: normalizeMessages(thread.messages),
						unread: 0
					});
				}
			}
		} catch (err) {
			console.warn('[session] reconcile failed:', err);
		}
	}

	/** Debounced reconcile trigger. Coalesces bursts of unknown-thread
	 *  events into a single snapshot refetch so a race that drops messages
	 *  self-heals without hammering the snapshot endpoint. */
	private scheduleReconcile(): void {
		if (this.reconcilePending || this.mode === 'archived') return;
		this.reconcilePending = true;
		setTimeout(() => {
			this.reconcilePending = false;
			void this.reconcileFromSnapshot();
		}, 250);
	}

	private applyEvent(data: SessionEvent) {
		// Reactivity contract: every case below MUST set a fresh object
		// reference into the SvelteMap. Mutating a value in place + then
		// `.set(key, sameRef)` doesn't propagate to `{#each agentsList as
		// agent (agent.name)}` consumers because the keyed block sees the
		// same ref + same key and skips re-rendering its bindings. Build
		// new objects on every update. Same rule applies to arrays nested
		// inside (messages, participants).
		switch (data.type) {
			case 'agent_connected': {
				const a = this.agents.get(data.name);
				if (!a) return console.warn('[session] agent_connected for unknown', data.name);
				this.agents.set(data.name, {
					...a,
					status: {
						type: 'running',
						startTime: data.timestamp,
						connectionStatus: { type: 'connected', communicationStatus: { type: 'thinking' } }
					}
				});
				break;
			}
			case 'agent_wait_start': {
				const a = this.agents.get(data.name);
				if (!a) return;
				this.agents.set(data.name, { ...a, status: { type: 'waiting' } });
				break;
			}
			case 'agent_wait_stop': {
				const a = this.agents.get(data.name);
				if (!a) return;
				this.agents.set(data.name, {
					...a,
					status: {
						type: 'running',
						startTime: data.timestamp,
						connectionStatus: { type: 'connected', communicationStatus: { type: 'thinking' } }
					}
				});
				break;
			}
			case 'agent_sleep_start': {
				const a = this.agents.get(data.name);
				if (!a) return;
				this.agents.set(data.name, {
					...a,
					status: {
						type: 'running',
						startTime: data.timestamp,
						connectionStatus: { type: 'connected', communicationStatus: { type: 'sleeping' } }
					}
				});
				break;
			}
			case 'agent_sleep_stop': {
				const a = this.agents.get(data.name);
				if (!a) return;
				this.agents.set(data.name, {
					...a,
					status: {
						type: 'running',
						startTime: data.timestamp,
						connectionStatus: { type: 'connected', communicationStatus: { type: 'thinking' } }
					}
				});
				break;
			}
			case 'runtime_started': {
				const a = this.agents.get(data.name);
				if (!a) return;
				this.agents.set(data.name, {
					...a,
					status: {
						type: 'running',
						startTime: data.timestamp,
						connectionStatus: { type: 'not_connected' }
					}
				});
				break;
			}
			case 'runtime_stopped': {
				const a = this.agents.get(data.name);
				if (!a) return;
				this.agents.set(data.name, { ...a, status: { type: 'stopped' } });
				break;
			}
			case 'thread_created': {
				this.threads.set(data.thread.id, {
					...data.thread,
					messages: normalizeMessages(data.thread.messages),
					unread: data.thread.messages.length
				});
				break;
			}
			case 'thread_message_sent': {
				const incoming = { ...data.message, timestamp: toEpochMs(data.message.timestamp) };
				const t = this.threads.get(incoming.threadId);
				if (!t) {
					// Self-heal instead of dropping. The thread was created
					// after our one-shot WS-open reconcile and we never saw a
					// `thread_created` for it (WS/reconcile race) — previously
					// every message for it was silently discarded, leaving the
					// trace blank while agents worked. Register a placeholder
					// carrying this message so it survives, then reconcile to
					// backfill thread metadata + any earlier missed messages.
					console.warn(
						'[session] thread_message_sent for untracked thread — self-healing via reconcile',
						incoming.threadId
					);
					this.threads.set(incoming.threadId, {
						id: incoming.threadId,
						participants: [],
						messages: [incoming],
						unread: 1
					});
					this.scheduleReconcile();
				} else {
					this.threads.set(t.id, {
						...t,
						messages: [...t.messages, incoming],
						unread: t.unread + 1
					});
				}
				// Synthesis archiving is now owned by the fleet-gateway
				// server-side (it detects the orchestrator's no-mention message
				// in the same stream and archives canonical /extended state,
				// independent of this tab). The client no longer archives.
				break;
			}
			case 'thread_closed': {
				const t = this.threads.get(data.threadId);
				if (!t) return;
				this.threads.set(t.id, {
					...t,
					state: { state: 'closed', summary: data.summary, timestamp: data.timestamp }
				});
				break;
			}
			case 'thread_participant_added': {
				const t = this.threads.get(data.threadId);
				if (!t) return;
				if (t.participants.includes(data.name)) return;
				this.threads.set(t.id, { ...t, participants: [...t.participants, data.name] });
				break;
			}
			case 'thread_participant_removed': {
				const t = this.threads.get(data.threadId);
				if (!t) return;
				this.threads.set(t.id, {
					...t,
					participants: t.participants.filter((p) => p !== data.name)
				});
				break;
			}
			case 'gateway_run_failed': {
				this.failed = { reason: data.reason };
				break;
			}
		}
	}

}
