<!--
	Ambient chat bar — fixed at the bottom of the viewport, persistent
	across every route via the layout. Glass-like (light translucent over
	a backdrop blur) so the content behind shows through diffused. Purely
	visual for now: the input doesn't submit anywhere. Real wiring lands
	with the session backbone (`POST /api/sessions`) in a later reroll.
-->
<script lang="ts">
	let value = $state('');
</script>

<div class="ambient-bar" aria-hidden="false">
	<div class="ambient-pill">
		<svg
			class="leading-icon"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M12 3v3" />
			<path d="M12 18v3" />
			<path d="M3 12h3" />
			<path d="M18 12h3" />
			<path d="m5.6 5.6 2.1 2.1" />
			<path d="m16.3 16.3 2.1 2.1" />
			<path d="m5.6 18.4 2.1-2.1" />
			<path d="m16.3 7.7 2.1-2.1" />
		</svg>

		<input
			bind:value
			type="text"
			placeholder="Ask Fabrick anything…"
			aria-label="Ambient chat input"
		/>

		<button type="button" class="send-btn" aria-label="Send" disabled={!value.trim()}>
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M5 12h14" />
				<path d="m13 6 6 6-6 6" />
			</svg>
		</button>
	</div>
</div>

<style>
	.ambient-bar {
		position: fixed;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		width: min(680px, calc(100% - 32px));
		z-index: 40;
		pointer-events: auto;
	}

	.ambient-pill {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 56px;
		padding: 0 6px 0 18px;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--color-surface) 68%, transparent);
		backdrop-filter: blur(20px) saturate(140%);
		-webkit-backdrop-filter: blur(20px) saturate(140%);
		border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.55) inset,
			0 12px 30px -12px rgba(28, 25, 23, 0.12),
			0 2px 6px -2px rgba(28, 25, 23, 0.06);
	}

	.leading-icon {
		color: var(--color-muted);
		flex-shrink: 0;
		opacity: 0.85;
	}

	input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		font-family: inherit;
		font-size: 14px;
		font-weight: 500;
		color: var(--color-ink);
		letter-spacing: -0.005em;
	}

	input::placeholder {
		color: color-mix(in srgb, var(--color-muted) 90%, transparent);
		font-weight: 500;
	}

	.send-btn {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border: none;
		border-radius: var(--radius-pill);
		background: var(--color-ink);
		color: var(--color-bg);
		cursor: pointer;
		transition:
			opacity 0.15s ease,
			transform 0.15s ease;
	}

	.send-btn:disabled {
		background: color-mix(in srgb, var(--color-muted) 30%, transparent);
		color: color-mix(in srgb, var(--color-ink) 50%, transparent);
		cursor: default;
	}

	.send-btn:not(:disabled):hover {
		opacity: 0.92;
	}

	.send-btn:not(:disabled):active {
		transform: scale(0.97);
	}
</style>
