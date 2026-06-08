import type { SavingsAccountType } from './types';

export type LegacySavingsAccountType = 'junior' | 'senior';
export type SavingsAccountTypeInput = SavingsAccountType | LegacySavingsAccountType | string;

const DEFAULT_ACCOUNT_NAME = 'Savings account';
const DEFAULT_POOL_NAME = 'this pool';

export function normalizeSavingsAccountType(type: SavingsAccountTypeInput): SavingsAccountType {
	if (type === 'advanced' || type === 'senior') return 'advanced';
	return 'simple';
}

export function storageSavingsAccountType(type: SavingsAccountType): LegacySavingsAccountType {
	return type === 'advanced' ? 'senior' : 'junior';
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

export type AccountCloseBlock = {
	depositedUsd: number;
	poolName: string;
	message: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function numericValue(value: unknown): number {
	const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function accountDepositedUsd(config: Record<string, unknown> | null | undefined): number {
	const direct =
		numericValue(config?.depositedUsd) ||
		numericValue(config?.depositUsd) ||
		numericValue(config?.balanceUsd);
	if (direct > 0) return direct;

	const deposit = asRecord(config?.deposit);
	const nestedDeposit =
		numericValue(deposit?.depositedUsd) ||
		numericValue(deposit?.depositUsd) ||
		numericValue(deposit?.balanceUsd);
	if (nestedDeposit > 0) return nestedDeposit;

	const balance = asRecord(config?.balance);
	return (
		numericValue(balance?.depositedUsd) ||
		numericValue(balance?.depositUsd) ||
		numericValue(balance?.balanceUsd)
	);
}

function poolNameFromConfig(config: Record<string, unknown> | null | undefined): string {
	const pool = asRecord(config?.poolSnapshot);
	const title = typeof pool?.title === 'string' ? pool.title.trim() : '';
	if (title) return title;

	const poolName = typeof config?.poolName === 'string' ? config.poolName.trim() : '';
	if (poolName) return poolName;

	return DEFAULT_POOL_NAME;
}

function usd(amount: number): string {
	return `$${amount.toLocaleString(undefined, {
		maximumFractionDigits: 2,
		minimumFractionDigits: 2
	})}`;
}

export function accountCloseBlock(
	config: Record<string, unknown> | null | undefined
): AccountCloseBlock | null {
	const depositedUsd = accountDepositedUsd(config);
	if (depositedUsd <= 0) return null;

	const poolName = poolNameFromConfig(config);
	return {
		depositedUsd,
		poolName,
		message: `You have ${usd(depositedUsd)} deposited into ${poolName}. Redeem your deposit first before closing the account.`
	};
}
