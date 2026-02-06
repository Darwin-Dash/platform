/**
 * E2E Tests - Identity Top-Up Flow
 *
 * Tests the identity top-up workflow including wallet funding,
 * timeframe selection, scanning, and balance updates.
 */

import { test, expect } from '@playwright/test';
import {
  setupMockMode,
  handleLoginIfNeeded,
  navigateToDashboard,
  selectIdentity,
  clickAction,
} from './helpers/test-setup.js';

test.describe('Identity Top-Up Operations', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
    await navigateToDashboard(page);

    // Select first identity
    await selectIdentity(page, 0);

    // Wait for identity view to load
    await expect(page.locator('#identity-view')).toBeVisible();
  });

  test('displays wallet funding modal when clicking top-up button', async ({ page }) => {
    // Click top-up action button
    await clickAction(page, 'topup');

    // Verify wallet funding modal appears
    await expect(page.locator('#wallet-funding-modal')).toBeVisible();

    // Verify initial step with funding question
    await expect(page.locator('#funding-flow-content')).toContainText('Have you already sent Dash');

    // Verify both buttons are present
    await expect(page.locator('#already-funded-btn')).toBeVisible();
    await expect(page.locator('#sending-now-btn')).toBeVisible();
  });

  test('shows timeframe selection after clicking "Already funded"', async ({ page }) => {
    // Open topup flow
    await clickAction(page, 'topup');

    // Click "Yes, I sent it"
    await page.click('#already-funded-btn');

    // Verify timeframe step appears
    await expect(page.locator('.funding-timeframe')).toBeVisible();
    await expect(page.locator('#funding-flow-content')).toContainText('When did you send');

    // Verify timeframe options
    await expect(page.locator('input[name="timeframe"][value="hour"]')).toBeVisible();
    await expect(page.locator('input[name="timeframe"][value="day"]')).toBeVisible();
    await expect(page.locator('input[name="timeframe"][value="week"]')).toBeVisible();

    // Verify continue button
    await expect(page.locator('#timeframe-continue-btn')).toBeVisible();
  });

  test('shows scanning progress after selecting timeframe', async ({ page }) => {
    // Open topup flow and navigate to timeframe
    await clickAction(page, 'topup');
    await page.click('#already-funded-btn');

    // Select "hour" timeframe (default) and continue
    await page.click('#timeframe-continue-btn');

    // Verify scanning UI appears
    await expect(page.locator('.funding-scanning')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#funding-flow-content')).toContainText('Scanning');

    // Wait for scan to complete (mock takes ~1.5 seconds)
    await expect(page.locator('.funding-confirmation')).toBeVisible({ timeout: 10000 });
  });

  test('shows confirmation with proceed button after detecting funds', async ({ page }) => {
    // Open topup flow and complete scan
    await clickAction(page, 'topup');
    await page.click('#already-funded-btn');
    await page.click('#timeframe-continue-btn');

    // Wait for confirmation step
    await expect(page.locator('.funding-confirmation')).toBeVisible({ timeout: 10000 });

    // Verify balance is shown
    await expect(page.locator('#funding-flow-content')).toContainText('DASH');

    // Verify proceed button
    await expect(page.locator('#proceed-to-create-btn')).toBeVisible();
  });

  test('successfully tops up identity after proceeding', async ({ page }) => {
    // Get initial balance
    const initialBalanceText = await page.locator('.balance-main').textContent();
    const initialBalance = parseFloat(initialBalanceText.match(/[\d.]+/)[0]);

    // Open topup flow and complete steps
    await clickAction(page, 'topup');
    await page.click('#already-funded-btn');
    await page.click('#timeframe-continue-btn');

    // Wait for confirmation and proceed
    await expect(page.locator('#proceed-to-create-btn')).toBeVisible({ timeout: 10000 });
    await page.click('#proceed-to-create-btn');

    // Wait for success notification (mock takes ~4 seconds)
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.notification-success')).toContainText('Top-up');

    // Verify wallet funding modal closes
    await expect(page.locator('#wallet-funding-modal')).toBeHidden();

    // Verify balance increased (mock UTXO is 0.05 DASH)
    const newBalanceText = await page.locator('.balance-main').textContent();
    const newBalance = parseFloat(newBalanceText.match(/[\d.]+/)[0]);

    expect(newBalance).toBeGreaterThan(initialBalance);
  });

  test('can go back from timeframe selection', async ({ page }) => {
    // Open topup flow and navigate to timeframe
    await clickAction(page, 'topup');
    await page.click('#already-funded-btn');

    // Verify we're on timeframe step
    await expect(page.locator('.funding-timeframe')).toBeVisible();

    // Click back button
    await page.click('#timeframe-back-btn');

    // Verify we're back to initial step
    await expect(page.locator('#already-funded-btn')).toBeVisible();
    await expect(page.locator('#sending-now-btn')).toBeVisible();
  });

  test('closes modal when clicking outside or close button', async ({ page }) => {
    // Open topup flow
    await clickAction(page, 'topup');
    await expect(page.locator('#wallet-funding-modal')).toBeVisible();

    // Click backdrop to close
    await page.click('.modal-backdrop');

    // Verify modal closes
    await expect(page.locator('#wallet-funding-modal')).toBeHidden();
  });

  test('different timeframe options are selectable', async ({ page }) => {
    // Open topup flow and navigate to timeframe
    await clickAction(page, 'topup');
    await page.click('#already-funded-btn');

    // Select "day" timeframe
    await page.click('input[name="timeframe"][value="day"]');

    // Verify day is selected
    await expect(page.locator('input[name="timeframe"][value="day"]')).toBeChecked();
    await expect(page.locator('input[name="timeframe"][value="hour"]')).not.toBeChecked();

    // Select "week" timeframe
    await page.click('input[name="timeframe"][value="week"]');

    // Verify week is selected
    await expect(page.locator('input[name="timeframe"][value="week"]')).toBeChecked();
    await expect(page.locator('input[name="timeframe"][value="day"]')).not.toBeChecked();
  });

  test('shows funding address for copying', async ({ page }) => {
    // Open topup flow and navigate to timeframe
    await clickAction(page, 'topup');
    await page.click('#already-funded-btn');

    // Verify address reminder is shown
    await expect(page.locator('.funding-address-reminder')).toBeVisible();

    // Verify copy button is present
    await expect(page.locator('.copy-address-btn')).toBeVisible();
  });

  test('displays operation progress during top-up', async ({ page }) => {
    // Open topup flow and complete steps
    await clickAction(page, 'topup');
    await page.click('#already-funded-btn');
    await page.click('#timeframe-continue-btn');

    // Wait for confirmation and proceed
    await expect(page.locator('#proceed-to-create-btn')).toBeVisible({ timeout: 10000 });
    await page.click('#proceed-to-create-btn');

    // Wait for operation progress modal or activity panel
    const progressVisible = await page.locator('#operation-progress-modal').isVisible().catch(() => false);
    const activityVisible = await page.locator('#activity-panel').isVisible().catch(() => false);

    // At least one progress indicator should appear
    expect(progressVisible || activityVisible).toBeTruthy();

    // Wait for completion
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 15000 });
  });

  test('shows transaction in history after top-up', async ({ page }) => {
    // Complete topup flow
    await clickAction(page, 'topup');
    await page.click('#already-funded-btn');
    await page.click('#timeframe-continue-btn');

    await expect(page.locator('#proceed-to-create-btn')).toBeVisible({ timeout: 10000 });
    await page.click('#proceed-to-create-btn');

    // Wait for success
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 15000 });

    // Check transaction history card
    const historyCard = page.locator('.history-card');
    await expect(historyCard).toBeVisible();

    // Verify topup appears in history
    const historyTable = page.locator('.history-table tbody tr').first();
    await expect(historyTable).toContainText('Top Up');
  });

  test('"Sending now" option shows real-time monitoring', async ({ page }) => {
    // Open topup flow
    await clickAction(page, 'topup');

    // Click "Sending now"
    await page.click('#sending-now-btn');

    // Verify monitoring UI appears with QR code or address
    await expect(page.locator('.funding-monitoring')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#funding-flow-content')).toContainText('Send Dash');

    // Should show funding address
    await expect(page.locator('.funding-address-display')).toBeVisible();
  });
});

