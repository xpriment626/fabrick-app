import assert from 'node:assert/strict';
import test from 'node:test';

import {
	accountDisplayName,
	accountModeLabel,
	normalizeSavingsAccountType
} from './accounts';

test('normalizeSavingsAccountType maps legacy account modes to Simple and Advanced', () => {
	assert.equal(normalizeSavingsAccountType('simple'), 'simple');
	assert.equal(normalizeSavingsAccountType('advanced'), 'advanced');
	assert.equal(normalizeSavingsAccountType('junior'), 'simple');
	assert.equal(normalizeSavingsAccountType('senior'), 'advanced');
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
