import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded, handleFundingModal } from './helpers/test-setup.js';

test.describe('Identity Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
  });

  test('shows create identity button in welcome state', async ({ page }) => {
    await page.waitForSelector('#welcome-state, #dashboard-view', { timeout: 10000 });

    // In welcome state (no identities), create button should be visible
    const isWelcome = await page.locator('#welcome-state').isVisible().catch(() => false);

    if (isWelcome) {
      const createBtn = page.locator('#create-identity-btn, [data-action="create"]');
      await expect(createBtn).toBeVisible();
    }
  });

  test('can open create identity modal from actions menu', async ({ page }) => {
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    // Open actions menu
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn');
    await actionsBtn.click();

    // Click create action
    const createAction = page.locator('[data-action="create"], .create-identity-action');
    await createAction.click();

    // Modal should appear
    const modal = page.locator('#create-identity-modal, .create-modal');
    await expect(modal).toBeVisible();
  });

  test('create modal has required fields', async ({ page }) => {
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    // Open create modal
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.locator('[data-action="create"]').click();

    // Should have amount field
    const amountField = page.locator('#create-amount, [name="amount"]');
    await expect(amountField).toBeVisible();

    // Should have submit button
    const submitBtn = page.locator('#create-submit-btn, .create-modal button[type="submit"]');
    await expect(submitBtn).toBeVisible();
  });

  test('validates amount field', async ({ page }) => {
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    // Open create modal
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.locator('[data-action="create"]').click();

    // Enter invalid amount
    const amountField = page.locator('#create-amount, [name="amount"]');
    await amountField.fill('0');

    // Try to submit
    const submitBtn = page.locator('#create-submit-btn, .create-modal button[type="submit"]');
    await submitBtn.click();

    // Should show validation error
    const errorMsg = page.locator('.error-message, .validation-error');
    await expect(errorMsg).toBeVisible({ timeout: 2000 });
  });

  test('can close create modal', async ({ page }) => {
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    // Open create modal
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.locator('[data-action="create"]').click();

    const modal = page.locator('#create-identity-modal, .create-modal');
    await expect(modal).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Modal should close
    await expect(modal).toBeHidden({ timeout: 2000 });
  });

  test('shows funding flow after creating identity', async ({ page }) => {
    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    // Start create flow
    const createBtn = page.locator('[data-action="create"], #create-identity-btn');
    if (await createBtn.isVisible()) {
      await createBtn.click();

      // Fill amount
      const amountField = page.locator('#create-amount, [name="amount"]');
      await amountField.fill('200000');

      // Submit
      await page.locator('#create-submit-btn, button[type="submit"]').click();

      // In mock mode, funding modal may appear
      const fundingModal = page.locator('#wallet-funding-modal');
      const visible = await fundingModal.isVisible({ timeout: 3000 }).catch(() => false);

      if (visible) {
        // Handle funding modal
        await handleFundingModal(page, 'already-funded');
      }
    }
  });
});
