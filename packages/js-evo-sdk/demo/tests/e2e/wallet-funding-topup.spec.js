/**
 * E2E Test: Wallet Funding Flow → Identity Top-Up
 * Tests the complete flow from wallet funding to identity top-up execution
 */

import { test, expect } from '@playwright/test';

test.describe('Wallet Funding → Top-Up Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set mock mode and login state BEFORE page loads
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('useMockMode', 'true');
      localStorage.setItem('dash-logged-in', 'true');
    });

    // Navigate to app
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('should complete wallet funding and proceed to topup operation', async ({ page }) => {
    // Step 1: Click Top Up button on first identity card
    const topUpBtn = page.locator('button:has-text("Top Up")').first();
    await topUpBtn.click();

    // Step 2: Funding modal should appear
    await expect(page.locator('#wallet-funding-modal')).toBeVisible();
    await expect(page.locator('.funding-initial')).toBeVisible();

    // Step 3: Click "No, sending now" to simulate InstantSend flow
    await page.click('#sending-now-btn');

    // Step 4: Wait for monitoring step with address display
    await expect(page.locator('.funding-monitoring')).toBeVisible();
    await expect(page.locator('.address-text')).toBeVisible();

    // Step 5: Simulate InstantSend transaction received
    // (Mock platform ops will auto-trigger this after delay)
    await page.waitForSelector('.funding-confirmed', { timeout: 15000 });

    // Step 6: Verify confirmation step shows
    await expect(page.locator('.funding-confirmed')).toBeVisible();
    await expect(page.locator('#proceed-to-create-btn')).toBeVisible();

    // Step 7: Click continue button
    await page.click('#proceed-to-create-btn');

    // Step 8: Funding modal should close
    await expect(page.locator('#wallet-funding-modal')).toBeHidden();

    // Step 9: Should show topup progress
    // Check for topup operation starting - either in activity list or progress modal
    const operationStarted = await Promise.race([
      page.locator('#activity-list .activity-item:has-text("Top Up")')
        .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false),
      page.locator('#operation-progress-modal')
        .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
    ]);

    expect(operationStarted).toBe(true);
  });

  test('should handle already-funded wallet path for topup', async ({ page }) => {
    // Step 1: Click Top Up button
    const topUpBtn = page.locator('button:has-text("Top Up")').first();
    await topUpBtn.click();

    // Step 2: Funding modal appears
    await expect(page.locator('#wallet-funding-modal')).toBeVisible();

    // Step 3: Click "Yes, I sent it"
    await page.click('#already-funded-btn');

    // Step 4: Select timeframe
    await expect(page.locator('.funding-timeframe')).toBeVisible();
    await page.click('[data-timeframe="hour"]');
    await page.click('#timeframe-continue-btn');

    // Step 5: Wait for balance check
    await page.waitForSelector('.funding-confirmed', { timeout: 30000 });

    // Step 6: Click continue
    await page.click('#proceed-to-create-btn');

    // Step 7: Should proceed to topup operation
    await expect(page.locator('#wallet-funding-modal')).toBeHidden();

    // Should start topup operation - check activity list or progress modal
    const operationStarted = await Promise.race([
      page.locator('#activity-list .activity-item:has-text("Top Up")')
        .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false),
      page.locator('#operation-progress-modal')
        .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
    ]);

    expect(operationStarted).toBe(true);
  });

  test('should show correct button text in funding confirmation', async ({ page }) => {
    // Context is topup, button should say "Continue to Identity Top-Up"

    // Start topup flow
    const topUpBtn = page.locator('button:has-text("Top Up")').first();
    await topUpBtn.click();

    await page.click('#already-funded-btn');
    await page.click('[data-timeframe="hour"]');
    await page.click('#timeframe-continue-btn');

    // Wait for confirmation
    await page.waitForSelector('.funding-confirmed', { timeout: 30000 });

    // Check button text - should say "Continue to Identity Top-Up" when context is topup
    const continueBtn = page.locator('#proceed-to-create-btn');
    await expect(continueBtn).toBeVisible();
    await expect(continueBtn).toContainText('Continue to Identity Top-Up');
  });

  test('should not show notifications popup on successful funding continuation', async ({ page }) => {
    // Complete funding flow
    const topUpBtn = page.locator('button:has-text("Top Up")').first();
    await topUpBtn.click();

    await page.click('#already-funded-btn');
    await page.click('[data-timeframe="hour"]');
    await page.click('#timeframe-continue-btn');
    await page.waitForSelector('.funding-confirmed', { timeout: 30000 });

    // Click continue
    await page.click('#proceed-to-create-btn');

    // Should NOT show notification center dropdown
    const notificationDropdown = page.locator('.notification-center-dropdown');
    await expect(notificationDropdown).toBeHidden();

    // Should show operation progress instead
    const hasProgress = await Promise.race([
      page.locator('#activity-list .activity-item:has-text("Top Up")')
        .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false),
      page.locator('#operation-progress-modal')
        .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
    ]);

    expect(hasProgress).toBe(true);
  });
});
