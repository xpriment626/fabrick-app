/**
 * Fleet-mode core primitives — composition-agnostic.
 *
 * A "fleet mode" is the user-declared shape of a fleet run: a synthesis
 * schema, the specialist roster the orchestrator dispatches into, and
 * any mode-specific guidance appended to the orchestrator's system
 * prompt. This module defines the SHAPE of a mode + the wire envelope;
 * individual modes (e.g. `research`) live with their composition under
 * `compositions/<name>/mode.ts` and register through
 * `shared/compositions-registry.ts`.
 *
 * Why this split: the envelope + schemas are cross-composition (every
 * mode that ever ships emits a synthesis matching one of the union
 * branches). The mode entries themselves belong to their composition so
 * extraction is a directory move.
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
 * Envelope key used to tag synthesis messages on the wire. The
 * orchestrator handler writes
 * `JSON.stringify({ [FLEET_SYNTHESIS_ENVELOPE_KEY]: synthesis })`
 * as the `coral_send_message` content; clients detect this key on
 * receipt and switch to typed rendering. Messages that don't carry the
 * key are treated as plain text (back-compat with anything else that
 * ever lands in a fleet thread).
 */
export const FLEET_SYNTHESIS_ENVELOPE_KEY = '__fabrick_synthesis__'

/* -------------- mode shape ------------------------------------------- */

export type FleetMode = {
	id: string
	label: string
	/** Zod schema the structuring pass coerces the orchestrator's output into. */
	synthesisSchema: typeof fleetSynthesisSchema
	/**
	 * Specialists this mode dispatches into — coral agent names (the same
	 * strings used in the SessionRequest builder + ~/.coral/agents
	 * symlinks). Composition-defined; the type stays open so different
	 * compositions can declare different rosters without a shared union.
	 */
	specialists: readonly string[]
	/**
	 * Mode-specific guidance appended to the orchestrator's base system
	 * prompt. For default text-research this is empty.
	 */
	orchestratorPromptSuffix: string
	/**
	 * Identifier the app-side renderer registry uses to pick a component
	 * for this mode's synthesis. v0 only has 'text'.
	 */
	rendererId: 'text'
}
