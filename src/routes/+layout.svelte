<script lang="ts">
	import '../app.css';
	import AmbientChatBar from '$lib/components/AmbientChatBar.svelte';

	let { children } = $props();
</script>

{@render children()}

<AmbientChatBar />
