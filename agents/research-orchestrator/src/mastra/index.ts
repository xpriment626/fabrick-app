import { Mastra } from '@mastra/core'
import { researchOrchestrator } from './agents/research-orchestrator.js'

export const mastra = new Mastra({
	agents: { researchOrchestrator }
})
