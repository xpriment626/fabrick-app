<script lang="ts">
	type Props = {
		placeholder?: string;
		variant?: 'search' | 'chat';
		width?: string;
	};

	let {
		placeholder = 'Ask anything about Solana…',
		variant = 'search',
		width = '320px'
	}: Props = $props();

	let value = $state('');
</script>

<div
	class="flex h-11 items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5"
	style:width
>
	{#if variant === 'search'}
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="shrink-0 text-muted"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="8" />
			<path d="m21 21-4.3-4.3" />
		</svg>
	{/if}

	<input
		type="text"
		bind:value
		{placeholder}
		class="flex-1 bg-transparent text-sm text-ink placeholder:text-muted/50 focus:outline-none"
	/>

	{#if variant === 'chat'}
		<button
			type="submit"
			aria-label="Send"
			class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink text-bg transition-opacity hover:opacity-90 disabled:opacity-30"
			disabled={!value.trim()}
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
	{/if}
</div>
