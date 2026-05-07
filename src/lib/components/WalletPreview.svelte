<script lang="ts">
	import type { WalletSnapshot } from '$lib/placeholder-data';

	type Props = {
		wallet: WalletSnapshot;
	};

	let { wallet }: Props = $props();
</script>

<aside class="rounded-card border border-border bg-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
	<div class="eyebrow mb-3 text-muted">Wallet</div>

	<div class="mb-4 flex items-center gap-2">
		<span class="font-mono text-[13px] text-muted">{wallet.address}</span>
		<button
			type="button"
			aria-label="Copy address"
			class="text-muted transition-colors hover:text-ink"
		>
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
				<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
			</svg>
		</button>
	</div>

	<div class="mb-4 text-[32px] font-extrabold tracking-[-0.04em] text-ink">
		{wallet.balanceUsd}
	</div>

	<div class="flex flex-wrap gap-1.5">
		{#each wallet.tokens.slice(0, 3) as token (token.symbol)}
			<span class="rounded-full border border-border bg-bg px-2.5 py-1 text-xs text-muted">
				{token.symbol}
			</span>
		{/each}
	</div>
</aside>
