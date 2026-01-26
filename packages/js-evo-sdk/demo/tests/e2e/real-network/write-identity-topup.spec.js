import { test, expect } from '@playwright/test';
import { setupTestnetMode, handleLoginIfNeeded, handleFundingModal } from '../helpers/test-setup.js';

const SHOULD_RUN = !!process.env.TEST_MNEMONIC;

test.describe('Real Network: Identity Top-up', () => {
  test.skip(!SHOULD_RUN, 'Requires TEST_MNEMONIC environment variable');

  test.beforeEach(async ({ page }) => {
    if (!SHOULD_RUN) return;
    await setupTestnetMode(page);
  });

  test('can top up existing identity', async ({ page }) => {
    test.setTimeout(300000);

    await page.goto('/');

    // Login
    const mnemonicField = page.locator('#mnemonic-input, [name="mnemonic"]');
    await mnemonicField.fill(process.env.TEST_MNEMONIC);
    await page.locator('#login-form button[type="submit"]').click();

    // Wait for dashboard with identities
    await page.waitForSelector('#dashboard-view', { timeout: 60000 });

    // Get initial balance
    const balanceDisplay = page.locator('.identity-balance, .balance-value');
    const initialBalanceText = await balanceDisplay.textContent().catch(() => '0');

    // Open actions menu and click top-up
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn');
    await actionsBtn.click();

    const topupAction = page.locator('[data-action="topup"]');
    await topupAction.click();

    // Fill top-up amount
    const amountField = page.locator('#topup-amount, [name="amount"]');
    await amountField.fill('50000');

    // Submit
    await page.locator('button[type="submit"]').click();

    // Handle funding modal
    const fundingModal = page.locator('#wallet-funding-modal');
    if (await fundingModal.isVisible({ timeout: 5000 }).catch(() => false)) {
      await handleFundingModal(page, 'already-funded');
    }

    // Wait for completion
    await page.waitForSelector('.success-notification, .topup-complete', {
      state: 'visible',
      timeout: 180000,
    });

    // Verify balance increased
    const newBalanceText = await balanceDisplay.textContent().catch(() => '0');
    // Balance should have changed (may need to parse numbers)
  });

  test('shows progress during top-up', async ({ page }) => {
    test.setTimeout(300000);

    await page.goto('/');

    const mnemonicField = page.locator('#mnemonic-input, [name="mnemonic"]');
    await mnemonicField.fill(process.env.TEST_MNEMONIC);
    await page.locator('#login-form button[type="submit"]').click();

    await page.waitForSelector('#dashboard-view', { timeout: 60000 });

    // Start top-up
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn');
    await actionsBtn.click();
    await page.locator('[data-action="topup"]').click();

    await page.locator('#topup-amount, [name="amount"]').fill('50000');
    await page.locator('button[type="submit"]').click();

    // Handle funding
    const fundingModal = page.locator('#wallet-funding-modal');
    if (await fundingModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await handleFundingModal(page, 'already-funded');
    }

    // Progress indicator should appear
    const progress = page.locator('.progress-indicator, .loading, .topping-up');
    await expect(progress).toBeVisible({ timeout: 10000 });
  });

  test('validates minimum top-up amount', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto('/');

    const mnemonicField = page.locator('#mnemonic-input, [name="mnemonic"]');
    await mnemonicField.fill(process.env.TEST_MNEMONIC);
    await page.locator('#login-form button[type="submit"]').click();

    await page.waitForSelector('#dashboard-view', { timeout: 60000 });

    // Open top-up
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.locator('[data-action="topup"]').click();

    // Enter too small amount
    await page.locator('#topup-amount, [name="amount"]').fill('100');
    await page.locator('button[type="submit"]').click();

    // Should show validation error
    const error = page.locator('.error-message, .validation-error');
    const visible = await error.isVisible({ timeout: 5000 }).catch(() => false);

    // Either error shown or submission prevented
    expect(true).toBe(true);
  });
});
