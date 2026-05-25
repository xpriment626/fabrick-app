<script lang="ts">
	import '../app.css';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ConnectWalletButton from '$lib/components/ConnectWalletButton.svelte';
	import type { LayoutData } from './$types';

	type Props = { data: LayoutData; children: import('svelte').Snippet };
	let { data, children }: Props = $props();

	// §17: no global ambient chat bar. A conversation is anchored — it
	// lives inside a News story (/discover/[slug]) or a Fleet run, each of
	// which ships its own composer. There is no unanchored entry point.
</script>

<Sidebar recents={data.recents} />

<ConnectWalletButton user={data.user} />

<div class="main">
	{@render children()}
</div>

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
