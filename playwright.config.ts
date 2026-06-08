import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PLAYWRIGHT_PORT || '5173';
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: './e2e',
	timeout: 90_000,
	expect: { timeout: 15_000 },
	reporter: 'line',
	use: {
		baseURL: BASE_URL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: `node_modules/.bin/tsx scripts/dev-savings.ts --bypass --host=127.0.0.1`,
		url: `${BASE_URL}/wallet`,
		timeout: 120_000,
		reuseExistingServer: false,
		env: {
			PORT,
			CORAL_API_KEY: '',
			CORAL_REPORT_NAMESPACE: 'fabrick-playwright-composition-report',
			FABRICK_DEV_ATTACHED: '1'
		}
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	]
});
