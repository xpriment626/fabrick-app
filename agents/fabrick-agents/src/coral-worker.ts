import { agentFactories, isAgentKey, type AgentKey } from './mastra/index.js'

const rawKey = process.argv[2]
if (!rawKey) {
	console.error('Usage: coral-worker.ts <agentKey>')
	console.error(
		'  agentKey ∈ { researchOrchestrator, tokenInfoAgent, defillamaAgent, exaAgent, topledgerAgent, newsAgent, grokAgent }'
	)
	process.exit(1)
}
if (!isAgentKey(rawKey)) {
	console.error(`Unknown agentKey "${rawKey}".`)
	process.exit(1)
}
const agentKey: AgentKey = rawKey

const banner = (msg: string) =>
	console.log(`[${new Date().toISOString()}] [${agentKey}] ${msg}`)

banner(
	`Booted. Agent ID=${process.env.CORAL_AGENT_ID} Session=${process.env.CORAL_SESSION_ID}`
)
banner(`Proxy URL=${process.env.CORAL_PROXY_URL_MAIN ?? '(none — standalone fallback)'}`)
banner(`Model=${process.env.CORAL_PROXY_MODEL_MAIN ?? '(default)'}`)

banner('Building agent (lazy factory)…')
const agent = await agentFactories[agentKey]()
banner('Agent ready.')

if (agentKey === 'researchOrchestrator') {
	// Orchestrator runs ONE generate cycle with high maxSteps. The LLM
	// drives dispatch → wait-for-mention → synthesize through tool calls
	// inside that single cycle.
	const userQuery =
		process.env.INITIAL_QUERY ||
		'No initial query was injected — introduce yourself and explain you would normally receive a research question.'

	banner(`User query: ${userQuery}`)

	try {
		const result = await agent.generate(
			[{ role: 'user', content: userQuery }],
			{ maxSteps: 50 }
		)
		banner(`Generate finished. Final text length=${result.text?.length ?? 0}`)
		process.exit(0)
	} catch (err) {
		banner(`Generate threw: ${(err as Error).message}`)
		console.error(err)
		process.exit(1)
	}
}

// Specialist agents: perpetual wait_for_mention loop.
banner('Entering wait_for_mention loop (specialist)')
while (true) {
	try {
		const result = await agent.generate(
			'Call coral_wait_for_mention to receive your next sub-question. Once a message arrives, answer it using your tools, then send a coral_send_message reply into the same thread mentioning the requester. After replying, your turn is complete — return so the loop can restart.',
			{ maxSteps: 25 }
		)
		banner(`Turn complete. Reply length=${result.text?.length ?? 0}`)
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		banner(`Turn errored: ${msg}`)
		await new Promise((r) => setTimeout(r, 3000))
	}
}
