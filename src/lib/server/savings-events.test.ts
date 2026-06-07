import assert from 'node:assert/strict';
import test from 'node:test';
import { depositSimulationPayload } from './savings-event-payloads';

test('depositSimulationPayload records USDC simulation outcome signals', () => {
	const payload = depositSimulationPayload({
		opportunityId: 'kamino:lend:main-usdc',
		asset: 'USDC',
		amount: '25',
		status: 'needs_funding',
		built: true,
		ixCount: 6,
		needsFunding: true,
		simError: { InstructionError: [0, 'InsufficientFunds'] }
	});

	assert.deepEqual(payload, {
		opportunityId: 'kamino:lend:main-usdc',
		asset: 'USDC',
		amount: '25',
		status: 'needs_funding',
		built: true,
		ixCount: 6,
		needsFunding: true,
		simError: { InstructionError: [0, 'InsufficientFunds'] }
	});
});
