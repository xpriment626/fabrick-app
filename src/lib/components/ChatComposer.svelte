<!--
	Shared chat compose primitive — used by the chat page, the
	discover-story follow-up, and the fleet-run follow-up. (§17 removed the
	global ambient bar; all composers are now anchored/embedded.)

	Layout follows Claude's chat compose 1:1:
	  ┌──────────────────────────────────────┐
	  │ Textarea (autosize up to maxPx, then  │
	  │ internal scroll)                      │
	  ├──────────────────────────────────────┤
	  │ [+] [FLEET]   …    [model?] [send]   │  ← toolbar row pinned bottom
	  └──────────────────────────────────────┘

	Toolbar elements never get visually shifted as the textarea grows
	because they sit in a sibling row, not inline with the textarea.

	The `+` menu is a placeholder dropdown — three items (Add files,
	Connectors, Skills) that don't do anything yet. They reserve the
	visual slot so the layout is forward-compatible with the real
	connector + skills surfaces.

	Variant:
	  - `ambient`  — translucent glass pill (currently unused; kept for a
	                 future floating composer)
	  - `embedded` — solid surface, used inside-page composers
-->
<script lang="ts">
	type Props = {
		/** Two-way bound input value. */
		value: string;
		/** Placeholder string — caller computes from state (anon, submitting, etc). */
		placeholder: string;
		/** Disable the entire compose surface. */
		disabled?: boolean;
		/** A request is in-flight — also disables submit but keeps fields visible. */
		submitting?: boolean;
		/** Show the FLEET toggle in the toolbar (left). */
		showFleet?: boolean;
		/** Whether FLEET is currently on. */
		fleetActive?: boolean;
		/** Toggle handler — called when user clicks the FLEET pill. */
		onFleetToggle?: () => void;
		/** Submit handler — fired on Enter (no shift) and send-button click. */
		onSubmit: () => void;
		/** Click-while-disabled handler — e.g. anon user → open login modal. */
		onDisabledClick?: () => void;
		/** Visual variant. */
		variant?: 'ambient' | 'embedded';
		/** ARIA label for the textarea. */
		label?: string;
		/** Max-px height the textarea grows to before internal scroll. */
		maxHeight?: number;
	};

	let {
		value = $bindable(''),
		placeholder,
		disabled = false,
		submitting = false,
		showFleet = false,
		fleetActive = false,
		onFleetToggle,
		onSubmit,
		onDisabledClick,
		variant = 'embedded',
		label = 'Chat input',
		maxHeight = 200
	}: Props = $props();

	let textareaEl: HTMLTextAreaElement;
	let menuOpen = $state(false);
	let menuWrapEl: HTMLDivElement;

	function autosize(el: HTMLTextAreaElement) {
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
	}

	function onInput(e: Event) {
		autosize(e.currentTarget as HTMLTextAreaElement);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			doSubmit();
		}
	}

	function doSubmit() {
		if (disabled || submitting || !value.trim()) return;
		onSubmit();
		// Parent's onSubmit synchronously clears `value`; reset the
		// textarea height so it collapses back to 1 line on the next
		// frame (Svelte already flushed the bind:value update by here).
		queueMicrotask(() => {
			if (textareaEl) textareaEl.style.height = 'auto';
		});
	}

	function onMenuButtonClick(e: MouseEvent) {
		e.stopPropagation();
		if (disabled) {
			onDisabledClick?.();
			return;
		}
		menuOpen = !menuOpen;
	}

	function onDocumentClick(e: MouseEvent) {
		if (!menuOpen) return;
		if (menuWrapEl && !menuWrapEl.contains(e.target as Node)) {
			menuOpen = false;
		}
	}

	function onTextareaClick() {
		if (disabled) onDisabledClick?.();
	}

	// Placeholder menu items — non-functional, reserve UI slots for the
	// connector + skills systems that land later.
	const MENU_ITEMS: Array<{ label: string; hint?: string }> = [
		{ label: 'Add files or photos' },
		{ label: 'Connectors', hint: 'Soon' },
		{ label: 'Skills', hint: 'Soon' }
	];
</script>

<svelte:window onclick={onDocumentClick} />

