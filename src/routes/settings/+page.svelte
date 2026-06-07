<script lang="ts">
	import type { PageData } from './$types';

	type Props = { data: PageData };
	let { data }: Props = $props();
</script>

<main class="mx-auto flex max-w-[640px] flex-col gap-8 px-8 py-10">
	<header>
		<h1 class="text-[22px] font-extrabold tracking-[-0.02em] text-ink">Settings</h1>
		<p class="mt-1 text-sm text-muted">Account and embedded wallet status.</p>
	</header>

	<section class="rounded-card border border-border bg-surface p-6">
		<div class="mb-5">
			<h2 class="text-[16px] font-bold text-ink">Account</h2>
		</div>

		<div class="flex flex-col gap-4 text-[13px]">
			<div class="flex items-center justify-between gap-4 border-b border-border pb-3">
				<span class="text-muted">Name</span>
				<span class="font-semibold text-ink">{data.account.displayName ?? 'User'}</span>
			</div>
			<div class="flex items-center justify-between gap-4 border-b border-border pb-3">
				<span class="text-muted">Email</span>
				<span class="font-semibold text-ink">{data.account.email ?? 'Not linked'}</span>
			</div>
			<div class="flex items-center justify-between gap-4 border-b border-border pb-3">
				<span class="text-muted">Privy ID</span>
				<span class="max-w-[360px] truncate font-mono text-[12px] text-ink">{data.account.id}</span>
			</div>
			<div class="flex items-center justify-between gap-4">
				<span class="text-muted">Solana wallet</span>
				<span class="max-w-[360px] truncate font-mono text-[12px] text-ink">
					{data.account.solanaAddress ?? 'Provisioning pending'}
				</span>
			</div>
		</div>
	</section>
</main>
