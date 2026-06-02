/**
 * Savings agent model builder (design.md §18) — the runtime seam.
 *
 * Dual-mode, mirroring `agents/fabrick-agents/src/shared/model.ts`: in-process
 * it uses the request's OpenRouter key (BYOK) directly; under Coral it would
 * use the per-agent proxy Coral injects via `CORAL_PROXY_URL_MAIN`. So the
 * agent code is runtime-agnostic — the same agents run in-process today and in
 * a Coral fleet after graduation, unchanged.
 *
 * `.chat()` forces the OpenAI Chat Completions shape — OpenRouter + Coral's
 * hosted proxy both reject AI SDK v2's default `/responses` path.
 */

import { createOpenAI } from '@ai-sdk/openai';

/** Fast, non-reasoning model — responsive for the live "generation experience".
 *  (The chat default is a reasoning model; too slow + less reliable for the
 *  structured output here.) */
export const SAVINGS_MODEL_ID = 'openai/gpt-5.4-mini';

export function buildSavingsModel(apiKey: string, modelOverride?: string) {
	const proxyUrl = process.env.CORAL_PROXY_URL_MAIN;
	const modelName = modelOverride ?? process.env.CORAL_PROXY_MODEL_MAIN ?? SAVINGS_MODEL_ID;

	if (proxyUrl) {
		return createOpenAI({ baseURL: proxyUrl, apiKey: 'via-coral-proxy' }).chat(modelName);
	}
	return createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey }).chat(modelName);
}

export type SavingsModel = ReturnType<typeof buildSavingsModel>;
