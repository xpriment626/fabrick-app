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
	| { type: 'thread_participant_removed'; threadId: string; name: string; timestamp: string };

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
	public agents: SvelteMap<string, SessionAgent> = new SvelteMap();
	public threads: SvelteMap<string, SessionThread> = new SvelteMap();
	public archived = $state(false);

	private socket: WebSocket | null = null;
	private archiving = false;

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
	 * Push the current full state to the Turso archive. Fired once,
	 * the moment the orchestrator's final synthesis lands. The server
	 * endpoint is idempotent on (user_id, session_id) — retries are
	 * safe — but we still gate on `archived`/`archiving` to avoid
	 * redundant HTTP calls.
	 */
	private async archiveRun(): Promise<void> {
		if (this.mode === 'archived' || this.archived || this.archiving) return;
		this.archiving = true;
		try {
			const synthesis = this.finalSynthesis;
			const body = {
				namespace: this.namespace,
				sessionId: this.sessionId,
				query: this.query,
				synthesisText: synthesis?.text ?? null,
				trace: {
					agents: Array.from(this.agents.values()),
					threads: Array.from(this.threads.values()).map((t) => ({
						id: t.id,
						name: t.name,
						participants: t.participants,
						messages: t.messages,
						state: t.state,
						timestamp: t.timestamp
					}))
				},
				startedAt: this.startedAt
			};
			const res = await fetch('/api/fleet/archive', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				console.warn('[session] archive failed:', res.status, txt);
				return;
			}
			this.archived = true;
		} catch (err) {
			console.warn('[session] archive error:', err);
		} finally {
			this.archiving = false;
		}
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
				const existing = this.agents.get(agent.name);
				// Overwrite — server's view of agent status is canonical
				// at the moment of the snapshot. Live WS events resume from here.
				this.agents.set(agent.name, { ...agent });
				if (!existing) continue;
			}
			for (const thread of snap.threads ?? []) {
				const existing = this.threads.get(thread.id);
				if (existing) {
					// Merge: keep client's unread counter, replace
					// authoritative fields (messages, participants, state).
					this.threads.set(thread.id, {
						...thread,
						messages: thread.messages ?? [],
						unread: existing.unread
					});
				} else {
					this.threads.set(thread.id, {
						...thread,
						messages: thread.messages ?? [],
						unread: 0
					});
				}
			}
		} catch (err) {
			console.warn('[session] reconcile failed:', err);
		}
	}

	private applyEvent(data: SessionEvent) {
		switch (data.type) {
			case 'agent_connected': {
				const a = this.agents.get(data.name);
				if (!a) return console.warn('[session] agent_connected for unknown', data.name);
				a.status = {
					type: 'running',
					startTime: data.timestamp,
					connectionStatus: { type: 'connected', communicationStatus: { type: 'thinking' } }
				};
				this.agents.set(data.name, a);
				break;
			}
			case 'agent_wait_start': {
				const a = this.agents.get(data.name);
				if (!a) return;
				a.status = { type: 'waiting' };
				this.agents.set(data.name, a);
				break;
			}
			case 'agent_wait_stop': {
				const a = this.agents.get(data.name);
				if (!a) return;
				a.status = {
					type: 'running',
					startTime: data.timestamp,
					connectionStatus: { type: 'connected', communicationStatus: { type: 'thinking' } }
				};
				this.agents.set(data.name, a);
				break;
			}
			case 'agent_sleep_start': {
				const a = this.agents.get(data.name);
				if (!a) return;
				a.status = {
					type: 'running',
					startTime: data.timestamp,
					connectionStatus: { type: 'connected', communicationStatus: { type: 'sleeping' } }
				};
				this.agents.set(data.name, a);
				break;
			}
			case 'agent_sleep_stop': {
				const a = this.agents.get(data.name);
				if (!a) return;
				a.status = {
					type: 'running',
					startTime: data.timestamp,
					connectionStatus: { type: 'connected', communicationStatus: { type: 'thinking' } }
				};
				this.agents.set(data.name, a);
				break;
			}
			case 'runtime_started': {
				const a = this.agents.get(data.name);
				if (!a) return;
				a.status = {
					type: 'running',
					startTime: data.timestamp,
					connectionStatus: { type: 'not_connected' }
				};
				this.agents.set(data.name, a);
				break;
			}
			case 'runtime_stopped': {
				const a = this.agents.get(data.name);
				if (!a) return;
				a.status = { type: 'stopped' };
				this.agents.set(data.name, a);
				break;
			}
			case 'thread_created': {
				this.threads.set(data.thread.id, {
					...data.thread,
					unread: data.thread.messages.length
				});
				break;
			}
			case 'thread_message_sent': {
				const t = this.threads.get(data.message.threadId);
				if (!t) {
					console.warn(
						'[session] thread_message_sent for unknown thread',
						data.message.threadId
					);
					return;
				}
				t.messages = [...t.messages, data.message];
				t.unread += 1;
				this.threads.set(t.id, t);
				// Orchestrator + no mentions = the final synthesis. Fire
				// the archive call once. The endpoint is idempotent on
				// session_id, so we don't strictly need to gate on
				// `archived`, but skipping the redundant request is free.
				if (
					data.message.senderName === 'research-orchestrator' &&
					data.message.mentionNames.length === 0 &&
					!this.archived &&
					!this.archiving
				) {
					void this.archiveRun();
				}
				break;
			}
			case 'thread_closed': {
				const t = this.threads.get(data.threadId);
				if (!t) return;
				t.state = { state: 'closed', summary: data.summary, timestamp: data.timestamp };
				this.threads.set(t.id, t);
				break;
			}
			case 'thread_participant_added': {
				const t = this.threads.get(data.threadId);
				if (!t) return;
				if (!t.participants.includes(data.name)) {
					t.participants = [...t.participants, data.name];
					this.threads.set(t.id, t);
				}
				break;
			}
			case 'thread_participant_removed': {
				const t = this.threads.get(data.threadId);
				if (!t) return;
				t.participants = t.participants.filter((p) => p !== data.name);
				this.threads.set(t.id, t);
				break;
			}
		}
	}

	/** Convenience: every thread message across all threads, ordered by timestamp asc. */
	get allMessages(): ThreadMessage[] {
		const all: ThreadMessage[] = [];
		for (const t of this.threads.values()) {
			for (const m of t.messages) all.push(m);
		}
		all.sort((a, b) => a.timestamp - b.timestamp);
		return all;
	}

	/** The final-synthesis convention: orchestrator message with empty mentions. */
	get finalSynthesis(): ThreadMessage | null {
		const all = this.allMessages;
		for (let i = all.length - 1; i >= 0; i--) {
			const m = all[i];
			if (m && m.senderName === 'research-orchestrator' && m.mentionNames.length === 0) {
				return m;
			}
		}
		return null;
	}
}
