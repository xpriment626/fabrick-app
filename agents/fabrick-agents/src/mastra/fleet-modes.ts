/**
 * Fleet mode registry.
 *
 * A "mode" is the user-declared shape of a fleet run: the synthesis
 * schema, the specialist roster, and any mode-specific guidance
 * appended to the orchestrator's system prompt.
 *
 * v0 ships only `research` (terminal output = `{ type: 'text', body }`,
 * matching today's chat-mode behavior). Adding `dashboard` / `code` /
 * `strategy` / etc. is a registry entry: new schema, new specialist
 * subset, new prompt suffix, new renderer id on the app side. The
 * orchestrator loop, the worker, and the transport are all mode-agnostic.
 *
 * Why this exists at all (vs. letting the LLM pick output shape at
 * runtime): user-declared mode is more predictable for UI affordances,
 * validation, telemetry, and downstream renderer selection. The
 * "what should this fleet produce" question is upstream of the
 * orchestrator's reasoning — the user knows; the model shouldn't have
 * to guess.
 */

import { z } from 'zod'

/* -------------- synthesis envelope ----------------------------------- */

/**
 * Discriminated union of synthesis shapes. v0: text only.
 *
 * The `type` tag is the routing key on the renderer side. Future
 * additions extend the union; older renderers fall through to the
 * `text` branch on unknown types (graceful degradation, not breakage).
 */
export const fleetSynthesisTextSchema = z.object({
	type: z.literal('text'),
	body: z.string().min(1, 'synthesis body must be non-empty')
})

export const fleetSynthesisSchema = z.discriminatedUnion('type', [
	fleetSynthesisTextSchema
	// fleetSynthesisDashboardSchema,
	// fleetSynthesisCodeSchema,
	// fleetSynthesisStrategySchema,
	// ...
])

export type FleetSynthesis = z.infer<typeof fleetSynthesisSchema>

/**
 * Envelope key used to tag synthesis messages on the wire. The worker
 * writes `JSON.stringify({ [FLEET_SYNTHESIS_ENVELOPE_KEY]: synthesis })`
 * as the `coral_send_message` content; clients detect this key on
 * receipt and switch to typed rendering. Messages that don't carry the
 * key are treated as plain text (back-compat with anything else that
 * ever lands in a fleet thread).
 */
export const FLEET_SYNTHESIS_ENVELOPE_KEY = '__fabrick_synthesis__'

/* -------------- mode registry ---------------------------------------- */

/** All specialist names the fleet can include. Subsets per-mode. */
export const ALL_SPECIALISTS = [
	'token-info-agent',
	'defillama-agent',
	'exa-agent',
	'topledger-agent',
	'news-agent',
	'grok-agent'
] as const

export type SpecialistName = (typeof ALL_SPECIALISTS)[number]

export type FleetMode = {
	id: string
	label: string
	/** Zod schema the structuring pass coerces the orchestrator's output into. */
	synthesisSchema: typeof fleetSynthesisSchema
	/** Specialists this mode dispatches into. v0: every mode uses the full roster. */
	specialists: readonly SpecialistName[]
	/**
	 * Mode-specific guidance appended to the orchestrator's base system
	 * prompt. For `research` this is empty (default text-research
	 * behavior). Future modes lean on this to steer the orchestrator
	 * toward their output shape.
	 */
	orchestratorPromptSuffix: string
	/**
	 * Identifier the app-side renderer registry uses to pick a component
	 * for this mode's synthesis. v0 only has 'text'.
	 */
	rendererId: 'text'
}

export const fleetModes = {
	research: {
		id: 'research',
		label: 'Research',
		synthesisSchema: fleetSynthesisSchema,
		specialists: ALL_SPECIALISTS,
		orchestratorPromptSuffix: '',
		rendererId: 'text'
	}
} as const satisfies Record<string, FleetMode>

export type FleetModeId = keyof typeof fleetModes

export function isFleetModeId(value: string): value is FleetModeId {
	return value in fleetModes
}

export function getFleetMode(id: string): FleetMode {
	if (!isFleetModeId(id)) {
		throw new Error(`Unknown fleet mode "${id}". Known modes: ${Object.keys(fleetModes).join(', ')}`)
	}
	return fleetModes[id]
}
