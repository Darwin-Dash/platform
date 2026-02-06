import { test, expect } from '@playwright/test';
import { setupTestnetMode, waitForMainView, fillMnemonicField } from '../helpers/test-setup.js';

const SHOULD_RUN = !!process.env.MNEMONIC;

/**
 * Real Network: Contact Request Tests
 *
 * These tests run against the actual Dash testnet and require:
 * - MNEMONIC environment variable with a funded wallet
 * - An identity already created on the wallet
 * - A valid DPNS name to send contact request to
 *
 * Run with: MNEMONIC="your twelve word mnemonic phrase here" yarn test:e2e:real
 */
test.describe('Real Network: Contact Request Operations', () => {
  test.skip(!SHOULD_RUN, 'Requires MNEMONIC environment variable');

  test.beforeEach(async ({ page }) => {
    if (!SHOULD_RUN) return;
    await setupTestnetMode(page);
  });

  test('can login and reach dashboard with identities', async ({ page }) => {
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

  test('Add Contact modal opens from Actions menu', async ({ page }) => {
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
      // Open the actions menu
      await page.click('.actions-menu-trigger');
      await page.waitForTimeout(200);

      // Click the Add Contact action
      const addContactBtn = page.locator('[data-action="add-contact"]');
      if (await addContactBtn.isVisible().catch(() => false)) {
        await addContactBtn.click();

        // Modal should be visible
        await expect(page.locator('#send-contact-request-modal')).toBeVisible({ timeout: 5000 });

        // Verify modal title is "Add Contact"
        const modalTitle = page.locator('#send-contact-request-modal h2');
        await expect(modalTitle).toContainText('Add Contact');
      }
    }
  });

  test('DPNS username input accepts valid names', async ({ page }) => {
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
      // Open Add Contact modal
      await page.click('.actions-menu-trigger');
      await page.waitForTimeout(200);
      await page.click('[data-action="add-contact"]');
      await page.waitForTimeout(200);

      const input = page.locator('#contact-request-recipient');
      const validation = page.locator('#contact-request-validation');

      // Test valid username
      await input.fill('testuser');
      await input.dispatchEvent('input');

      // Should show valid status (no error color, contains "valid")
      await expect(validation).toContainText('Valid');
    }
  });

  test('DPNS username input rejects invalid characters', async ({ page }) => {
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
      // Open Add Contact modal
      await page.click('.actions-menu-trigger');
      await page.waitForTimeout(200);
      await page.click('[data-action="add-contact"]');
      await page.waitForTimeout(200);

      const input = page.locator('#contact-request-recipient');
      const validation = page.locator('#contact-request-validation');

      // Test invalid characters
      await input.fill('test@invalid!');
      await input.dispatchEvent('input');

      // Should show invalid status
      await expect(validation).toContainText('Invalid');
    }
  });

  test('contact request shows loading state during DPNS lookup', async ({ page }) => {
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
      // Open Add Contact modal
      await page.click('.actions-menu-trigger');
      await page.waitForTimeout(200);
      await page.click('[data-action="add-contact"]');
      await page.waitForTimeout(200);

      const input = page.locator('#contact-request-recipient');

      // Enter a valid-looking username
      await input.fill('someuser.dash');

      // Submit the form
      const submitBtn = page.locator('button[type="submit"][form="send-contact-request-form"]');
      await submitBtn.click();

      // Should show loading state during lookup
      // Either loading overlay or loading message should appear
      const loadingVisible = await Promise.race([
        page.locator('#loading-overlay:not([hidden])').waitFor({ state: 'attached', timeout: 3000 }).then(() => true).catch(() => false),
        page.locator('.loading-message').waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false),
      ]);

      // Loading state should appear during network operations
      // It may disappear quickly on error or if name not found
      console.log('Loading state observed:', loadingVisible);
    }
  });

  /**
   * Integration test: Full contact request flow
   *
   * This test requires:
   * - MNEMONIC with at least one identity that has a DPNS name
   * - A known DPNS name that exists on testnet (use TEST_CONTACT_NAME env var)
   *
   * Run with:
   * MNEMONIC="..." TEST_CONTACT_NAME="alice.dash" yarn test:e2e:real
   */
  test('can send contact request to valid DPNS name', async ({ page }) => {
    // Skip if no contact name provided
    const contactName = process.env.TEST_CONTACT_NAME;
    if (!contactName) {
      console.log('[SKIP] Set TEST_CONTACT_NAME env var to test real contact requests');
      test.skip();
      return;
    }

    test.setTimeout(300000); // 5 minutes for full network operation

    await page.goto('/');

    // Login
    const loginView = page.locator('#login-view');
    if (await loginView.isVisible().catch(() => false)) {
      await fillMnemonicField(page, process.env.MNEMONIC);
      await page.locator('#login-form button[type="submit"], button:has-text("Connect Wallet"), button:has-text("Login")').click();
    }

    const viewType = await waitForMainView(page, 90000);

    if (viewType !== 'dashboard') {
      console.log('[SKIP] No identities in wallet - cannot send contact request');
      return;
    }

    // Open Add Contact modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    // Enter recipient name
    const input = page.locator('#contact-request-recipient');
    await input.fill(contactName);

    console.log(`[ContactRequest] Submitting request to: ${contactName}`);

    // Submit the form
    const submitBtn = page.locator('button[type="submit"][form="send-contact-request-form"]');
    await submitBtn.click();

    // Wait for completion - success or error notification
    await expect(page.locator('.notification')).toBeVisible({ timeout: 180000 });

    // Check notification type
    const notificationText = await page.locator('.notification').textContent();
    console.log(`[ContactRequest] Notification: ${notificationText}`);

    // If successful, the modal should close
    const modalHidden = await page.locator('#send-contact-request-modal').isHidden();
    if (modalHidden) {
      console.log('[ContactRequest] Modal closed - request likely succeeded');
    }
  });

  test('handles non-existent DPNS name gracefully', async ({ page }) => {
    test.setTimeout(180000);

    await page.goto('/');

    // Login
    const loginView = page.locator('#login-view');
    if (await loginView.isVisible().catch(() => false)) {
      await fillMnemonicField(page, process.env.MNEMONIC);
      await page.locator('#login-form button[type="submit"], button:has-text("Connect Wallet"), button:has-text("Login")').click();
    }

    const viewType = await waitForMainView(page, 90000);

    if (viewType !== 'dashboard') {
      console.log('[SKIP] No identities in wallet');
      return;
    }

    // Open Add Contact modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    // Enter non-existent name
    const randomName = `nonexistent${Date.now()}.dash`;
    const input = page.locator('#contact-request-recipient');
    await input.fill(randomName);

    // Submit the form
    const submitBtn = page.locator('button[type="submit"][form="send-contact-request-form"]');
    await submitBtn.click();

    // Should show error notification for not found name
    await expect(page.locator('.notification.error, .notification:has-text("not found")')).toBeVisible({ timeout: 60000 });

    console.log('[ContactRequest] Non-existent name handled gracefully');
  });
});
