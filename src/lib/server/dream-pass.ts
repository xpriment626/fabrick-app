/**
 * Dream pass v0 — the curator agent over the archive (design.md §15 + §16).
 *
 * Scope = `(run, on-completion, extract)`: fires once per completed fleet
 * run, naive prose extraction (no typed atoms yet — those arrive with
 * template `memory_atoms`). It writes to the three Stage-0 sinks:
 *
 *   1. `fleet_memory_items` — durable atoms (kind 'dream_item').
 *   2. Mastra working memory — a rolling per-user synthesis blob.
 *   3. `fleet_runs_archive.topic_id` — the derived topic label, backfilled
 *      so Stage-1 topic-scoped reads work without re-dreaming.
 *
 * One LLM call returns all three (topic + atoms + updated synthesis) to
 * keep per-run dream cost to a single round-trip. We use `generateText`
 * + defensive JSON parse rather than `generateObject`/`response_format` —
 * the latter is rejected by Anthropic-via-OpenRouter (checkpoint 2026-05-19).
 *
 * Trigger model: run-triggered, fire-and-forget from the archive path.
 * Failures are logged, never thrown — a dream failure must not fail the
 * archive write. Scheduled/managed dreaming (§16 Stage 2) layers on later.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { resolveOpenrouterKey } from '$lib/server/chat-model';
import { insertMemoryItems } from '$lib/server/fleet-memory';
import { writeWorkingMemory, readWorkingMemory } from '$lib/server/working-memory';
import { setFleetRunTopic, type ArchivedFleetRun } from '$lib/server/libsql';

/** Reasoning model — good at extraction. Same default as chat for now. */
const DREAM_MODEL_ID = 'deepseek/deepseek-v4-pro';

const MAX_SYNTHESIS_CHARS = 6000;
const MAX_PRIOR_WM_CHARS = 4000;
const MAX_ATOMS = 8;

const DREAM_SYSTEM_PROMPT = `You are Fabrick's memory curator — a "dream pass" that runs AFTER a fleet research run completes. Fabrick is a Solana / DeFi research companion.

Your job is NOT to summarize the run. It is to decide what is worth REMEMBERING about this user across future runs, and to maintain a concise rolling synthesis of who they are and what they care about.

You will be given: the user's query, the run's synthesis output, and the user's prior working-memory synthesis (or "(none yet)").

Return STRICT JSON only — no prose, no markdown fences — with exactly this shape:
{
  "topic": "a short kebab-case topic label for this run, e.g. \\"stablecoin-yields\\" or \\"drift-risk-audit\\"",
  "atoms": [
    { "content": "one durable, self-contained fact worth carrying into future runs", "salience": 0.0 }
  ],
  "working_memory": "the FULL updated working-memory synthesis as markdown — merge the prior synthesis with what this run revealed; keep it tight (under ~400 words), drop stale detail, organize by the user's recurring interests"
}

Rules:
- atoms: 0 to ${MAX_ATOMS} items. Only genuinely durable facts (a stated preference, a position, a recurring interest, a risk threshold, a conclusion that will still matter next week). Skip ephemeral price quotes and generic market commentary. salience is 0..1 (how important to remember).
- If the run revealed nothing worth remembering, return an empty atoms array and leave working_memory as the prior synthesis unchanged.
- working_memory is the agent-visible context loaded on every future turn — write it for a teammate, not a log.`;

export type DreamResult = {
	topic: string | null;
	atomsWritten: number;
	workingMemoryUpdated: boolean;
};

type DreamOutput = {
	topic?: unknown;
	atoms?: unknown;
	working_memory?: unknown;
};

/**
 * Run the dream pass over a single archived run. Throws on hard failure —
 * use `triggerDreamPass` for the fire-and-forget archive-path call.
 */
export async function runDreamPass(run: ArchivedFleetRun): Promise<DreamResult> {
	const apiKey = await resolveOpenrouterKey(run.userId);
	const model = createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey }).chat(
		DREAM_MODEL_ID
	);

	const priorWm = (await readWorkingMemory(run.userId)) ?? '(none yet)';
	const synthesis = (run.synthesisText ?? '(no synthesis text)').slice(0, MAX_SYNTHESIS_CHARS);

	const userPrompt = [
		`USER QUERY:\n${run.query}`,
		``,
		`RUN SYNTHESIS:\n${synthesis}`,
		``,
		`PRIOR WORKING MEMORY:\n${priorWm.slice(0, MAX_PRIOR_WM_CHARS)}`
	].join('\n');

	const { text } = await generateText({
		model,
		system: DREAM_SYSTEM_PROMPT,
		prompt: userPrompt
	});

	const parsed = parseDreamOutput(text);
	if (!parsed) {
		throw new Error('dream pass: model did not return parseable JSON');
	}

	const topic = normalizeTopic(parsed.topic);
	const atoms = normalizeAtoms(parsed.atoms);
	const workingMemory = typeof parsed.working_memory === 'string' ? parsed.working_memory.trim() : '';

	// Sink 1: atoms.
	if (atoms.length > 0) {
		await insertMemoryItems(
			atoms.map((a) => ({
				userId: run.userId,
				kind: 'dream_item',
				content: a.content,
				salience: a.salience,
				sourceRunId: run.id,
				templateId: run.templateId,
				topicId: topic
			}))
		);
	}

	// Sink 2: topic backfill on the archive row.
	if (topic) {
		await setFleetRunTopic(run.id, run.userId, topic);
	}

	// Sink 3: working-memory synthesis (only if the model produced a non-empty one).
	let workingMemoryUpdated = false;
	if (workingMemory.length > 0) {
		await writeWorkingMemory(run.userId, workingMemory);
		workingMemoryUpdated = true;
	}

	return { topic, atomsWritten: atoms.length, workingMemoryUpdated };
}

/**
 * Fire-and-forget wrapper for the archive path. Never throws — a dream
 * failure is logged and swallowed so it can't fail the archive write.
 */
export function triggerDreamPass(run: ArchivedFleetRun): void {
	runDreamPass(run)
		.then((r) =>
			console.log(
				`[dream-pass] run ${run.id} (${run.templateId}) → topic=${r.topic ?? '∅'} atoms=${r.atomsWritten} wm=${r.workingMemoryUpdated}`
			)
		)
		.catch((err) =>
			console.warn(
				`[dream-pass] run ${run.id} failed (non-fatal):`,
				err instanceof Error ? err.message : String(err)
			)
		);
}

/* -------------------------------------------------------------------- */

/** Extract the first balanced JSON object from model text (tolerates
 *  ```json fences and leading/trailing prose). */
function parseDreamOutput(text: string): DreamOutput | null {
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) return null;
	try {
		return JSON.parse(text.slice(start, end + 1)) as DreamOutput;
	} catch {
		return null;
	}
}

function normalizeTopic(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const t = raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64);
	return t.length > 0 ? t : null;
}

function normalizeAtoms(raw: unknown): Array<{ content: string; salience: number }> {
	if (!Array.isArray(raw)) return [];
	const out: Array<{ content: string; salience: number }> = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const content = (item as { content?: unknown }).content;
		if (typeof content !== 'string' || content.trim().length === 0) continue;
		const rawSal = (item as { salience?: unknown }).salience;
		let salience = typeof rawSal === 'number' && Number.isFinite(rawSal) ? rawSal : 0.5;
		salience = Math.max(0, Math.min(1, salience));
		out.push({ content: content.trim(), salience });
		if (out.length >= MAX_ATOMS) break;
	}
	return out;
}
