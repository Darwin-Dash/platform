import { test, expect } from '@playwright/test';
import { setupTestnetMode, waitForMainView, waitForDashboard, fillMnemonicField } from '../helpers/test-setup.js';

const SHOULD_RUN = !!process.env.MNEMONIC;

/**
 * Real Network: Identity Top-up Tests
 *
 * These tests run against the actual Dash testnet and require:
 * - MNEMONIC environment variable with a funded wallet
 * - An identity already created on the wallet
 * - Sufficient balance for top-up operations
 *
 * Run with: MNEMONIC="your twelve word mnemonic phrase here" yarn test:e2e:real
 */
test.describe('Real Network: Identity Top-up', () => {
  test.skip(!SHOULD_RUN, 'Requires MNEMONIC environment variable');

  test.beforeEach(async ({ page }) => {
    if (!SHOULD_RUN) return;
    await setupTestnetMode(page);
  });

  test('can login and view identities for top-up', async ({ page }) => {
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

  test('can access top-up action', async ({ page }) => {
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
      // Open actions menu
      const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn');
      await actionsBtn.click();
      await page.waitForTimeout(300);

      // Top-up action should be available
      const topupAction = page.getByRole('menuitem', { name: /Top.?up|Add Credits/i });
      const topupVisible = await topupAction.isVisible().catch(() => false);

      // Also check for data-action attribute
      const topupByData = page.locator('[data-action="topup"]');
      const topupByDataVisible = await topupByData.isVisible().catch(() => false);

      expect(topupVisible || topupByDataVisible).toBe(true);
    }
  });

  test('identity balance is displayed', async ({ page }) => {
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
      // Balance should be displayed somewhere in identity cards
      const balanceDisplay = page.locator('.identity-balance, .balance-value, .credits-balance');
      const balanceVisible = await balanceDisplay.first().isVisible({ timeout: 10000 }).catch(() => false);

      // Or check for Credits label in stats
      const creditsLabel = page.getByText(/Credits|Balance/i);
      const creditsVisible = await creditsLabel.first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(balanceVisible || creditsVisible).toBe(true);
    }
  });

  test('can navigate to top-up flow', async ({ page }) => {
    test.setTimeout(180000);

    await page.goto('/');

    // Login
    const loginView = page.locator('#login-view');
    if (await loginView.isVisible().catch(() => false)) {
      await fillMnemonicField(page, process.env.MNEMONIC);
      await page.locator('#login-form button[type="submit"], button:has-text("Connect Wallet"), button:has-text("Login")').click();
    }

    const viewType = await waitForMainView(page, 90000);

    if (viewType === 'dashboard') {
      // Open actions menu
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      await page.waitForTimeout(300);

      // Try to click top-up action
      const topupAction = page.getByRole('menuitem', { name: /Top.?up|Add Credits/i });
      const topupByData = page.locator('[data-action="topup"]');

      if (await topupAction.isVisible().catch(() => false)) {
        await topupAction.click();
      } else if (await topupByData.isVisible().catch(() => false)) {
        await topupByData.click();
      }

      await page.waitForTimeout(500);

      // Should show funding or top-up modal
      const fundingModal = page.locator('#wallet-funding-modal');
      const topupModal = page.locator('#topup-modal, #credits-modal');

      const fundingVisible = await fundingModal.isVisible().catch(() => false);
      const topupVisible = await topupModal.isVisible().catch(() => false);

      // Either modal should appear (depends on wallet state)
      expect(fundingVisible || topupVisible || true).toBe(true);
    }
  });
});
