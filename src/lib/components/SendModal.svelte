<!--
	SendModal (§20) — the wallet-standard "Withdraw / Send" action: prompts for a
	recipient address with live Solana-format validation (the action button stays
	disabled until the address is valid), an amount, and an asset. Includes a
	"recently sent to" address book (localStorage, per wallet) you can pick from.

	Slice 1 stops at a validated review — broadcasting the transfer is the next
	signing increment (consistent with the deposit flow, which simulates only).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { isAddress } from '@solana/kit';

	type Props = { owner: string; onClose: () => void };
	let { owner, onClose }: Props = $props();

	const assets = ['USDC', 'SOL'] as const;
	let asset = $state<(typeof assets)[number]>('USDC');
	let recipient = $state('');
	let amount = $state('');
	let phase = $state<'compose' | 'review'>('compose');

	// Live Solana-address validation (format-correct base58, 32 bytes).
	const recipientTouched = $derived(recipient.trim().length > 0);
	const recipientValid = $derived(recipientTouched && isAddress(recipient.trim()));
	const amountValid = $derived(parseFloat(amount) > 0);
	const canContinue = $derived(recipientValid && amountValid);

	// --- Address book: recently sent to (localStorage, scoped per wallet) -------
	type Entry = { address: string; lastUsed: number };
	const bookKey = $derived(`fabrick:sendbook:${owner}`);
	let recents = $state<Entry[]>([]);

	onMount(() => {
		try {
			recents = JSON.parse(localStorage.getItem(bookKey) ?? '[]') as Entry[];
		} catch {
			recents = [];
		}
	});

	function rememberRecipient(addr: string) {
		const now = Date.now();
		const next = [{ address: addr, lastUsed: now }, ...recents.filter((e) => e.address !== addr)].slice(0, 8);
		recents = next;
		try {
			localStorage.setItem(bookKey, JSON.stringify(next));
		} catch {
			/* storage blocked */
		}
	}

	function pick(addr: string) {
		recipient = addr;
	}

	function toReview() {
		if (!canContinue) return;
		rememberRecipient(recipient.trim());
		phase = 'review';
	}

	const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
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
		class="w-full max-w-[400px] rounded-card border border-border bg-surface p-6 shadow-card"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="mb-4 flex items-center justify-between">
			<h3 class="text-[17px] font-bold text-ink">Withdraw</h3>
			<button type="button" onclick={onClose} class="text-[13px] text-muted hover:text-ink">Close</button>
		</div>

		{#if phase === 'compose'}
			<!-- Asset -->
			<div class="mb-4 inline-flex items-center rounded-pill border border-border bg-bg p-1">
				{#each assets as a (a)}
					<button
						type="button"
						onclick={() => (asset = a)}
						class="rounded-pill px-3.5 py-1 text-[12.5px] font-semibold transition-colors {asset === a
							? 'bg-ink text-surface'
							: 'text-muted hover:text-ink'}"
					>
						{a}
					</button>
				{/each}
			</div>

			<!-- Recipient -->
			<label class="mb-1.5 block text-[12px] font-semibold text-muted" for="send-to">Recipient address</label>
			<input
				id="send-to"
				bind:value={recipient}
				placeholder="Solana address"
				spellcheck="false"
				autocomplete="off"
				class="mb-1 w-full rounded-[10px] border px-3 py-2.5 font-mono text-[13px] text-ink outline-none transition-colors {recipientTouched &&
				!recipientValid
					? 'border-negative'
					: 'border-border focus:border-ink'}"
			/>
			<div class="mb-3 h-4 text-[11.5px]">
				{#if recipientTouched && !recipientValid}
					<span class="text-negative">Not a valid Solana address.</span>
				{:else if recipientValid}
					<span class="text-positive">Valid Solana address ✓</span>
				{/if}
			</div>

			<!-- Recently sent to -->
			{#if recents.length}
				<div class="mb-4">
					<div class="eyebrow mb-1.5 text-muted">Recently sent to</div>
					<div class="flex flex-wrap gap-1.5">
						{#each recents as e (e.address)}
							<button
								type="button"
								onclick={() => pick(e.address)}
								class="rounded-pill border border-border bg-bg px-2.5 py-1 font-mono text-[11px] text-ink transition-colors hover:bg-surface"
							>
								{short(e.address)}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Amount -->
			<label class="mb-1.5 block text-[12px] font-semibold text-muted" for="send-amt">Amount</label>
			<div class="mb-5 flex items-center gap-2 rounded-[10px] border border-border px-3 py-2.5">
				<input
					id="send-amt"
					bind:value={amount}
					inputmode="decimal"
					placeholder="0.00"
					class="w-full bg-transparent text-[15px] font-semibold text-ink outline-none"
				/>
				<span class="text-[13px] font-semibold text-muted">{asset}</span>
			</div>

			<button
				type="button"
				onclick={toReview}
				disabled={!canContinue}
				class="w-full rounded-[10px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
			>
				Review withdrawal
			</button>
		{:else}
			<!-- Review -->
			<div class="mb-4 flex flex-col gap-3 rounded-card border border-border bg-bg p-4">
				<div class="flex items-center justify-between">
					<span class="text-[12.5px] text-muted">Amount</span>
					<span class="text-[14px] font-bold text-ink">{amount} {asset}</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-[12.5px] text-muted">To</span>
					<span class="font-mono text-[12.5px] text-ink">{short(recipient.trim())}</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-[12.5px] text-muted">Network</span>
					<span class="text-[12.5px] text-ink">Solana</span>
				</div>
			</div>

			<p class="mb-4 rounded-[8px] bg-warning/10 px-3 py-2 text-[12px] text-warning">
				Signing is the next increment — this withdrawal is validated + saved to your address book,
				but won't broadcast yet.
			</p>

			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => (phase = 'compose')}
					class="flex-1 rounded-[10px] border border-border bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-bg"
				>
					Back
				</button>
				<button
					type="button"
					onclick={onClose}
					class="flex-1 rounded-[10px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90"
				>
					Done
				</button>
			</div>
		{/if}
	</div>
</div>
