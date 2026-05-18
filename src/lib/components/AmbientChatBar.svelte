<!--
	Ambient chat bar — fixed at the bottom of the viewport, persistent
	across every route via the layout (except routes that ship their
	own compose, like /chat/[slug] and /discover/[slug]).

	The compose primitive is `ChatComposer` (variant="ambient" for the
	glass look); this component just owns the fixed positioning + the
	submit-routing logic (creates a chat / kicks off a fleet run /
	opens the login modal for anon users).
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import LoginModal from './LoginModal.svelte';
	import ChatComposer from './ChatComposer.svelte';

	let value = $state('');
	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);
	let loginOpen = $state(false);
	let fleetMode = $state(false);

	const authed = $derived(Boolean(page.data.user));
	const placeholder = $derived(
		!authed
			? 'Sign in to ask Fabrick anything…'
			: submitting
				? fleetMode
					? 'Dispatching fleet…'
					: 'Spinning up…'
				: fleetMode
					? 'Ask the fleet a research question…'
					: 'Ask Fabrick anything…'
	);

	async function submit() {
		if (!authed) {
			loginOpen = true;
			return;
		}
		const q = value.trim();
		if (!q || submitting) return;
		submitting = true;
		errorMsg = null;
		try {
			if (fleetMode) {
				const res = await fetch('/api/fleet/run', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ query: q })
				});
				if (!res.ok) {
					const body = await res.text().catch(() => '');
					throw new Error(`${res.status} ${body || res.statusText}`);
				}
				const data = (await res.json()) as { redirectTo?: string };
				if (!data.redirectTo) throw new Error('Server returned no redirectTo');
				value = '';
				await goto(data.redirectTo);
				return;
			}

			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: q })
			});
			if (!res.ok) {
				const body = await res.text().catch(() => '');
				throw new Error(`${res.status} ${body || res.statusText}`);
			}
			const data = (await res.json()) as { slug: string };
			value = '';
			await goto(`/chat/${encodeURIComponent(data.slug)}?autosend=1`);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
			submitting = false;
		}
	}

	function onAnonClick() {
		loginOpen = true;
	}

	function onFleetToggle() {
		fleetMode = !fleetMode;
	}
</script>

<LoginModal bind:open={loginOpen} onClose={() => (loginOpen = false)} />

<div class="ambient-bar" aria-hidden="false">
	{#if errorMsg}
		<div class="ambient-error" role="alert">
			{errorMsg}
		</div>
	{/if}

	<ChatComposer
		bind:value
		{placeholder}
		disabled={!authed}
		{submitting}
		showFleet={true}
		fleetActive={fleetMode}
		{onFleetToggle}
		onSubmit={submit}
		onDisabledClick={onAnonClick}
		variant="ambient"
		label="Ambient chat input"
	/>
</div>

<style>
	.ambient-bar {
		position: fixed;
		bottom: 24px;
		/* Center within the main content area, accounting for the
		   sidebar width set by the Sidebar component on <html>. The
		   left/transform pair shifts the centerline right by half the
		   sidebar width. */
		left: calc(50% + var(--sidebar-w, 60px) / 2);
		transform: translateX(-50%);
		width: min(680px, calc(100% - var(--sidebar-w, 60px) - 32px));
		z-index: 40;
		pointer-events: auto;
		transition:
			left 180ms ease,
			width 180ms ease;
	}

	.ambient-error {
		margin-bottom: 8px;
		padding: 8px 14px;
		border-radius: 10px;
		background: color-mix(in srgb, #dc2626 14%, var(--color-surface));
		border: 1px solid color-mix(in srgb, #dc2626 30%, transparent);
		color: #b91c1c;
		font-size: 13px;
		font-weight: 500;
	}
</style>
