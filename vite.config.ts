import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		// Bind on IPv4 so coral-server (JVM) — which resolves `localhost` to
		// IPv6 (`::1`) first on macOS — can actually reach our customTool
		// endpoints. Vite's default `localhost` binding ends up IPv6-only.
		host: '127.0.0.1'
	}
});
