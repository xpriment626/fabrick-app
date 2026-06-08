/**
 * Savings-account persistence (design.md §20, Slice 2).
 *
 * User-scoped CRUD over the Supabase `savings_accounts` table. Reads and
 * writes run server-side via `supabaseAdmin` with explicit `user_id`
 * filtering. RLS is enabled on the table for defense-in-depth, but the app
 * reads/writes as admin + user_id.
 *
 * An account is `simple` (single selected conservative pool) or `advanced`
 * (multi-pool weighted basket with an agent-proposed allocation). Slice 2 is
 * proposal-only: accounts persist with their config + proposed allocation;
 * funding/execution is the deferred signing slice.
 */

import { supabaseAdmin } from '$lib/server/supabase';
import type { Json } from '$lib/server/database.types';
import { normalizeSavingsAccountType } from '$lib/savings/accounts';
import type {
	AllocationDecision,
	SavingsAccountRecord,
	SavingsAccountType,
	SeniorMandate
} from '$lib/savings/types';

function toRecord(row: {
	id: string;
	type: string;
	status: string;
	config: Json;
	proposed_allocation: Json | null;
	created_at: string;
}): SavingsAccountRecord {
	return {
		id: row.id,
		type: normalizeSavingsAccountType(row.type),
		status: row.status,
		config: (row.config as SavingsAccountRecord['config']) ?? {},
		proposedAllocation: (row.proposed_allocation as AllocationDecision | null) ?? null,
		createdAt: row.created_at
	};
}

/** All of a user's savings accounts, newest first. */
export async function listSavingsAccounts(userId: string): Promise<SavingsAccountRecord[]> {
	const res = await supabaseAdmin
		.from('savings_accounts')
		.select('id, type, status, config, proposed_allocation, created_at')
		.eq('user_id', userId)
		.neq('status', 'archived')
		.order('created_at', { ascending: false });
	if (res.error) throw new Error(`listSavingsAccounts: ${res.error.message}`);
	return (res.data ?? []).map(toRecord);
}

/** Create a savings account. For advanced accounts, pass the mandate + proposed allocation. */
export async function createSavingsAccount(args: {
	userId: string;
	type: SavingsAccountType;
	config?: Partial<SeniorMandate> & Record<string, unknown>;
	proposedAllocation?: AllocationDecision | null;
}): Promise<SavingsAccountRecord> {
	const res = await supabaseAdmin
		.from('savings_accounts')
		.insert({
			user_id: args.userId,
			type: args.type,
			status: 'proposed',
			config: (args.config as Json) ?? {},
			proposed_allocation: (args.proposedAllocation as Json | null) ?? null
		})
		.select('id, type, status, config, proposed_allocation, created_at')
		.single();
	if (res.error || !res.data) {
		throw new Error(`createSavingsAccount: ${res.error?.message ?? 'no row returned'}`);
	}
	return toRecord(res.data);
}

/** Fetch a single account (user-scoped). */
export async function getSavingsAccount(
	id: string,
	userId: string
): Promise<SavingsAccountRecord | null> {
	const res = await supabaseAdmin
		.from('savings_accounts')
		.select('id, type, status, config, proposed_allocation, created_at')
		.eq('id', id)
		.eq('user_id', userId)
		.maybeSingle();
	if (res.error) throw new Error(`getSavingsAccount: ${res.error.message}`);
	return res.data ? toRecord(res.data) : null;
}
