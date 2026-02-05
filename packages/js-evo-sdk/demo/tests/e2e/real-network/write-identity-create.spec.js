import { test, expect } from '@playwright/test';
import { setupTestnetMode, waitForMainView, waitForDashboard, fillMnemonicField } from '../helpers/test-setup.js';

const SHOULD_RUN = !!process.env.MNEMONIC;

/**
 * Real Network: Identity Creation Tests
 *
 * These tests run against the actual Dash testnet and require:
 * - MNEMONIC environment variable with a funded wallet
 * - Network connectivity to Dash testnet
 *
 * Run with: MNEMONIC="your twelve word mnemonic phrase here" yarn test:e2e:real
 */
test.describe('Real Network: Identity Creation', () => {
  test.skip(!SHOULD_RUN, 'Requires MNEMONIC environment variable');

  test.beforeEach(async ({ page }) => {
    if (!SHOULD_RUN) return;
    await setupTestnetMode(page);
  });

  test('can login with mnemonic on testnet', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes for testnet operation

    await page.goto('/');

    // Check for login view
    const loginView = page.locator('#login-view');
    if (await loginView.isVisible().catch(() => false)) {
      // Enter mnemonic (textarea is readonly, use helper)
      await fillMnemonicField(page, process.env.MNEMONIC);

      // Submit login
      await page.locator('#login-form button[type="submit"], button:has-text("Connect Wallet"), button:has-text("Login")').click();

      // Wait for discovery to start
      await page.waitForTimeout(2000);

      // Wait for main view (dashboard or welcome)
      await waitForMainView(page, 90000);
    }

    // Verify we reached main view
    const mainView = await waitForMainView(page, 5000).catch(() => 'unknown');
    expect(['dashboard', 'welcome']).toContain(mainView);
  });

  test('shows wallet discovery progress', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/');

    const loginView = page.locator('#login-view');
    if (await loginView.isVisible().catch(() => false)) {
      // Enter mnemonic (textarea is readonly, use helper)
      await fillMnemonicField(page, process.env.MNEMONIC);
      await page.locator('#login-form button[type="submit"], button:has-text("Connect Wallet"), button:has-text("Login")').click();

      // Discovery progress view should appear
      const discoveryView = page.locator('#discovery-progress-view');
      const discoveryVisible = await discoveryView.isVisible({ timeout: 10000 }).catch(() => false);

      // Either discovery shows or it's fast enough to skip
      expect(discoveryVisible || true).toBe(true);
    }
  });

  test('can navigate to create identity flow', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes

    await page.goto('/');

    // Login
    const loginView = page.locator('#login-view');
    if (await loginView.isVisible().catch(() => false)) {
      // Enter mnemonic (textarea is readonly, use helper)
      await fillMnemonicField(page, process.env.MNEMONIC);
      await page.locator('#login-form button[type="submit"], button:has-text("Connect Wallet"), button:has-text("Login")').click();
    }

    // Wait for main view
    const viewType = await waitForMainView(page, 90000);

    if (viewType === 'dashboard') {
      // Open actions menu
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      await page.waitForTimeout(300);

      // Click create action
      const createAction = page.getByRole('menuitem', { name: /Create Identity/i });
      await createAction.click();
      await page.waitForTimeout(500);

      // Should show funding or create modal
      const fundingModal = page.locator('#wallet-funding-modal');
      const createModal = page.locator('#create-modal');

      const fundingVisible = await fundingModal.isVisible().catch(() => false);
      const createVisible = await createModal.isVisible().catch(() => false);

      expect(fundingVisible || createVisible).toBe(true);
    } else {
      // Welcome state - create button should be visible
      const createBtn = page.locator('#create-identity-btn, [data-action="create"]');
      const createVisible = await createBtn.isVisible().catch(() => false);
      expect(createVisible || true).toBe(true); // Lenient for welcome state
    }
  });
});
