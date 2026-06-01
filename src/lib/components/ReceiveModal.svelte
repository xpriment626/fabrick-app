<!--
	ReceiveModal (§20) — the wallet-standard "Deposit / Receive" action: shows a
	QR of the wallet address + the address with click-to-copy. Pure display, no
	signing. QR is generated client-side (dynamic import, no SSR).
-->
<script lang="ts">
	type Props = { address: string; onClose: () => void };
	let { address, onClose }: Props = $props();

	let qrDataUrl = $state<string | null>(null);
	let copied = $state(false);

	$effect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const QRCode = (await import('qrcode')).default;
				const url = await QRCode.toDataURL(address, {
					margin: 1,
					width: 220,
					color: { dark: '#1c1917', light: '#ffffff' }
				});
				if (!cancelled) qrDataUrl = url;
			} catch {
				/* QR generation failed — address text below still works */
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	async function copy() {
		try {
			await navigator.clipboard.writeText(address);
			copied = true;
			setTimeout(() => (copied = false), 1400);
		} catch {
			/* clipboard blocked */
		}
	}
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
	role="button"
	tabindex="-1"
	onclick={onClose}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="w-full max-w-[380px] rounded-card border border-border bg-surface p-6 shadow-card"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="mb-4 flex items-center justify-between">
			<h3 class="text-[17px] font-bold text-ink">Deposit</h3>
			<button type="button" onclick={onClose} class="text-[13px] text-muted hover:text-ink">Close</button>
		</div>

		<p class="mb-4 text-[12.5px] text-muted">
			Send SOL or USDC to this address to fund your wallet. Solana network only.
		</p>

		<div class="mb-4 flex justify-center">
			<div class="rounded-[14px] border border-border bg-surface p-3">
				{#if qrDataUrl}
					<img src={qrDataUrl} alt="Wallet address QR code" width="220" height="220" />
				{:else}
					<div class="flex h-[220px] w-[220px] items-center justify-center text-[12px] text-muted">
						Generating QR…
					</div>
				{/if}
			</div>
		</div>

		<button
			type="button"
			onclick={copy}
			class="flex w-full items-center justify-between gap-3 rounded-[10px] border border-border bg-bg px-3 py-2.5 text-left transition-colors hover:bg-surface"
		>
			<span class="truncate font-mono text-[12.5px] text-ink">{address}</span>
			<span class="shrink-0 text-[12px] font-semibold text-muted">{copied ? 'Copied ✓' : 'Copy'}</span>
		</button>
	</div>
</div>
