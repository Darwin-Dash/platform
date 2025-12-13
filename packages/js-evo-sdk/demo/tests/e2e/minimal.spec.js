import { test, expect } from '@playwright/test';

test.describe('Minimal Test - Verify Playwright Works', () => {
  test('can load the application', async ({ page }) => {
    await page.goto('http://localhost:8080/index-static.html');

    // Just verify page loads
    await expect(page).toHaveTitle(/Dash Identity Manager/);
  });

  test('displays app header', async ({ page }) => {
    await page.goto('http://localhost:8080/index-static.html');

    const header = page.locator('.app-header');
    await expect(header).toBeVisible();
  });
});