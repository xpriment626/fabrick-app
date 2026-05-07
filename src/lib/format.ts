/**
 * Display formatters. Client-safe (no `$env` imports), shared across
 * server loaders and Svelte components.
 */

/** Truncate a Solana base58 address: `GThU····6vbLQ`. */
export function truncateAddress(address: string, head = 4, tail = 4): string {
	if (address.length <= head + tail) return address;
	return `${address.slice(0, head)}····${address.slice(-tail)}`;
}

/**
 * Format a USD price for display. Adapts decimal precision based on
 * magnitude so $0.0042 stays readable while $187 doesn't carry trailing
 * zeros.
 */
export function formatUsdPrice(value: number): string {
	if (!Number.isFinite(value)) return '$—';
	if (value === 0) return '$0.00';
	const abs = Math.abs(value);
	let fractionDigits: number;
	if (abs >= 1000) fractionDigits = 0;
	else if (abs >= 1) fractionDigits = 2;
	else if (abs >= 0.01) fractionDigits = 4;
	else fractionDigits = 6;
	return `$${value.toLocaleString('en-US', {
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits
	})}`;
}

/** Format a USD total (balance, TVL) with thousands separators + 2 dp. */
export function formatUsdTotal(value: number): string {
	if (!Number.isFinite(value)) return '$—';
	return `$${value.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})}`;
}

/** Format a TVL number compactly: `$1.45B`, `$928M`, `$4.2K`. */
export function formatUsdCompact(value: number): string {
	if (!Number.isFinite(value)) return '$—';
	const abs = Math.abs(value);
	const sign = value < 0 ? '-' : '';
	if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
	if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
	if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
	return `${sign}$${abs.toFixed(2)}`;
}

/** Format a token amount with the symbol suffix: `12.4082 SOL`. */
export function formatTokenAmount(amount: number, symbol: string, maxDecimals = 4): string {
	if (!Number.isFinite(amount)) return `0 ${symbol}`;
	const abs = Math.abs(amount);
	let decimals: number;
	if (abs >= 1000) decimals = 2;
	else if (abs >= 1) decimals = Math.min(4, maxDecimals);
	else if (abs > 0) decimals = Math.min(6, maxDecimals);
	else decimals = 0;
	return `${amount.toLocaleString('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: decimals
	})} ${symbol}`;
}

/** `+2.31%` / `-1.84%` / `0.00%` for delta display. */
export function formatPctDelta(pct: number): string {
	if (!Number.isFinite(pct)) return '0.00%';
	const sign = pct > 0 ? '+' : '';
	return `${sign}${pct.toFixed(2)}%`;
}

/** Same value as `formatPctDelta` but with a one-decimal cap for tighter UI. */
export function formatPctDeltaShort(pct: number): string {
	if (!Number.isFinite(pct)) return '0.0%';
	const sign = pct > 0 ? '+' : '';
	return `${sign}${pct.toFixed(1)}%`;
}
