import { agentFactories, isAgentKey, type AgentKey } from './mastra/index.js'
import { coralMcpClient } from './mastra/mcp/coral-mcp-client.js'

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
	// Orchestrator runs ONE generate cycle. To work around two Coral-side
	// rough edges, we wrap the LLM call with deterministic worker-side
	// scaffolding:
	//
	// 1. We pre-create the research thread (with every specialist as a
	//    participant) BEFORE invoking the LLM, and inject the threadId
	//    into the user message. The LLM never needs to call
	//    coral_create_thread, so we sidestep "agent X wasn't a participant
	//    when the orchestrator mentioned them" failures and we know the
	//    threadId deterministically.
	//
	// 2. After generate() returns, we send `result.text` into that thread
	//    via coral_send_message ourselves. Belt-and-suspenders: even if
	//    the LLM forgets, the synthesis lands. This is critical because
	//    Coral's thread.close() deletes all messages on close — without
	//    this, the synthesis can be lost entirely.
	//
	// Specialists declared by the SessionRequest builder
	// (src/lib/server/session-request.ts). Keep in sync.
	const SPECIALISTS = [
		'token-info-agent',
		'defillama-agent',
		'exa-agent',
		'topledger-agent',
		'news-agent',
		'grok-agent'
	]

	if (!coralMcpClient) {
		banner('FATAL: no CORAL_CONNECTION_URL — orchestrator cannot pre-create thread.')
		process.exit(1)
	}

	const userQuery =
		process.env.INITIAL_QUERY ||
		'No initial query was injected — introduce yourself and explain you would normally receive a research question.'
	banner(`User query: ${userQuery}`)

	// listToolsets() returns un-namespaced tools grouped by server. We use
	// the same Mastra Tool objects we'd hand to an Agent, executed
	// directly via their .execute({ context }) method.
	const toolsets = await coralMcpClient.listToolsets()
	const coralTools = toolsets.coral
	if (!coralTools) {
		banner('FATAL: coral toolset missing from MCP client — cannot pre-create thread.')
		process.exit(1)
	}
	const createThreadTool = coralTools.coral_create_thread
	const sendMessageTool = coralTools.coral_send_message
	if (!createThreadTool?.execute || !sendMessageTool?.execute) {
		banner(
			`FATAL: required Coral tools missing or non-executable. Available: ${Object.keys(coralTools).join(', ')}`
		)
		process.exit(1)
	}

	const slug = userQuery.slice(0, 80).replace(/\s+/g, ' ').trim() || 'research-run'
	banner(`Pre-creating thread "${slug}" with ${SPECIALISTS.length} specialists…`)
	// MCP-derived Mastra tools take (inputData, runtimeContext). We pass an
	// empty runtime context — these tools just forward to the underlying
	// MCP client and don't need Mastra-side runtime state.
	// Schema: { threadName: string, participantNames: string[] }
	// Output: { thread: SessionThread } — id is at .thread.id
	const createResult = (await createThreadTool.execute(
		{ threadName: slug, participantNames: SPECIALISTS },
		{} as never
	)) as { thread?: { id?: string } } & Record<string, unknown>

	// Coral's tool result shape varies — accept any of these. Some
	// versions return { id }, some { threadId }, some { thread: { id } }.
	const threadId = createResult?.thread?.id ?? null
	if (!threadId) {
		banner(`FATAL: coral_create_thread returned no id. Raw: ${JSON.stringify(createResult)}`)
		process.exit(1)
	}
	banner(`Thread created: ${threadId}`)

	// Inject the threadId + a clear non-create / non-close directive into
	// the user message. The orchestrator's system prompt also reinforces
	// this, but front-of-conversation grounding is the strongest signal.
	const augmentedUserMessage = `A research thread has been pre-created for this run.

Thread ID: ${threadId}
Participants (already added): ${SPECIALISTS.map((s) => `@${s}`).join(', ')}

Dispatch your sub-questions into this thread by calling coral_send_message with threadId="${threadId}" and the appropriate mentionNames. Do NOT call coral_create_thread (the thread exists). Do NOT call coral_close_thread (closing destroys all messages — leave cleanup to session teardown).

User query: ${userQuery}`

	try {
		const result = await agent.generate(
			[{ role: 'user', content: augmentedUserMessage }],
			{ maxSteps: 50 }
		)
		banner(`Generate finished. Final text length=${result.text?.length ?? 0}`)

		// Belt-and-suspenders: send the synthesis into the thread.
		if (result.text && result.text.trim().length > 0) {
			banner('Sending final synthesis into thread…')
			try {
				// Schema: { threadId: string, content: string, mentions: string[] }
				await sendMessageTool.execute!(
					{
						threadId,
						content: result.text,
						mentions: []
					},
					{} as never
				)
				banner('Synthesis sent.')
			} catch (sendErr) {
				banner(
					`WARN: failed to send synthesis into thread ${threadId}: ${(sendErr as Error).message}`
				)
			}
		} else {
			banner('Generate returned empty text — nothing to land in thread.')
		}

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
