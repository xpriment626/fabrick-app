import type { SavingsAccountType } from './types';

export type LegacySavingsAccountType = 'junior' | 'senior';
export type SavingsAccountTypeInput = SavingsAccountType | LegacySavingsAccountType | string;

const DEFAULT_ACCOUNT_NAME = 'Savings account';

export function normalizeSavingsAccountType(type: SavingsAccountTypeInput): SavingsAccountType {
	if (type === 'advanced' || type === 'senior') return 'advanced';
	return 'simple';
}

export function accountModeLabel(type: SavingsAccountTypeInput): string {
	return normalizeSavingsAccountType(type) === 'advanced' ? 'Advanced' : 'Simple';
}

export function accountDisplayName(
	config: { name?: unknown } | null | undefined,
	fallback = DEFAULT_ACCOUNT_NAME
): string {
	const name = typeof config?.name === 'string' ? config.name.trim() : '';
	return name || fallback;
}
