import assert from 'node:assert/strict';
import test from 'node:test';

import {
	accountDisplayName,
	accountCloseBlock,
	accountDepositedUsd,
	accountModeLabel,
	normalizeSavingsAccountType,
	storageSavingsAccountType
} from './accounts';

test('normalizeSavingsAccountType maps legacy account modes to Simple and Advanced', () => {
	assert.equal(normalizeSavingsAccountType('simple'), 'simple');
	assert.equal(normalizeSavingsAccountType('advanced'), 'advanced');
	assert.equal(normalizeSavingsAccountType('junior'), 'simple');
	assert.equal(normalizeSavingsAccountType('senior'), 'advanced');
});

test('storageSavingsAccountType keeps writes compatible with the existing database constraint', () => {
	assert.equal(storageSavingsAccountType('simple'), 'junior');
	assert.equal(storageSavingsAccountType('advanced'), 'senior');
});

test('accountDisplayName prefers user-provided account names', () => {
	assert.equal(accountDisplayName({ name: 'Vacation' }), 'Vacation');
	assert.equal(accountDisplayName({ name: '  College  ' }), 'College');
	assert.equal(accountDisplayName({}, 'Emergency fund'), 'Emergency fund');
});

test('accountModeLabel exposes customer-facing Simple and Advanced labels', () => {
	assert.equal(accountModeLabel('simple'), 'Simple');
	assert.equal(accountModeLabel('advanced'), 'Advanced');
});

test('accountDepositedUsd treats accounts without deposits as closable', () => {
	assert.equal(accountDepositedUsd({}), 0);
	assert.equal(accountDepositedUsd({ depositedUsd: 0 }), 0);
	assert.equal(accountCloseBlock({ name: 'Vacation' }), null);
});

test('accountCloseBlock asks the user to redeem deposits before closing', () => {
	assert.deepEqual(
		accountCloseBlock({
			name: 'Vacation',
			depositedUsd: 125.5,
			poolSnapshot: { title: 'USDC Main Market' }
		}),
		{
			depositedUsd: 125.5,
			poolName: 'USDC Main Market',
			message:
				'You have $125.50 deposited into USDC Main Market. Redeem your deposit first before closing the account.'
		}
	);
});

test('accountDepositedUsd reads nested deposit balance snapshots', () => {
	assert.equal(accountDepositedUsd({ deposit: { depositedUsd: 42 } }), 42);
	assert.equal(accountDepositedUsd({ balance: { depositedUsd: '12.75' } }), 12.75);
	assert.equal(accountDepositedUsd({ balanceUsd: 'not-a-number' }), 0);
});
