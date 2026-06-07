export type DepositSimulationStatus =
	| 'ready'
	| 'needs_funding'
	| 'simulation_error'
	| 'build_error';

export function depositSimulationPayload(args: {
	opportunityId: string;
	asset: 'USDC';
	amount: string;
	status: DepositSimulationStatus;
	built: boolean;
	ixCount?: number;
	needsFunding?: boolean;
	simError?: unknown;
}): Record<string, unknown> {
	return {
		opportunityId: args.opportunityId,
		asset: args.asset,
		amount: args.amount,
		status: args.status,
		built: args.built,
		ixCount: args.ixCount ?? 0,
		needsFunding: args.needsFunding ?? false,
		simError: args.simError ?? null
	};
}
