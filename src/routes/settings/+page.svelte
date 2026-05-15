<!--
	Settings — for now just the BYOK OpenRouter key UX. Form lets the
	user paste their `sk-or-...` key (server-side encrypted via Vault)
	or clear an existing one. Plaintext never round-trips back to the
	browser; we surface `set: boolean` + `set_at` only.
-->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	type Props = { data: PageData };
	let { data }: Props = $props();

	let keyInput = $state('');
	let saving = $state(false);
	let removing = $state(false);
	let errorMsg = $state<string | null>(null);
	let savedJustNow = $state(false);

	function fmtDate(iso: string | null): string {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleString('en-US', {
				dateStyle: 'medium',
				timeStyle: 'short'
			});
		} catch {
			return iso;
		}
	}

	async function saveKey(e: SubmitEvent) {
		e.preventDefault();
		if (!keyInput.trim() || saving) return;
		saving = true;
		errorMsg = null;
		savedJustNow = false;
		try {
			const res = await fetch('/api/settings/openrouter-key', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: keyInput.trim() })
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `${res.status} ${res.statusText}`);
			}
			keyInput = '';
			savedJustNow = true;
			await invalidateAll();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}

	async function removeKey() {
		if (removing) return;
		removing = true;
		errorMsg = null;
		try {
			const res = await fetch('/api/settings/openrouter-key', { method: 'DELETE' });
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `${res.status} ${res.statusText}`);
			}
			await invalidateAll();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
		} finally {
			removing = false;
		}
	}
</script>

<main class="mx-auto flex max-w-[640px] flex-col gap-8 px-8 py-10">
	<header>
		<h1 class="text-ink text-[22px] font-extrabold tracking-[-0.02em]">Settings</h1>
		<p class="text-muted mt-1 text-sm">Configure your Fabrick experience.</p>
	</header>

	<section class="card">
		<div class="card-head">
			<div>
				<h2>OpenRouter API key</h2>
				<p class="sub">
					Fabrick's chat + research agents call models through OpenRouter. Your key is
					encrypted at rest (pgsodium + Supabase Vault master key) and only decrypted
					server-side inside an agent run — it's never returned to your browser.
				</p>
			</div>
		</div>

		<div class="status">
			{#if data.keyStatus.set}
				<div class="status-row">
					<span class="dot dot-on"></span>
					<span class="status-text">
						Key on file
						{#if data.keyStatus.setAt}
							<span class="muted">· set {fmtDate(data.keyStatus.setAt)}</span>
						{/if}
					</span>
					<button
						type="button"
						class="link-danger"
						onclick={removeKey}
						disabled={removing}
					>
						{removing ? 'Removing…' : 'Remove'}
					</button>
				</div>
			{:else}
				<div class="status-row">
					<span class="dot dot-off"></span>
					<span class="status-text muted">
						No key — agent runs use the development fallback
					</span>
				</div>
			{/if}
		</div>

		<form onsubmit={saveKey} class="form">
			<label for="key" class="label">
				{data.keyStatus.set ? 'Replace key' : 'Add key'}
			</label>
			<input
				id="key"
				type="password"
				placeholder="sk-or-…"
				autocomplete="off"
				bind:value={keyInput}
				disabled={saving}
			/>
			<button
				type="submit"
				class="primary"
				disabled={!keyInput.trim() || saving}
			>
				{saving ? 'Saving…' : data.keyStatus.set ? 'Replace key' : 'Save key'}
			</button>
		</form>

		{#if savedJustNow}
			<div class="ok">Saved. New agent runs will use your key.</div>
		{/if}
		{#if errorMsg}
			<div class="err">{errorMsg}</div>
		{/if}

		<details class="how">
			<summary>How to get an OpenRouter API key</summary>
			<ol>
				<li>Sign in at <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer">openrouter.ai</a>.</li>
				<li>Open <em>Keys</em> in the dashboard and click <em>Create key</em>.</li>
				<li>Paste the <code>sk-or-…</code> string above and save.</li>
				<li>You can revoke / rotate anytime — we re-decrypt fresh on every agent run.</li>
			</ol>
		</details>
	</section>
</main>

<style>
	.card {
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		border-radius: 16px;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.card-head h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: var(--color-ink);
		letter-spacing: -0.01em;
	}
	.sub {
		margin: 6px 0 0;
		font-size: 13px;
		color: var(--color-muted);
		line-height: 1.5;
		max-width: 56ch;
	}

	.status {
		padding: 12px 14px;
		border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
		border-radius: 12px;
		background: color-mix(in srgb, var(--color-bg) 50%, transparent);
	}
	.status-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.dot-on {
		background: var(--color-positive);
	}
	.dot-off {
		background: var(--color-muted);
	}
	.status-text {
		flex: 1;
		font-size: 13px;
		color: var(--color-ink);
	}
	.status-text .muted {
		color: var(--color-muted);
		font-size: 12px;
	}
	.status-text.muted {
		color: var(--color-muted);
	}
	.link-danger {
		all: unset;
		cursor: pointer;
		font-size: 12px;
		font-weight: 500;
		color: var(--color-negative);
	}
	.link-danger:hover:not(:disabled) {
		text-decoration: underline;
	}
	.link-danger:disabled {
		opacity: 0.5;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.label {
		font-size: 11px;
		color: var(--color-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	input {
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		border-radius: 10px;
		padding: 10px 12px;
		font-size: 13.5px;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		color: var(--color-ink);
	}
	input:focus {
		outline: 2px solid color-mix(in srgb, var(--color-ink) 18%, transparent);
		outline-offset: 0;
	}
	.primary {
		align-self: flex-start;
		background: var(--color-ink);
		color: var(--color-bg);
		border: none;
		padding: 9px 16px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.primary:hover:not(:disabled) {
		opacity: 0.9;
	}
	.primary:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.ok {
		padding: 8px 12px;
		font-size: 12.5px;
		color: var(--color-positive);
		background: color-mix(in srgb, var(--color-positive) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-positive) 26%, transparent);
		border-radius: 8px;
	}
	.err {
		padding: 8px 12px;
		font-size: 12.5px;
		color: var(--color-negative);
		background: color-mix(in srgb, var(--color-negative) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-negative) 26%, transparent);
		border-radius: 8px;
	}

	.how {
		font-size: 13px;
		color: var(--color-muted);
	}
	.how summary {
		cursor: pointer;
		font-weight: 500;
	}
	.how summary:hover {
		color: var(--color-ink);
	}
	.how ol {
		margin: 10px 0 0 20px;
		padding: 0;
		line-height: 1.6;
	}
	.how a {
		color: var(--color-ink);
		text-decoration: underline;
	}
	.how code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 12px;
		background: color-mix(in srgb, var(--color-ink) 4%, transparent);
		padding: 1px 4px;
		border-radius: 4px;
	}
</style>
