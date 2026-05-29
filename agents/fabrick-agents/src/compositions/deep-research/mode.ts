/**
 * Deep-research composition — mode entry.
 *
 * Declares the `research` FleetMode (synthesis schema + specialist
 * roster + prompt-suffix + renderer id) the composition contributes to
 * the cross-composition fleet-modes registry. Adding more research-flavor
 * modes (e.g. a `deep-research-strict-synthesis` variant) means another
 * entry in this file. Adding an entirely different *composition*
 * (savings-account, etc.) means a sibling dir with its own `mode.ts`.
 */

import { fleetSynthesisSchema, type FleetMode } from '@shared/fleet-modes-core.js'

/**
 * Specialist coral-agent names for the deep-research composition. These
 * MUST match the agent names in the SessionRequest builder
 * (`session-request.ts`) and the `[agent].name` field in each
 * `coral/<name>/coral-agent.toml`.
 */
export const DEEP_RESEARCH_SPECIALISTS = [
	'token-info-agent',
	'defillama-agent',
	'exa-agent',
	'topledger-agent',
	'news-agent',
	'grok-agent'
] as const

export type DeepResearchSpecialist = (typeof DEEP_RESEARCH_SPECIALISTS)[number]

export const researchMode = {
	id: 'research',
	label: 'Research',
	synthesisSchema: fleetSynthesisSchema,
	specialists: DEEP_RESEARCH_SPECIALISTS,
	orchestratorPromptSuffix: '',
	rendererId: 'text'
} as const satisfies FleetMode

/** All modes contributed by this composition. */
export const deepResearchModes = {
	research: researchMode
} as const
