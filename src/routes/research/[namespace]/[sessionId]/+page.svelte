<!--
	Thin shell over `<FleetTrace>`. The `{#key data.sessionId}` block
	forces the trace component to remount whenever the session ID
	changes, which is the only safe way to swap fleet runs: `<FleetTrace>`
	constructs a `Session` (with its own WebSocket) at mount time and
	doesn't tear it down on prop changes. Without the key, navigating
	`/research/A/X → /research/A/Y` would keep the X session's WS open
	while the URL claims Y.
-->
<script lang="ts">
	import FleetTrace from '$lib/components/FleetTrace.svelte';
	import type { PageData } from './$types';

	type Props = { data: PageData };
	let { data }: Props = $props();
</script>

{#key data.sessionId}
	<FleetTrace {data} />
{/key}
