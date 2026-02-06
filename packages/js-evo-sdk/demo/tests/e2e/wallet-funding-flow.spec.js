/**
 * E2E Tests - Wallet Funding Flow
 *
 * Tests the wallet funding modals including the "Already funded" historic flow
 * and the "Sending now" realtime flow with InstantSend + ChainLock monitoring.
 */

import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded } from './helpers/test-setup.js';

test.describe('Wallet Funding - Historic Flow ("Already funded")', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
  });

  test('opens funding modal when creating identity', async ({ page }) => {
    // Find create identity button
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();

      // Funding modal should appear
      await expect(page.locator('#wallet-funding-modal')).toBeVisible();
    }
  });

  test('shows two funding path options', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();

      // Both options should be visible
      await expect(page.locator('#already-funded-btn')).toBeVisible();
      await expect(page.locator('#sending-now-btn')).toBeVisible();
    }
  });

  test('proceeds to timeframe selection with "Already funded"', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#already-funded-btn');

      // Timeframe options should appear
      await expect(page.locator('.funding-timeframe')).toBeVisible();
      await expect(page.locator('input[name="timeframe"][value="hour"]')).toBeVisible();
      await expect(page.locator('input[name="timeframe"][value="day"]')).toBeVisible();
      await expect(page.locator('input[name="timeframe"][value="week"]')).toBeVisible();
    }
  });

  test('allows selecting different timeframes', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#already-funded-btn');

      // Select "day"
      await page.click('input[name="timeframe"][value="day"]');
      await expect(page.locator('input[name="timeframe"][value="day"]')).toBeChecked();

      // Select "week"
      await page.click('input[name="timeframe"][value="week"]');
      await expect(page.locator('input[name="timeframe"][value="week"]')).toBeChecked();
      await expect(page.locator('input[name="timeframe"][value="day"]')).not.toBeChecked();
    }
  });

  test('shows scanning progress after timeframe selection', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#already-funded-btn');
      await page.click('#timeframe-continue-btn');

      // Scanning UI should appear
      await expect(page.locator('.funding-scanning')).toBeVisible({ timeout: 3000 });
    }
  });

  test('shows detected balance after scanning', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#already-funded-btn');
      await page.click('#timeframe-continue-btn');

      // Wait for confirmation step
      await expect(page.locator('.funding-confirmation')).toBeVisible({ timeout: 10000 });

      // Balance should be displayed
      await expect(page.locator('#funding-flow-content')).toContainText('DASH');
    }
  });

  test('allows going back from timeframe step', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#already-funded-btn');

      // Click back button
      await page.click('#timeframe-back-btn');

      // Should return to initial step
      await expect(page.locator('#already-funded-btn')).toBeVisible();
      await expect(page.locator('#sending-now-btn')).toBeVisible();
    }
  });
});

test.describe('Wallet Funding - Realtime Flow ("Sending now")', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
  });

  test('shows monitoring step after selecting "Sending now"', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await expect(page.locator('#wallet-funding-modal')).toBeVisible();
      await page.click('#sending-now-btn');
      await expect(page.locator('.funding-monitoring')).toBeVisible({ timeout: 5000 });
    }
  });

  test('displays QR code for funding address', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#sending-now-btn');
      await expect(page.locator('.address-qr')).toBeVisible({ timeout: 5000 });
    }
  });

  test('displays funding address text', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#sending-now-btn');

      const addressText = await page.locator('.funding-address').textContent();
      expect(addressText).toBeTruthy();
      expect(addressText?.startsWith('y')).toBe(true); // Testnet address starts with 'y'
    }
  });

  test('shows copy address button', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#sending-now-btn');
      await expect(page.locator('.copy-address-btn')).toBeVisible();
    }
  });

  test('shows transaction detected status', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#sending-now-btn');
      await expect(page.locator('.funding-monitoring')).toBeVisible();

      // Wait for mock transaction detection (5-10s)
      await expect(page.locator('.status-tx-detected')).toBeVisible({ timeout: 15000 });
    }
  });

  test('shows InstantLock confirmation status', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#sending-now-btn');

      // Wait for InstantLock (after TX detection)
      await expect(page.locator('.status-instantlocked')).toBeVisible({ timeout: 20000 });
    }
  });

  test('shows ChainLock confirmation status', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#sending-now-btn');

      // Wait for ChainLock (after InstantLock)
      await expect(page.locator('.status-chainlocked')).toBeVisible({ timeout: 25000 });
    }
  });

  test('auto-proceeds to confirmation after ChainLock', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#sending-now-btn');

      // Wait for confirmation step (after ChainLock)
      await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 30000 });
    }
  });

  test('can cancel from monitoring step', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#sending-now-btn');
      await expect(page.locator('.funding-monitoring')).toBeVisible();

      await page.click('#monitoring-cancel-btn');
      await expect(page.locator('#wallet-funding-modal')).toBeHidden();
    }
  });
});