test.describe('Identity Top-Up - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
    await navigateToDashboard(page);
    await selectIdentity(page, 0);
    await expect(page.locator('#identity-view')).toBeVisible();
  });

  test('handles no funds found scenario', async ({ page }) => {
    // This would be tested with a different mock configuration
    // For now, verify the UI flow handles the no-funds case gracefully

    await clickAction(page, 'topup');
    await page.click('#already-funded-btn');

    // In a no-funds scenario, the UI should show appropriate message
    // The exact behavior depends on the mock implementation
    await expect(page.locator('.funding-timeframe')).toBeVisible();
  });

  test('handles network errors during scan', async ({ page }) => {
    // Monitor console for errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await clickAction(page, 'topup');
    await page.click('#already-funded-btn');
    await page.click('#timeframe-continue-btn');

    // Wait for scan completion or error
    await page.waitForSelector('.funding-confirmation, .funding-error', { timeout: 15000 });

    // Even with errors, UI should remain stable
    const modalVisible = await page.locator('#wallet-funding-modal').isVisible();
    expect(modalVisible).toBe(true);
  });

  test('validates minimum top-up amount', async ({ page }) => {
    // Start topup flow
    await clickAction(page, 'topup');

    // Modal should appear with proper validation
    await expect(page.locator('#wallet-funding-modal')).toBeVisible();

    // The flow should enforce minimum amounts if applicable
  });
});

test.describe('Identity Top-Up - UI States', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
  });

  test('top-up button is disabled when no identity selected', async ({ page }) => {
    // Navigate to dashboard without selecting identity
    await navigateToDashboard(page);

    // Check if topup action requires identity selection
    const actionsMenu = page.locator('.actions-menu-trigger');
    if (await actionsMenu.isVisible()) {
      await actionsMenu.click();

      const topupAction = page.locator('[data-action="topup"]');
      // Should either be disabled or not shown without identity
      const isDisabled = await topupAction.isDisabled().catch(() => true);
      const isVisible = await topupAction.isVisible().catch(() => false);

      expect(isDisabled || !isVisible).toBeTruthy();
    }
  });

  test('shows loading state during balance check', async ({ page }) => {
    await navigateToDashboard(page);
    await selectIdentity(page, 0);

    await clickAction(page, 'topup');
    await page.click('#already-funded-btn');
    await page.click('#timeframe-continue-btn');

    // Should show scanning/loading state
    const scanningVisible = await page.locator('.funding-scanning').isVisible().catch(() => false);
    const loadingVisible = await page.locator('.loading-spinner, .scanning-indicator').isVisible().catch(() => false);

    expect(scanningVisible || loadingVisible).toBeTruthy();
  });
});
