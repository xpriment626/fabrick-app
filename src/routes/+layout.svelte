<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import AmbientChatBar from '$lib/components/AmbientChatBar.svelte';

	let { children } = $props();

	// Hide the ambient bar on chat routes — the chat page renders its
	// own compose pinned to the bottom and the two would overlap. The
	// ambient bar's purpose is "kick off a chat from anywhere else."
	const showAmbient = $derived(!page.url.pathname.startsWith('/chat/'));
</script>

{@render children()}

{#if showAmbient}
	<AmbientChatBar />
{/if}
