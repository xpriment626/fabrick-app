<!--
	Floating top-right Connect Wallet button. Persistent across all
	routes. Stub for now — clicking is a no-op until Privy auth wires up.
-->
<script lang="ts">
	function onClick() {
		// TODO: wire to Privy login flow once auth lands
		console.log('[ConnectWallet] click — not wired yet');
	}
</script>

<button
	type="button"
	onclick={onClick}
	class="connect-btn"
	aria-label="Connect Wallet"
>
	Connect Wallet
</button>

<style>
	.connect-btn {
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: 25;
		border: none;
		background: var(--color-ink);
		color: var(--color-bg);
		padding: 9px 16px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 120ms ease;
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.5) inset,
			0 6px 16px -8px rgba(28, 25, 23, 0.18);
	}
	.connect-btn:hover {
		opacity: 0.92;
	}
	.connect-btn:active {
		transform: scale(0.98);
	}
</style>
