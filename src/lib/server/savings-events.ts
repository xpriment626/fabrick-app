/**
 * Savings behavioral event archive (design.md §19) — the append-only ledger.
 *
 * This is the "table stakes" capture layer: every meaningful savings action
 * lands here, lossless + user-scoped. It is NOT memory — it's the substrate a
 * later refinery/dream pass derives the UserSavingsProfile atoms from. The
 * gold signal is `senior_rerolled` (with its `direction`): revealed preference,
 * captured the moment the user steers, no funding required.
 *
 * Writes via supabaseAdmin + explicit user_id (mirrors savings-accounts); RLS
 * on the table is defense-in-depth.
 */

import { supabaseAdmin } from '$lib/server/supabase';
import type { Json } from '$lib/server/database.types';
import type { SeniorNudge } from '$lib/savings/types';

export type SavingsEventKind =
	| 'senior_proposed'
	| 'senior_rerolled'
	| 'senior_accepted'
	| 'junior_created';

export type SavingsEventRecord = {
	id: string;
	kind: SavingsEventKind;
	direction: SeniorNudge | null;
	accountId: string | null;
	payload: Record<string, unknown>;
	createdAt: string;
};

/** Append a savings event. Best-effort: a logging failure must never break the
 *  user flow, so errors are swallowed (warned) rather than thrown. */
export async function logSavingsEvent(args: {
	userId: string;
	kind: SavingsEventKind;
	direction?: SeniorNudge | null;
	accountId?: string | null;
	payload?: Record<string, unknown>;
}): Promise<void> {
	const res = await supabaseAdmin.from('savings_events').insert({
		user_id: args.userId,
		kind: args.kind,
		direction: args.direction ?? null,
		account_id: args.accountId ?? null,
		payload: (args.payload as Json) ?? {}
	});
	if (res.error) console.warn('[savings-events] log failed:', res.error.message);
}

/** A user's savings events, oldest-first (the chronological behavioral trail). */
export async function listSavingsEvents(userId: string): Promise<SavingsEventRecord[]> {
	const res = await supabaseAdmin
		.from('savings_events')
		.select('id, kind, direction, account_id, payload, created_at')
		.eq('user_id', userId)
		.order('created_at', { ascending: true });
	if (res.error) throw new Error(`listSavingsEvents: ${res.error.message}`);
	return (res.data ?? []).map((r) => ({
		id: r.id,
		kind: r.kind as SavingsEventKind,
		direction: (r.direction as SeniorNudge | null) ?? null,
		accountId: r.account_id,
		payload: (r.payload as Record<string, unknown>) ?? {},
		createdAt: r.created_at
	}));
}
