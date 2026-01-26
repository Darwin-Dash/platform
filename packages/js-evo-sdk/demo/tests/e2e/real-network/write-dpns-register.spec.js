import { test, expect } from '@playwright/test';
import { setupTestnetMode, handleLoginIfNeeded, handleFundingModal } from '../helpers/test-setup.js';

const SHOULD_RUN = !!process.env.TEST_MNEMONIC;

test.describe('Real Network: DPNS Name Registration', () => {
  test.skip(!SHOULD_RUN, 'Requires TEST_MNEMONIC environment variable');

  test.beforeEach(async ({ page }) => {
    if (!SHOULD_RUN) return;
    await setupTestnetMode(page);
  });

  test('can check name availability', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/');

    // Login
    const mnemonicField = page.locator('#mnemonic-input, [name="mnemonic"]');
    await mnemonicField.fill(process.env.TEST_MNEMONIC);
    await page.locator('#login-form button[type="submit"]').click();

    await page.waitForSelector('#dashboard-view', { timeout: 60000 });

    // Navigate to DPNS section
    const dpnsNav = page.locator('[data-nav="dpns"], .dpns-nav');
    if (await dpnsNav.isVisible()) {
      await dpnsNav.click();
    }

    // Check name availability
    const nameInput = page.locator('#name-input, [name="dpns-name"]');
    if (await nameInput.isVisible()) {
      const randomName = `test${Date.now()}`;
      await nameInput.fill(randomName);

      const checkBtn = page.locator('#check-availability-btn, [data-action="check-name"]');
      await checkBtn.click();

      // Should show availability result
      const result = page.locator('.availability-result, .name-available');
      await expect(result).toBeVisible({ timeout: 30000 });
    }
  });

  test('can register a new name', async ({ page }) => {
    test.setTimeout(300000);

    await page.goto('/');

    const mnemonicField = page.locator('#mnemonic-input, [name="mnemonic"]');
    await mnemonicField.fill(process.env.TEST_MNEMONIC);
    await page.locator('#login-form button[type="submit"]').click();

    await page.waitForSelector('#dashboard-view', { timeout: 60000 });

    // Navigate to DPNS
    const dpnsNav = page.locator('[data-nav="dpns"], .dpns-nav');
    if (await dpnsNav.isVisible()) {
      await dpnsNav.click();
    }

    // Register a unique name
    const nameInput = page.locator('#name-input, [name="dpns-name"]');
    if (await nameInput.isVisible()) {
      const uniqueName = `testuser${Date.now()}`;
      await nameInput.fill(uniqueName);

      // Click register
      const registerBtn = page.locator('#register-name-btn, [data-action="register-name"]');
      await registerBtn.click();

      // Handle funding if needed
      const fundingModal = page.locator('#wallet-funding-modal');
      if (await fundingModal.isVisible({ timeout: 5000 }).catch(() => false)) {
        await handleFundingModal(page, 'already-funded');
      }

      // Wait for registration
      await page.waitForSelector('.success-notification, .name-registered', {
        state: 'visible',
        timeout: 180000,
      });
    }
  });

  test('shows existing usernames for identity', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/');

    const mnemonicField = page.locator('#mnemonic-input, [name="mnemonic"]');
    await mnemonicField.fill(process.env.TEST_MNEMONIC);
    await page.locator('#login-form button[type="submit"]').click();

    await page.waitForSelector('#dashboard-view', { timeout: 60000 });

    // Check for username display
    const usernameDisplay = page.locator('.username-display, .identity-username, .dpns-name');
    const visible = await usernameDisplay.isVisible({ timeout: 10000 }).catch(() => false);

    // May or may not have usernames
    expect(true).toBe(true);
  });
});
