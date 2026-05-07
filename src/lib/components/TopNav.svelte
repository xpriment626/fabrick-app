<script lang="ts">
	type Props = {
		active?: 'research' | 'wallet';
	};

	let { active = 'research' }: Props = $props();
</script>

<nav
	class="flex w-full items-center justify-between border-b border-border bg-surface px-10 py-4"
>
	<a href="/" class="text-[22px] font-extrabold tracking-[-0.04em] text-ink">fabrick</a>

	<div class="flex items-center gap-8">
		<a
			href="/"
			class="flex flex-col items-center gap-1 text-[15px] font-semibold {active === 'research'
				? 'text-ink'
				: 'text-muted'}"
		>
			Research
			{#if active === 'research'}
				<span class="h-1 w-1 rounded-full bg-ink"></span>
			{/if}
		</a>
		<a
			href="/wallet"
			class="flex flex-col items-center gap-1 text-[15px] font-semibold {active === 'wallet'
				? 'text-ink'
				: 'text-muted'}"
		>
			Wallet
			{#if active === 'wallet'}
				<span class="h-1 w-1 rounded-full bg-ink"></span>
			{/if}
		</a>
	</div>

	<button
		type="button"
		class="rounded-[10px] bg-ink px-5 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
	>
		Connect Wallet
	</button>
</nav>
