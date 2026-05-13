<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ConnectWalletButton from '$lib/components/ConnectWalletButton.svelte';
	import AmbientChatBar from '$lib/components/AmbientChatBar.svelte';
	import type { LayoutData } from './$types';

	type Props = { data: LayoutData; children: import('svelte').Snippet };
	let { data, children }: Props = $props();

	// Ambient bar is hidden on chat routes — the chat page renders its
	// own compose. Elsewhere the ambient bar is the primary entry into
	// a new chat.
	const showAmbient = $derived(!page.url.pathname.startsWith('/chat/'));
</script>

<Sidebar recents={data.recents} />

<ConnectWalletButton />

<div class="main">
	{@render children()}
</div>

{#if showAmbient}
	<AmbientChatBar />
{/if}

<style>
	/* Reserve space for the sidebar. Width comes from --sidebar-w which
	   the Sidebar component sets on <html> reactively when it
	   collapses/expands. */
	.main {
		padding-left: var(--sidebar-w, 60px);
		transition: padding-left 180ms ease;
		min-height: 100vh;
	}
</style>
