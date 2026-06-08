import { expect, test } from '@playwright/test';

test('Advanced account compose renders the composition report and reroll delta', async ({ page }) => {
	const txLikeRequests: string[] = [];
	page.on('request', (request) => {
		const url = request.url();
		if (
			request.method() !== 'GET' &&
			/(deposit\/simulate|send|sign|transaction|privy-policy|wallet\/delegate)/i.test(url)
		) {
			txLikeRequests.push(`${request.method()} ${url}`);
		}
	});

	await page.goto('/wallet');
	await expect(page.getByRole('heading', { name: 'Savings accounts' })).toBeVisible();

	const accountName = page.locator('#account-name');
	const openAccount = page.getByTestId('new-account-button').first();
	await expect(openAccount).toBeVisible();
	for (let attempt = 0; attempt < 3 && !(await accountName.isVisible()); attempt += 1) {
		await openAccount.click();
		await page.waitForTimeout(500);
	}
	await expect(accountName).toBeVisible();
	await accountName.fill(`Playwright Report ${Date.now()}`);
	await page.getByTestId('account-mode-advanced').click();

	const pools = page.getByTestId('advanced-pool-option');
	await expect(pools.first()).toBeVisible({ timeout: 45_000 });
	expect(await pools.count()).toBeGreaterThanOrEqual(2);
	await pools.nth(0).click();
	await pools.nth(1).click();

	await page.getByTestId('advanced-amount-input').fill('1000');
	await page.getByTestId('advanced-compose-button').click();

	await expect(page.getByTestId('composition-report')).toBeVisible({ timeout: 75_000 });
	await expect(page.getByTestId('composition-report-pools')).toBeVisible();
	await expect(page.getByTestId('composition-report-charts')).toBeVisible();
	await expect(page.getByTestId('composition-report-findings')).toBeVisible();
	await expect(page.getByTestId('composition-report-coordination')).toContainText(/schema|Coral/i);

	await page.getByTestId('advanced-reroll-more_conservative').click();
	await expect(page.getByTestId('composition-report')).toBeVisible({ timeout: 75_000 });
	await expect(page.getByTestId('composition-report-delta')).toBeVisible();

	expect(txLikeRequests).toEqual([]);
});
