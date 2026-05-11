import { createOpenAI } from '@ai-sdk/openai'

/**
 * Build the AI SDK language model for an agent.
 *
 * Under Coral, each agent process receives `CORAL_PROXY_URL_<NAME>` and
 * `CORAL_PROXY_MODEL_<NAME>` env vars from the coral-agent.toml
 * `[[llm.proxies]]` declaration. We always use the `MAIN` proxy and force
 * the OpenAI Chat Completions API (`.chat()`) — OpenRouter and Coral
 * Cloud's hosted OpenAI proxy both reject the newer `/responses` shape
 * that `@ai-sdk/openai` v2 defaults to.
 *
 * In standalone (non-Coral) runs the proxy env is absent and we fall back
 * to direct OpenRouter with the local OPENROUTER_API_KEY.
 */
export function buildModel(modelOverride?: string) {
	const proxyUrl = process.env.CORAL_PROXY_URL_MAIN
	const proxyModel = process.env.CORAL_PROXY_MODEL_MAIN ?? 'gpt-5.4-mini'
	const modelName = modelOverride ?? proxyModel

	if (proxyUrl) {
		return createOpenAI({ baseURL: proxyUrl, apiKey: 'via-coral-proxy' }).chat(modelName)
	}

	return createOpenAI({
		baseURL: 'https://openrouter.ai/api/v1',
		apiKey: process.env.OPENROUTER_API_KEY ?? ''
	}).chat(modelName)
}