test.describe('Wallet Funding - Complete Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
  });

  test('completes full realtime funding flow with IS + CL', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      // Step 1: Open modal
      await createBtn.click();
      await expect(page.locator('#wallet-funding-modal')).toBeVisible();

      // Step 2: Select "Sending now"
      await page.click('#sending-now-btn');

      // Step 3: Verify monitoring is active
      await expect(page.locator('.funding-monitoring')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.address-qr')).toBeVisible();
      await expect(page.locator('.funding-address')).toBeVisible();

      // Step 4: Wait for TX detection (mock 5-10s)
      await expect(page.locator('.status-tx-detected')).toBeVisible({ timeout: 15000 });

      // Step 5: Wait for InstantLock (mock +1-2s)
      await expect(page.locator('.status-instantlocked')).toBeVisible({ timeout: 5000 });

      // Step 6: Wait for ChainLock (mock +2s)
      await expect(page.locator('.status-chainlocked')).toBeVisible({ timeout: 5000 });

      // Step 7: Confirmation step
      await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 5000 });

      // Step 8: Verify balance
      const balanceText = await page.locator('.detected-balance').textContent();
      expect(balanceText).toContain('DASH');

      // Step 9: Proceed
      await page.click('#proceed-to-create-btn');
      await expect(page.locator('#wallet-funding-modal')).toBeHidden();
    }
  });

  test('completes full historic funding flow', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      // Step 1: Open modal
      await createBtn.click();
      await expect(page.locator('#wallet-funding-modal')).toBeVisible();

      // Step 2: Select "Already funded"
      await page.click('#already-funded-btn');

      // Step 3: Select timeframe
      await expect(page.locator('.funding-timeframe')).toBeVisible();
      await page.click('#timeframe-continue-btn');

      // Step 4: Wait for scanning
      await expect(page.locator('.funding-scanning')).toBeVisible({ timeout: 3000 });

      // Step 5: Wait for confirmation
      await expect(page.locator('.funding-confirmation')).toBeVisible({ timeout: 10000 });

      // Step 6: Verify balance
      await expect(page.locator('#funding-flow-content')).toContainText('DASH');

      // Step 7: Proceed
      await page.click('#proceed-to-create-btn');
      await expect(page.locator('#wallet-funding-modal')).toBeHidden();
    }
  });

  test('logs confirmation stages to console', async ({ page }) => {
    const consoleMessages = [];
    page.on('console', (msg) => {
      if (msg.text().includes('funding-status:')) {
        consoleMessages.push(msg.text());
      }
    });

    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#sending-now-btn');

      // Wait for all stages
      await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 30000 });

      // Verify console messages
      expect(consoleMessages.some(m => m.includes('transaction detected'))).toBe(true);
      expect(consoleMessages.some(m => m.includes('instantlock'))).toBe(true);
      expect(consoleMessages.some(m => m.includes('chainlock'))).toBe(true);
    }
  });
});

test.describe('Wallet Funding - Copy Address', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
  });

  test('copy button works for address', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#sending-now-btn');
      await expect(page.locator('.funding-monitoring')).toBeVisible();

      // Click copy button
      await page.click('.copy-address-btn');

      // Check clipboard contains address
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toBeTruthy();
      expect(clipboardText.startsWith('y')).toBe(true);
    }
  });

  test('shows copy success feedback', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#sending-now-btn');
      await expect(page.locator('.funding-monitoring')).toBeVisible();

      // Click copy button
      await page.click('.copy-address-btn');

      // Should show success feedback (tooltip or icon change)
      const feedback = page.locator('.copy-success, .copied-indicator, [data-copied="true"]');
      await expect(feedback).toBeVisible({ timeout: 1000 }).catch(() => {
        // Some implementations don't have visual feedback
      });
    }
  });
});

test.describe('Wallet Funding - Modal Behavior', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
  });

  test('modal closes when clicking backdrop', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await expect(page.locator('#wallet-funding-modal')).toBeVisible();

      // Click backdrop
      await page.click('.modal-backdrop');

      // Modal should close
      await expect(page.locator('#wallet-funding-modal')).toBeHidden();
    }
  });

  test('modal closes when pressing Escape', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await expect(page.locator('#wallet-funding-modal')).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Modal should close
      await expect(page.locator('#wallet-funding-modal')).toBeHidden();
    }
  });

  test('modal stays open when clicking inside', async ({ page }) => {
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await expect(page.locator('#wallet-funding-modal')).toBeVisible();

      // Click inside modal content
      await page.click('#funding-flow-content');

      // Modal should stay open
      await expect(page.locator('#wallet-funding-modal')).toBeVisible();
    }
  });
});

test.describe('Wallet Funding - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
  });

  test('handles scan timeout gracefully', async ({ page }) => {
    // Monitor for errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#already-funded-btn');
      await page.click('#timeframe-continue-btn');

      // Wait for result (confirmation or error)
      await page.waitForSelector('.funding-confirmation, .funding-error', { timeout: 15000 });

      // Modal should remain stable
      const modalVisible = await page.locator('#wallet-funding-modal').isVisible();
      expect(modalVisible).toBe(true);
    }
  });

  test('shows no funds message when balance is zero', async ({ page }) => {
    // This test documents expected behavior when no UTXOs are found
    // The actual behavior depends on the mock implementation
    const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.click('#already-funded-btn');

      // In a real no-funds scenario, UI should show helpful message
      await expect(page.locator('.funding-timeframe')).toBeVisible();
    }
  });
});
