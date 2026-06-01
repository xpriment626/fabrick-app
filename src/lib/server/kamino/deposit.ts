/**
 * Kamino Klend reserve-supply deposit — build + simulate (design.md §20, Slice 1).
 *
 * Builds a real Main-Market reserve-supply deposit transaction via the Kamino
 * SDK (`KaminoAction.buildDepositTxns` — the canonical instruction builder) for
 * a given owner, then SIMULATES it against mainnet (`simulateTransaction`,
 * sigVerify:false, replaceRecentBlockhash:true). It NEVER signs with a real key
 * and NEVER broadcasts — readiness is proven by simulation only (the real
 * deposit is the user's action).
 *
 * Owner is passed as a kit no-op signer (build-only; no private key), so this
 * runs entirely server-side with no custody.
 */

import {
	address,
	appendTransactionMessageInstructions,
	compileTransaction,
	createNoopSigner,
	createSolanaRpc,
	createTransactionMessage,
	getBase64EncodedWireTransaction,
	pipe,
	setTransactionMessageFeePayerSigner,
	setTransactionMessageLifetimeUsingBlockhash
} from '@solana/kit';
import {
	DEFAULT_RECENT_SLOT_DURATION_MS,
	KaminoAction,
	KaminoMarket,
	PROGRAM_ID,
	VanillaObligation
} from '@kamino-finance/klend-sdk';

export type DepositSimResult = {
	/** The deposit tx was constructed (valid Klend reserve-supply ix set). */
	built: boolean;
	ixCount: number;
	/** Simulation error (null = clean simulation). */
	simError: unknown | null;
	/** Klend program was reached during simulation (ix structure is valid). */
	programReached: boolean;
	/** The only blocker is funding (insufficient lamports/tokens) — not a bad ix. */
	fundingRequired: boolean;
	/** Tail of the simulation logs (for evidence). */
	logsTail: string[];
};

const KLEND_PROGRAM = String(PROGRAM_ID);

export async function buildAndSimulateReserveDeposit(opts: {
	rpcUrl: string;
	owner: string;
	market: string;
	reserve: string;
	/** Deposit amount in base units (e.g. "1000000" = 1 USDC). */
	amountBaseUnits: string;
}): Promise<DepositSimResult> {
	const rpc = createSolanaRpc(opts.rpcUrl);

	const market = await KaminoMarket.load(
		rpc,
		address(opts.market),
		DEFAULT_RECENT_SLOT_DURATION_MS,
		PROGRAM_ID,
		true
	);
	if (!market) throw new Error('failed to load Kamino market');

	const owner = createNoopSigner(address(opts.owner));
	const currentSlot = await rpc.getSlot().send();

	const action = await KaminoAction.buildDepositTxns({
		kaminoMarket: market,
		amount: opts.amountBaseUnits,
		reserveAddress: address(opts.reserve),
		owner,
		obligation: new VanillaObligation(PROGRAM_ID),
		useV2Ixs: true,
		scopeRefreshConfig: undefined,
		includeAtaIxs: true,
		currentSlot
	});

	const ixs = [...action.setupIxs, ...action.lendingIxs, ...action.cleanupIxs];

	const { value: blockhash } = await rpc.getLatestBlockhash().send();
	const message = pipe(
		createTransactionMessage({ version: 0 }),
		(m) => setTransactionMessageFeePayerSigner(owner, m),
		(m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
		(m) => appendTransactionMessageInstructions(ixs, m)
	);
	// Compile (not sign) — a no-op signer produces no signature, and simulation
	// runs with sigVerify:false, so empty signature slots are fine.
	const compiled = compileTransaction(message);
	const wire = getBase64EncodedWireTransaction(compiled);

	const sim = await rpc
		.simulateTransaction(wire, {
			sigVerify: false,
			replaceRecentBlockhash: true,
			encoding: 'base64'
		})
		.send();

	const logs = (sim.value.logs ?? []) as string[];
	const simError = sim.value.err ?? null;
	const programReached = logs.some((l) => l.includes(KLEND_PROGRAM));
	const errStr = JSON.stringify(simError ?? '');
	const fundingRequired =
		/insufficient/i.test(errStr) ||
		logs.some((l) => /insufficient (lamports|funds)/i.test(l)) ||
		// InstructionError 1 / custom 0x1 on a token/system ix == not enough balance
		/"InsufficientFundsForRent"|"AccountNotFound"/i.test(errStr);

	return {
		built: ixs.length > 0,
		ixCount: ixs.length,
		simError,
		programReached,
		fundingRequired,
		logsTail: logs.slice(-16)
	};
}
