import { test, expect } from '@playwright/test';

test.describe('Minimal Test - Verify Playwright Works', () => {
  test('can load the application', async ({ page }) => {
    await page.goto('/');

    // Just verify page loads
    await expect(page).toHaveTitle(/Dash Identity Manager/);
  });

  test('displays app header', async ({ page }) => {
    await page.goto('/');

    const header = page.locator('.app-header');
    await expect(header).toBeVisible();
  });

  test('shows login or dashboard view', async ({ page }) => {
    await page.goto('/');

    // Should show either login view or dashboard
    const loginView = page.locator('#login-view');
    const dashboardView = page.locator('#dashboard-view');
    const welcomeState = page.locator('#welcome-state');

    // One of these should be visible
    const isLoginVisible = await loginView.isVisible().catch(() => false);
    const isDashboardVisible = await dashboardView.isVisible().catch(() => false);
    const isWelcomeVisible = await welcomeState.isVisible().catch(() => false);

    expect(isLoginVisible || isDashboardVisible || isWelcomeVisible).toBe(true);
  });
});
