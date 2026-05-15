/**
 * Shared formatters for artifact renderers.
 *
 * Keep the pure-data helpers here so every artifact component renders
 * numbers, percentages, and timestamps consistently — and so the
 * components themselves stay purely about layout.
 */

const usdCompact = new Intl.NumberFormat('en-US', {
	notation: 'compact',
	maximumFractionDigits: 2,
	style: 'currency',
	currency: 'USD'
});

const usdPrecise = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	maximumFractionDigits: 6,
	minimumFractionDigits: 2
});

export function fmtUsd(n: number): string {
	if (!Number.isFinite(n)) return '—';
	return usdCompact.format(n);
}

/** Use for prices that live below ~$1 — shows full sig figs. */
export function fmtPrice(n: number): string {
	if (!Number.isFinite(n)) return '—';
	if (Math.abs(n) >= 1) return usdPrecise.format(n);
	return n.toLocaleString('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 8,
		minimumFractionDigits: 2
	});
}

export function fmtPct(n: number, digits = 2): string {
	if (!Number.isFinite(n)) return '—';
	const sign = n > 0 ? '+' : '';
	return `${sign}${n.toFixed(digits)}%`;
}

export function pctClass(n: number): 'pos' | 'neg' | '' {
	if (!Number.isFinite(n) || n === 0) return '';
	return n > 0 ? 'pos' : 'neg';
}

/** Truncate a long address-like string to head…tail form. */
export function shortAddr(addr: string, head = 4, tail = 4): string {
	if (!addr || addr.length <= head + tail + 1) return addr;
	return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Extract host from a URL, stripping `www.`. Falls back to the raw input. */
export function urlHost(u: string): string {
	try {
		return new URL(u).hostname.replace(/^www\./, '');
	} catch {
		return u;
	}
}

/**
 * Render a Unix-seconds timestamp as a relative-time string suitable
 * for news/citation card metadata. Accepts both seconds and ISO strings.
 */
export function timeAgo(input: number | string | null | undefined): string {
	if (input == null) return '';
	let ts: number;
	if (typeof input === 'string') {
		const parsed = Date.parse(input);
		if (!Number.isFinite(parsed)) return '';
		ts = parsed;
	} else {
		ts = input * 1000;
	}
	const diff = Math.max(0, Date.now() - ts);
	const s = Math.floor(diff / 1000);
	if (s < 60) return 'just now';
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 7) return `${d}d ago`;
	const date = new Date(ts);
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