<div class="composer" data-variant={variant}>
	<textarea
		bind:this={textareaEl}
		bind:value
		rows="1"
		{placeholder}
		{disabled}
		aria-label={label}
		oninput={onInput}
		onkeydown={onKeydown}
		onclick={onTextareaClick}
	></textarea>

	<div class="toolbar">
		<div class="toolbar-left">
			<div class="menu-wrap" bind:this={menuWrapEl}>
				<button
					type="button"
					class="icon-btn"
					aria-label="Add"
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					onclick={onMenuButtonClick}
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M12 5v14" />
						<path d="M5 12h14" />
					</svg>
				</button>
				{#if menuOpen}
					<div class="menu" role="menu">
						{#each MENU_ITEMS as item (item.label)}
							<button
								type="button"
								role="menuitem"
								class="menu-item"
								onclick={() => (menuOpen = false)}
							>
								<span>{item.label}</span>
								{#if item.hint}
									<span class="menu-item-hint">{item.hint}</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			{#if showFleet}
				<button
					type="button"
					class="fleet-toggle"
					class:on={fleetActive}
					onclick={() => {
						if (disabled) {
							onDisabledClick?.();
							return;
						}
						onFleetToggle?.();
					}}
					aria-pressed={fleetActive}
					aria-label="Fleet mode"
					title={fleetActive
						? 'Fleet mode on — sends to the multi-agent research fleet'
						: 'Toggle Fleet mode'}
				>
					<svg
						width="11"
						height="11"
						viewBox="0 0 24 24"
						fill={fleetActive ? 'currentColor' : 'none'}
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="m13 2-3 7h6l-3 13" />
					</svg>
					<span>Fleet</span>
				</button>
			{/if}
		</div>

		<div class="toolbar-right">
			<!-- Future: model picker slot lives here. -->
			<button
				type="button"
				class="send-btn"
				aria-label="Send"
				disabled={disabled || submitting || !value.trim()}
				onclick={doSubmit}
			>
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
</div>

<style>
	.composer {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 12px 10px;
		border-radius: 22px;
		transition: border-color 0.2s ease;
	}

	.composer[data-variant='ambient'] {
		background: color-mix(in srgb, var(--color-surface) 68%, transparent);
		backdrop-filter: blur(20px) saturate(140%);
		-webkit-backdrop-filter: blur(20px) saturate(140%);
		border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.55) inset,
			0 12px 30px -12px rgba(28, 25, 23, 0.12),
			0 2px 6px -2px rgba(28, 25, 23, 0.06);
	}

	.composer[data-variant='embedded'] {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		box-shadow: 0 1px 2px rgba(28, 25, 23, 0.04);
	}

	textarea {
		width: 100%;
		min-height: 26px;
		max-height: 200px;
		background: transparent;
		border: none;
		outline: none;
		resize: none;
		overflow-y: auto;
		font-family: inherit;
		font-size: 14.5px;
		font-weight: 500;
		color: var(--color-ink);
		letter-spacing: -0.005em;
		line-height: 1.5;
		padding: 6px 6px 0;
	}
	textarea::placeholder {
		color: color-mix(in srgb, var(--color-muted) 90%, transparent);
		font-weight: 500;
	}
	textarea:disabled {
		cursor: default;
		color: color-mix(in srgb, var(--color-ink) 60%, transparent);
	}

	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: 0 4px 2px;
	}
	.toolbar-left,
	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.icon-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border-radius: 999px;
		color: var(--color-muted);
		cursor: pointer;
		transition:
			background 140ms ease,
			color 140ms ease;
	}
	.icon-btn:hover {
		background: color-mix(in srgb, var(--color-ink) 6%, transparent);
		color: var(--color-ink);
	}
	.icon-btn:focus-visible {
		outline: 2px solid color-mix(in srgb, var(--color-ink) 18%, transparent);
		outline-offset: 1px;
	}

	.menu-wrap {
		position: relative;
	}
	.menu {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 0;
		min-width: 220px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		padding: 6px;
		box-shadow: 0 12px 24px -8px rgba(28, 25, 23, 0.16);
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.menu-item {
		all: unset;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 12px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-ink);
		cursor: pointer;
	}
	.menu-item:hover {
		background: color-mix(in srgb, var(--color-ink) 6%, transparent);
	}
	.menu-item-hint {
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-muted);
	}

	.fleet-toggle {
		all: unset;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 5px 10px;
		border-radius: 999px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.01em;
		text-transform: uppercase;
		color: var(--color-muted);
		background: color-mix(in srgb, var(--color-ink) 4%, transparent);
		border: 1px solid var(--color-border);
		cursor: pointer;
		transition:
			background 140ms ease,
			color 140ms ease,
			border-color 140ms ease;
	}
	.fleet-toggle:hover {
		color: var(--color-ink);
		border-color: color-mix(in srgb, var(--color-ink) 18%, var(--color-border));
	}
	.fleet-toggle.on {
		background: var(--color-ink);
		color: var(--color-bg);
		border-color: var(--color-ink);
	}
	.fleet-toggle.on:hover {
		opacity: 0.92;
	}

	.send-btn {
		all: unset;
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: 12px;
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
