/**
 * Cross-composition registry.
 *
 * Aggregates every composition's public exports into a single surface
 * the worker can dispatch on. Adding a new composition is one import
 * line + one entry in the `compositions` record below. Nothing else in
 * the shared infra needs to change.
 *
 * Two lookups the worker needs:
 *   1. `agentFactories[agentKey]` → which Mastra `Agent` to build.
 *   2. `findCompositionFor(agentKey)` → which composition owns this
 *      agentKey (so the worker knows whether to call the composition's
 *      `runOrchestrator` or the shared specialist loop).
 *
 * `getFleetMode(modeId)` resolves modes globally across compositions —
 * since mode ids are composition-defined but the app dispatches by id,
 * this lookup is composition-aware behind the scenes.
 */

import {
	deepResearchComposition,
	agentFactories as deepResearchFactories
} from '@deep-research/index.js'
import type { FleetMode } from '@shared/fleet-modes-core.js'

/** Every composition's public-export object. Order is registration
 *  order; later additions slot in without re-exporting anything. */
const compositions = {
	'deep-research': deepResearchComposition
	// 'savings-account': savingsAccountComposition,
	// ...
} as const

export type CompositionId = keyof typeof compositions

/**
 * Flat factory map: every composition's agentFactories merged. AgentKey
 * stays globally unique across compositions — if a future composition
 * wants a `researchOrchestrator`-shaped key it must namespace its own.
 * Today: keys are unique by construction (only deep-research is wired).
 */
export const agentFactories = {
	...deepResearchFactories
	// ...savingsAccountFactories,
} as const

export type AgentKey = keyof typeof agentFactories

export function isAgentKey(value: string): value is AgentKey {
	return value in agentFactories
}

/**
 * Find which composition owns a given agentKey. Returns the
 * composition's public-export object, or `null` if the key isn't
 * registered. The worker uses this to decide whether to call the
 * composition's `runOrchestrator` vs the shared specialist loop.
 */
export function findCompositionFor(
	agentKey: AgentKey
): (typeof compositions)[CompositionId] | null {
	for (const composition of Object.values(compositions)) {
		if (agentKey in composition.agentFactories) {
			return composition
		}
	}
	return null
}

/**
 * Resolve a mode id across all compositions. Throws if unknown — modes
 * are user-declared and an unknown one is a clear configuration error.
 */
export function getFleetMode(modeId: string): FleetMode {
	for (const composition of Object.values(compositions)) {
		const modes = composition.modes as Record<string, FleetMode>
		if (modeId in modes) return modes[modeId]
	}
	const known = Object.values(compositions)
		.flatMap((c) => Object.keys(c.modes))
		.join(', ')
	throw new Error(`Unknown fleet mode "${modeId}". Known modes: ${known}`)
}

export function isFleetModeId(value: string): boolean {
	for (const composition of Object.values(compositions)) {
		if (value in composition.modes) return true
	}
	return false
}
