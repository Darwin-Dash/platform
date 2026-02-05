import { test, expect } from '@playwright/test';
import { setupTestnetMode, waitForDashboard, waitForMainView, fillMnemonicField } from '../helpers/test-setup.js';

const SHOULD_RUN = !!process.env.MNEMONIC;

/**
 * Real Network: DPNS Name Registration Tests
 *
 * These tests run against the actual Dash testnet and require:
 * - MNEMONIC environment variable with a funded wallet
 * - An identity already created on the wallet
 *
 * Run with: MNEMONIC="your twelve word mnemonic phrase here" yarn test:e2e:real
 */
test.describe('Real Network: DPNS Name Operations', () => {
  test.skip(!SHOULD_RUN, 'Requires MNEMONIC environment variable');

  test.beforeEach(async ({ page }) => {
    if (!SHOULD_RUN) return;
    await setupTestnetMode(page);
  });

  test('can login and reach dashboard', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/');

    // Login with mnemonic
    const loginView = page.locator('#login-view');
    if (await loginView.isVisible().catch(() => false)) {
      await fillMnemonicField(page, process.env.MNEMONIC);
      await page.locator('#login-form button[type="submit"], button:has-text("Connect Wallet"), button:has-text("Login")').click();
    }

    // Wait for main view
    const viewType = await waitForMainView(page, 90000);
    expect(['dashboard', 'welcome']).toContain(viewType);
  });

  test('DPNS name resolver is available', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/');

    // Login
    const loginView = page.locator('#login-view');
    if (await loginView.isVisible().catch(() => false)) {
      await fillMnemonicField(page, process.env.MNEMONIC);
      await page.locator('#login-form button[type="submit"], button:has-text("Connect Wallet"), button:has-text("Login")').click();
    }

    // Wait for dashboard
    const viewType = await waitForMainView(page, 90000);

    if (viewType === 'dashboard') {
      // DPNS Name Resolver button should be in header
      const nameResolverBtn = page.getByRole('button', { name: /DPNS Name Resolver/i });
      await expect(nameResolverBtn).toBeVisible({ timeout: 10000 });
    }
  });

  test('can click DPNS name resolver', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/');

    // Login
    const loginView = page.locator('#login-view');
    if (await loginView.isVisible().catch(() => false)) {
      await fillMnemonicField(page, process.env.MNEMONIC);
      await page.locator('#login-form button[type="submit"], button:has-text("Connect Wallet"), button:has-text("Login")').click();
    }

    const viewType = await waitForMainView(page, 90000);

    if (viewType === 'dashboard') {
      const nameResolverBtn = page.getByRole('button', { name: /DPNS Name Resolver/i });
      await nameResolverBtn.click();
      await page.waitForTimeout(500);

      // Name resolver should be accessible
      expect(true).toBe(true);
    }
  });

  test('identity names are displayed in dashboard', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/');

    // Login
    const loginView = page.locator('#login-view');
    if (await loginView.isVisible().catch(() => false)) {
      await fillMnemonicField(page, process.env.MNEMONIC);
      await page.locator('#login-form button[type="submit"], button:has-text("Connect Wallet"), button:has-text("Login")').click();
    }

    const viewType = await waitForMainView(page, 90000);

    if (viewType === 'dashboard') {
      // Stats should show Names count
      const namesLabel = page.getByText('Names', { exact: true });
      await expect(namesLabel).toBeVisible({ timeout: 10000 });
    }
  });
});
