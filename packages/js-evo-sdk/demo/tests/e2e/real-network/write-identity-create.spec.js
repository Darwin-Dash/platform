import { test, expect } from '@playwright/test';
import { setupTestnetMode, handleLoginIfNeeded, handleFundingModal } from '../helpers/test-setup.js';

const SHOULD_RUN = !!process.env.TEST_MNEMONIC;

test.describe('Real Network: Identity Creation', () => {
  test.skip(!SHOULD_RUN, 'Requires TEST_MNEMONIC environment variable');

  test.beforeEach(async ({ page }) => {
    if (!SHOULD_RUN) return;
    await setupTestnetMode(page);
  });

  test('can create identity on testnet', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes for testnet operation

    // Login with test mnemonic
    await page.goto('/');

    const mnemonicField = page.locator('#mnemonic-input, [name="mnemonic"]');
    await mnemonicField.fill(process.env.TEST_MNEMONIC);

    await page.locator('#login-form button[type="submit"]').click();

    // Wait for wallet discovery
    await page.waitForSelector('#dashboard-view, #welcome-state', {
      state: 'visible',
      timeout: 60000
    });

    // Open create identity modal
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn');
    if (await actionsBtn.isVisible()) {
      await actionsBtn.click();
      await page.locator('[data-action="create"]').click();
    } else {
      // Welcome state - click create button directly
      await page.locator('#create-identity-btn, [data-action="create"]').click();
    }

    // Fill amount
    const amountField = page.locator('#create-amount, [name="amount"]');
    await amountField.fill('200000');

    // Submit
    await page.locator('button[type="submit"]').click();

    // Handle funding modal if shown
    const fundingModal = page.locator('#wallet-funding-modal');
    const fundingVisible = await fundingModal.isVisible({ timeout: 5000 }).catch(() => false);

    if (fundingVisible) {
      await handleFundingModal(page, 'already-funded');
    }

    // Wait for creation to complete
    await page.waitForSelector('.success-notification, .identity-created', {
      state: 'visible',
      timeout: 180000, // 3 minutes
    });

    // Verify identity was created
    const successMsg = page.locator('.success-notification, .identity-created');
    await expect(successMsg).toBeVisible();
  });

  test('shows progress during creation', async ({ page }) => {
    test.setTimeout(300000);

    await page.goto('/');

    const mnemonicField = page.locator('#mnemonic-input, [name="mnemonic"]');
    await mnemonicField.fill(process.env.TEST_MNEMONIC);
    await page.locator('#login-form button[type="submit"]').click();

    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 60000 });

    // Start creation
    const createBtn = page.locator('[data-action="create"], #create-identity-btn');
    if (await createBtn.isVisible()) {
      await createBtn.click();

      const amountField = page.locator('#create-amount, [name="amount"]');
      await amountField.fill('200000');
      await page.locator('button[type="submit"]').click();

      // Handle funding if shown
      const fundingModal = page.locator('#wallet-funding-modal');
      if (await fundingModal.isVisible({ timeout: 3000 }).catch(() => false)) {
        await handleFundingModal(page, 'already-funded');
      }

      // Should show progress indicator
      const progress = page.locator('.progress-indicator, .loading, .creating');
      await expect(progress).toBeVisible({ timeout: 10000 });
    }
  });
});
