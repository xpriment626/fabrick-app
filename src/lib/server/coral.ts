/**
 * Coral server HTTP client.
 *
 * SvelteKit talks to a coral-server sidecar (default localhost:5555 in dev,
 * coral cloud once we ship). All requests carry `Authorization: Bearer
 * ${CORAL_AUTH_TOKEN}` which must match an entry in coral-server's
 * `auth.keys` config.
 *
 * Endpoints we care about for the v0 first roll:
 *  - POST /api/v1/local/session — spawn a session against our agent graph
 *  - GET  /api/v1/local/session/{namespace}/{sessionId}/extended — initial
 *    state snapshot (used to seed the UI before the WebSocket subscription
 *    catches up; mirrors the coral-console race-condition handling)
 */

import { CORAL_SERVER_URL, CORAL_AUTH_TOKEN } from '$env/static/private';
import type { SessionRequest } from './session-request';

export type CreatedSession = {
	namespace: string;
	sessionId: string;
};

export type ExtendedSession = {
	namespace: string;
	sessionId: string;
	agents: Array<{ name: string; status: string }>;
	threads: Array<{
		id: string;
		name?: string;
		participants: string[];
		messages: Array<{
			id: string;
			threadId: string;
			senderName: string;
			text: string;
			timestamp: number;
			mentionNames: string[];
		}>;
	}>;
};

function authHeaders(): HeadersInit {
	return {
		Authorization: `Bearer ${CORAL_AUTH_TOKEN}`,
		'content-type': 'application/json',
		accept: 'application/json'
	};
}

export async function createSession(req: SessionRequest): Promise<CreatedSession> {
	const url = `${CORAL_SERVER_URL}/api/v1/local/session`;
	const res = await fetch(url, {
		method: 'POST',
		headers: authHeaders(),
		body: JSON.stringify(req)
	});

	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`coral createSession failed (${res.status}): ${body || res.statusText}`);
	}

	const json = (await res.json()) as Partial<CreatedSession> & Record<string, unknown>;
	const namespace = json.namespace ?? (json as { namespaceName?: string }).namespaceName;
	const sessionId = json.sessionId ?? (json as { id?: string }).id;
	if (!namespace || !sessionId) {
		throw new Error(`coral createSession returned unexpected shape: ${JSON.stringify(json)}`);
	}
	return { namespace, sessionId };
}

export async function getExtendedSession(
	namespace: string,
	sessionId: string
): Promise<ExtendedSession> {
	const url = `${CORAL_SERVER_URL}/api/v1/local/session/${encodeURIComponent(namespace)}/${encodeURIComponent(sessionId)}/extended`;
	const res = await fetch(url, { headers: authHeaders() });
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`coral getExtendedSession failed (${res.status}): ${body || res.statusText}`);
	}
	return (await res.json()) as ExtendedSession;
}

/**
 * Build the browser-side WebSocket URL for a session's live event stream.
 * Returns `ws://...` when CORAL_SERVER_URL is `http://...`, and `wss://...`
 * for `https://...`. Includes the bearer token via the tokenized variant
 * because browser WebSocket clients can't set Authorization headers.
 */
export function sessionEventsWsUrl(namespace: string, sessionId: string): string {
	const httpUrl = new URL(CORAL_SERVER_URL);
	const wsProtocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
	const base = `${wsProtocol}//${httpUrl.host}`;
	return `${base}/ws/v1/events/${encodeURIComponent(CORAL_AUTH_TOKEN)}/session/${encodeURIComponent(namespace)}/${encodeURIComponent(sessionId)}`;
}
