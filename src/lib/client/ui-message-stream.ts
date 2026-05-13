/**
 * Parses AI SDK v2's UI message stream wire format from a fetch
 * Response body into an async iterator of accumulated UIMessage
 * snapshots. Each yielded value is the FULL message state at that
 * point — the consumer just replaces its local state.
 *
 * The wire protocol is text/event-stream with `data: <JSON>` lines
 * carrying `UIMessageChunk` objects. We feed those parsed chunks into
 * AI SDK's `readUIMessageStream` which handles the assembly logic
 * (text deltas, tool state transitions, etc.).
 */

import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';

export type AccumulatingUIMessage = UIMessage & {
	/** Stable id assigned by the server (start event), if any. */
	id: string;
};

/**
 * Yield successive UIMessage states from a Response body. The async
 * iterator completes when the upstream stream closes.
 */
export async function* readUIMessages(body: ReadableStream<Uint8Array>) {
	const chunkStream = bytesToChunks(body);
	for await (const message of readUIMessageStream({ stream: chunkStream })) {
		yield message;
	}
}

/**
 * Bytes → SSE text frames → parsed UIMessageChunk JSON objects.
 *
 * SSE frames are separated by blank lines (`\n\n`). Each frame has
 * one or more `data: <json>` lines. We concatenate all data lines
 * within a frame, parse the JSON, and emit the chunk downstream.
 */
function bytesToChunks(
	body: ReadableStream<Uint8Array>
): ReadableStream<UIMessageChunk> {
	// TextDecoderStream's lib.dom typing predates Uint8Array<ArrayBufferLike>;
	// cast through unknown to silence the variance error. The runtime
	// behavior is fine — TextDecoderStream accepts any BufferSource.
	const decoder = new TextDecoderStream() as unknown as ReadableWritablePair<
		string,
		Uint8Array<ArrayBufferLike>
	>;
	const reader = body.pipeThrough(decoder).getReader();
	let buffer = '';

	return new ReadableStream<UIMessageChunk>({
		async pull(controller) {
			while (true) {
				const { value, done } = await reader.read();
				if (done) {
					// Flush any final frame still in the buffer.
					const tail = buffer.trim();
					if (tail) {
						const chunk = parseSseFrame(tail);
						if (chunk) controller.enqueue(chunk);
					}
					controller.close();
					return;
				}
				buffer += value;
				const frames = buffer.split('\n\n');
				// All frames except the last are complete; the last is
				// an incomplete remainder that we keep for the next read.
				buffer = frames.pop() ?? '';
				let emitted = false;
				for (const frame of frames) {
					if (!frame.trim()) continue;
					const chunk = parseSseFrame(frame);
					if (chunk) {
						controller.enqueue(chunk);
						emitted = true;
					}
				}
				if (emitted) return; // backpressure: yield to caller
			}
		},
		cancel(reason) {
			void reader.cancel(reason);
		}
	});
}

function parseSseFrame(frame: string): UIMessageChunk | null {
	const lines = frame.split('\n');
	const dataParts: string[] = [];
	for (const line of lines) {
		if (line.startsWith('data:')) {
			dataParts.push(line.slice(5).replace(/^ /, ''));
		}
	}
	const payload = dataParts.join('\n').trim();
	if (!payload) return null;
	try {
		return JSON.parse(payload) as UIMessageChunk;
	} catch {
		return null;
	}
}
