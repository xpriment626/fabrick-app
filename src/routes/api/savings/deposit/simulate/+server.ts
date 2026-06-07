/**
 * POST /api/savings/deposit/simulate — build + simulate a Klend reserve-supply
 * deposit for the authed user's wallet (design.md §20, Slice 1).
 *
 * Builds the real Kamino deposit transaction (KaminoAction) for the connected
 * wallet and simulates it against mainnet — NEVER signs, NEVER broadcasts. The
 * actual deposit is the user's action; this only proves readiness.
 *
 * Body: { reserve, market, asset: 'USDC', amount: string }
 * Response: { ok, built, ixCount, needsFunding, message, simError? }
 */

import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { buildAndSimulateReserveDeposit } from '$lib/server/kamino/deposit';
import { depositSimulationPayload } from '$lib/server/savings-event-payloads';
import { logSavingsEvent } from '$lib/server/savings-events';

const DECIMALS: Record<string, number> = { USDC: 6 };

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'sign in required');
	const userId = locals.user.id;
	const owner = locals.user.solanaAddress;
	if (!owner) throw error(400, 'no wallet provisioned');

	const heliusKey = env.HELIUS_API_KEY;
	if (!heliusKey) throw error(500, 'HELIUS_API_KEY not set');
	const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;

	let body: {
		reserve?: string;
		market?: string;
		asset?: string;
		amount?: string;
		opportunityId?: string;
	} = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'expected JSON body');
	}
	const { reserve, market, asset, amount } = body;
	if (!reserve || !market || !asset) throw error(400, 'reserve, market, asset required');
	const opportunityId = body.opportunityId?.trim() || `kamino:${market}:${reserve}`;

	const savingsAsset = asset === 'USDC' ? asset : null;
	if (!savingsAsset) throw error(400, `unsupported asset ${asset}`);
	const dec = DECIMALS[savingsAsset];
	const amt = Math.floor(parseFloat(amount ?? '0') * 10 ** dec);
	if (!Number.isFinite(amt) || amt <= 0) throw error(400, 'amount must be a positive number');

	try {
		const r = await buildAndSimulateReserveDeposit({
			rpcUrl,
			owner,
			market,
			reserve,
			amountBaseUnits: String(amt)
		});

		if (r.simError === null) {
			await logSavingsEvent({
				userId,
				kind: 'deposit_simulated',
				payload: depositSimulationPayload({
					opportunityId,
					asset: savingsAsset,
					amount: amount ?? '0',
					status: 'ready',
					built: r.built,
					ixCount: r.ixCount,
					needsFunding: false
				})
			});
			return json({
				ok: true,
				built: r.built,
				ixCount: r.ixCount,
				needsFunding: false,
				message: `Deposit simulated successfully on Kamino mainnet — ready to deposit ${amount} ${asset}.`
			});
		}

		if (r.built && r.fundingRequired) {
			// The instruction set is valid; the only blocker is the empty wallet.
			await logSavingsEvent({
				userId,
				kind: 'deposit_simulated',
				payload: depositSimulationPayload({
					opportunityId,
					asset: savingsAsset,
					amount: amount ?? '0',
					status: 'needs_funding',
					built: true,
					ixCount: r.ixCount,
					needsFunding: true,
					simError: r.simError
				})
			});
			return json({
				ok: false,
				built: true,
				ixCount: r.ixCount,
				needsFunding: true,
				simError: r.simError,
				message: `Deposit transaction built + validated (${r.ixCount} instructions). This wallet is empty on mainnet — fund it with ~${amount} ${asset} + ~0.03 SOL (fees + one-time account rent), then deposit. The deposit instruction itself is correctly constructed.`
			});
		}

		await logSavingsEvent({
			userId,
			kind: 'deposit_simulated',
			payload: depositSimulationPayload({
				opportunityId,
				asset: savingsAsset,
				amount: amount ?? '0',
				status: 'simulation_error',
				built: r.built,
				ixCount: r.ixCount,
				needsFunding: false,
				simError: r.simError
			})
		});
		return json({
			ok: false,
			built: r.built,
			ixCount: r.ixCount,
			needsFunding: false,
			simError: r.simError,
			message: `Simulation returned an error: ${JSON.stringify(r.simError)}`
		});
	} catch (err) {
		console.warn('[savings/deposit/simulate] failed:', err);
		await logSavingsEvent({
			userId,
			kind: 'deposit_simulated',
			payload: depositSimulationPayload({
				opportunityId,
				asset: savingsAsset,
				amount: amount ?? '0',
				status: 'build_error',
				built: false,
				needsFunding: false,
				simError: err instanceof Error ? err.message : String(err)
			})
		});
		return json(
			{ ok: false, built: false, message: err instanceof Error ? err.message : String(err) },
			{ status: 200 }
		);
	}
};
