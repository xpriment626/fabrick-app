/**
 * SvelteKit-side LLM client for the bare-bones chat agent.
 *
 * Distinct from `agents/fabrick-agents/src/mastra/model.ts` because that
 * one runs inside the Mastra agent processes spawned by Coral; it speaks
 * to whatever proxy Coral injects via env. This one is the in-process
 * default chat agent — direct to OpenRouter, no Coral proxy in the
 * middle.
 *
 * Per-user BYOK (decrypting the user's OpenRouter key from Supabase) is
 * future work (design.md §3.5.b). For now we use the env's
 * OPENROUTER_API_KEY for every request.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { OPENROUTER_API_KEY } from '$env/static/private';

if (!OPENROUTER_API_KEY) {
	throw new Error('OPENROUTER_API_KEY is not set');
}

const openrouter = createOpenAI({
	baseURL: 'https://openrouter.ai/api/v1',
	apiKey: OPENROUTER_API_KEY
});

/** Default chat model — Claude Sonnet 4.6 for conversational quality. */
export const CHAT_MODEL_ID = 'anthropic/claude-sonnet-4.6';

/** Fast/cheap model for utility calls like title generation. */
export const TITLE_MODEL_ID = 'openai/gpt-5.4-mini';

export function chatModel() {
	// .chat() forces the OpenAI Chat Completions API shape. OpenRouter
	// rejects the newer /responses path that AI SDK v2 defaults to —
	// same reason model.ts in fabrick-agents uses .chat() too.
	return openrouter.chat(CHAT_MODEL_ID);
}

export function titleModel() {
	return openrouter.chat(TITLE_MODEL_ID);
}

export const CHAT_SYSTEM_PROMPT = `You are the Fabrick assistant — a quiet, capable research companion for Solana ecosystem questions, DeFi positions, token research, and adjacent crypto context.

Style:
- Tight prose. No filler. No "I'd be happy to help…" preamble.
- Quantitative wherever possible (numbers, dates, named entities).
- Honest about uncertainty. Surface contradictions instead of papering over them.
- The audience is a sophisticated DeFi operator who can handle structure and numbers.

Scope of this chat mode:
- You have no live tools right now — answer from training/context only. If the user asks for live data (current prices, current TVL, breaking news, on-chain positions), say so honestly and tell them the Fleet mode toggle will hand off to specialists who can pull live data.
- Don't fabricate numbers. If you don't know, say you don't know.`;
