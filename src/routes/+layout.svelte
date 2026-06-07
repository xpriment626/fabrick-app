<script lang="ts">
	import '../app.css';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ConnectWalletButton from '$lib/components/ConnectWalletButton.svelte';
	import type { LayoutData } from './$types';

	type Props = { data: LayoutData; children: import('svelte').Snippet };
	let { data, children }: Props = $props();

	// The active shell is savings-first. Broad research/chat surfaces are
	// preserved on the deep-research branch and disabled from navigation here.
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
