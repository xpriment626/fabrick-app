import { mastra } from './mastra/index.js'

const agent = mastra.getAgent('researchOrchestrator')

const userQuery =
	process.env.INITIAL_QUERY ||
	'No initial query was injected — introduce yourself and explain you would normally receive a research question.'

const banner = (msg: string) =>
	console.log(`[${new Date().toISOString()}] [research-orchestrator] ${msg}`)

banner(`Booted. Agent ID=${process.env.CORAL_AGENT_ID} Session=${process.env.CORAL_SESSION_ID}`)
banner(`Proxy URL=${process.env.CORAL_PROXY_URL_MAIN ?? '(none — standalone fallback)'}`)
banner(`Model=${process.env.CORAL_PROXY_MODEL_MAIN ?? '(default)'}`)
banner(`User query: ${userQuery}`)

try {
	const result = await agent.generate(
		[
			{
				role: 'user',
				content: `User query: ${userQuery}\n\nFollow your instructions: open a thread, send a single structured response mentioning "user", then finish.`
			}
		],
		{ maxSteps: 12 }
	)
	banner(`Generate finished. Final text length=${result.text?.length ?? 0}`)
} catch (err) {
	banner(`Generate threw: ${(err as Error).message}`)
	console.error(err)
	process.exit(1)
}

process.exit(0)
