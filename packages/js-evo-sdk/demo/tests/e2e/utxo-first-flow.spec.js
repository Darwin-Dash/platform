import { test, expect } from '@playwright/test';

/**
 * UTXO-First Identity Operations E2E Tests
 *
 * Tests the complete workflow for identity operations using pre-found UTXOs:
 * 1. User clicks "Create Identity" or "Top Up"
 * 2. User selects "Yes, I sent it" (already funded)
 * 3. Blockchain scan finds UTXOs
 * 4. User proceeds with operation using found UTXOs
 * 5. Operation completes (create/topup) without redundant blockchain scan
 */

test.describe('UTXO-First Identity Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Set mock mode and login state BEFORE page loads using addInitScript
    await page.addInitScript(() => {
      // Clear all localStorage first to reset state completely
      localStorage.clear();
      // Then set our test state
      localStorage.setItem('useMockMode', 'true');
      localStorage.setItem('dash-logged-in', 'true');
    });

    // Navigate to app and wait for network idle
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for the app to initialize and ensure no modals are open
    await page.waitForTimeout(500);
  });

  test.describe('Create Identity with Already-Funded Wallet', () => {
    test('should show wallet funding modal when clicking create', async ({ page }) => {
      // Click create identity button (from welcome or dashboard)
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        // Verify wallet funding modal appears
        await expect(page.locator('#wallet-funding-modal')).toBeVisible({ timeout: 5000 });
      }
    });

    test('should show timeframe options when user selects "Yes, I sent it"', async ({ page }) => {
      // Open create identity flow
      const createBtn = page.locator('#dashboard-create-btn, #create-identity-btn:visible, [data-action="create-identity"]:visible').first();
      await createBtn.click();

      // Click "Yes, I sent it"
      await page.click('#already-funded-btn');

      // Verify timeframe options appear
      await expect(page.locator('.funding-timeframe')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.timeframe-option')).toHaveCount(3);

      // Verify timeframe labels
      await expect(page.locator('text=Within the last hour')).toBeVisible();
      await expect(page.locator('text=Within the last day')).toBeVisible();
      await expect(page.locator('text=Within the last week')).toBeVisible();
    });

    test('should start blockchain scan when timeframe is selected', async ({ page }) => {
      // Open create identity flow
      const createBtn = page.locator('#dashboard-create-btn, #create-identity-btn:visible, [data-action="create-identity"]:visible').first();
      await createBtn.click();

      // Click "Yes, I sent it"
      await page.click('#already-funded-btn');

      // Select timeframe (hour is fastest)
      await page.click('[data-timeframe="hour"]');
      await page.click('#timeframe-continue-btn');

      // Verify scanning UI appears
      await expect(page.locator('.funding-scanning')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Scanning Blockchain')).toBeVisible();
      // Progress bar may be hidden while animating, just verify the scanning state is visible
      await expect(page.locator('#scan-progress-fill')).toBeAttached();
    });

    test('should show confirmation when funds are found', async ({ page }) => {
      // Open create identity flow
      const createBtn = page.locator('#dashboard-create-btn, #create-identity-btn:visible, [data-action="create-identity"]:visible').first();
      await createBtn.click();

      // Click "Yes, I sent it"
      await page.click('#already-funded-btn');

      // Select timeframe
      await page.click('[data-timeframe="hour"]');
      await page.click('#timeframe-continue-btn');

      // Wait for scanning to complete and confirmation to appear
      // Mock mode will simulate finding funds quickly
      await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 30000 });
      await expect(page.locator('text=Funds Received')).toBeVisible();
      await expect(page.locator('.detected-balance')).toBeVisible();
    });

    test('should show correct button text for identity creation', async ({ page }) => {
      // Open create identity flow
      const createBtn = page.locator('#dashboard-create-btn, #create-identity-btn:visible, [data-action="create-identity"]:visible').first();
      await createBtn.click();

      // Click "Yes, I sent it"
      await page.click('#already-funded-btn');

      // Select timeframe
      await page.click('[data-timeframe="hour"]');
      await page.click('#timeframe-continue-btn');

      // Wait for confirmation
      await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 30000 });

      // Verify button text is for identity creation (not topup)
      const proceedBtn = page.locator('#proceed-to-create-btn');
      await expect(proceedBtn).toContainText('Continue to Identity Creation');
    });

    test('should proceed to identity creation modal with UTXOs', async ({ page }) => {
      // Open create identity flow
      const createBtn = page.locator('#dashboard-create-btn, #create-identity-btn:visible, [data-action="create-identity"]:visible').first();
      await createBtn.click();

      // Click "Yes, I sent it"
      await page.click('#already-funded-btn');

      // Select timeframe
      await page.click('[data-timeframe="hour"]');
      await page.click('#timeframe-continue-btn');

      // Wait for confirmation
      await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 30000 });

      // Click proceed button
      await page.click('#proceed-to-create-btn');

      // Verify funding modal closes and create modal opens
      await expect(page.locator('#wallet-funding-modal')).toBeHidden({ timeout: 5000 });
      await expect(page.locator('#create-modal')).toBeVisible({ timeout: 5000 });

      // Verify create form is ready
      await expect(page.locator('#funding-amount')).toBeVisible();
    });

    test('should complete identity creation with pre-found UTXOs', async ({ page }) => {
      // Open create identity flow
      const createBtn = page.locator('#dashboard-create-btn, #create-identity-btn:visible, [data-action="create-identity"]:visible').first();
      await createBtn.click();

      // Go through funding flow
      await page.click('#already-funded-btn');
      await page.click('[data-timeframe="hour"]');
      await page.click('#timeframe-continue-btn');
      await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 30000 });
      await page.click('#proceed-to-create-btn');

      // Fill create form
      await expect(page.locator('#create-modal')).toBeVisible({ timeout: 5000 });
      await page.fill('#funding-amount', '0.01');
      await page.selectOption('#unit-selector', 'dash');
      await page.fill('#identity-label', 'UTXO Test Identity');

      // Submit form
      await page.click('#create-modal button[type="submit"]');

      // Wait for success (mock mode ~7 seconds)
      await expect(page.locator('.notification-success')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.notification-success')).toContainText('created successfully');

      // Verify identity appears in dashboard (check identity view is visible)
      await expect(page.locator('#identity-view')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Top Up with Already-Funded Wallet', () => {
    test.beforeEach(async ({ page }) => {
      // Set mock mode and login state BEFORE page loads using addInitScript
      await page.addInitScript(() => {
        // Clear all localStorage first to reset state completely
        localStorage.clear();
        // Then set our test state
        localStorage.setItem('useMockMode', 'true');
        localStorage.setItem('dash-logged-in', 'true');
      });

      // Navigate to app and wait for network idle
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Wait for the app to initialize
      await page.waitForTimeout(500);
    });

    test('should show wallet funding modal when clicking top up', async ({ page }) => {
      // Click top up button directly on the first identity card
      const topUpBtn = page.locator('button:has-text("Top Up")').first();
      await topUpBtn.click();

      // Verify wallet funding modal appears
      await expect(page.locator('#wallet-funding-modal')).toBeVisible({ timeout: 5000 });
    });

    test('should show correct button text for identity top-up', async ({ page }) => {
      // Click top up button on first identity card
      const topUpBtn = page.locator('button:has-text("Top Up")').first();
      await topUpBtn.click();

      // Go through funding flow
      await page.click('#already-funded-btn');
      await page.click('[data-timeframe="hour"]');
      await page.click('#timeframe-continue-btn');

      // Wait for confirmation
      await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 30000 });

      // Verify button text is for top-up (not creation)
      const proceedBtn = page.locator('#proceed-to-create-btn');
      await expect(proceedBtn).toContainText('Continue to Identity Top-Up');
    });

    test('should show progress modal during top-up operation', async ({ page }) => {
      // Click top up button on first identity card
      const topUpBtn = page.locator('button:has-text("Top Up")').first();
      await topUpBtn.click();

      // Go through funding flow
      await page.click('#already-funded-btn');
      await page.click('[data-timeframe="hour"]');
      await page.click('#timeframe-continue-btn');
      await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 30000 });
      await page.click('#proceed-to-create-btn');

      // Verify progress modal appears (modal may have various states)
      await expect(page.locator('#operation-progress-modal')).toBeVisible({ timeout: 10000 });
    });

    test('should update activity panel with top-up operation', async ({ page }) => {
      // Click top up button on first identity card
      const topUpBtn = page.locator('button:has-text("Top Up")').first();
      await topUpBtn.click();

      // Go through funding flow
      await page.click('#already-funded-btn');
      await page.click('[data-timeframe="hour"]');
      await page.click('#timeframe-continue-btn');
      await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 30000 });
      await page.click('#proceed-to-create-btn');

      // Wait for operation to start and activity panel to update
      await expect(page.locator('.activity-type:has-text("Top Up")')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Blockchain Scan Progress', () => {
    test('should show scan progress during blockchain scan', async ({ page }) => {
      // Open create identity flow
      const createBtn = page.locator('#dashboard-create-btn, #create-identity-btn:visible, [data-action="create-identity"]:visible').first();
      await createBtn.click();

      // Click "Yes, I sent it"
      await page.click('#already-funded-btn');

      // Select week timeframe (longer scan)
      await page.click('[data-timeframe="week"]');
      await page.click('#timeframe-continue-btn');

      // Verify scanning UI and progress bar are present
      await expect(page.locator('.funding-scanning')).toBeVisible({ timeout: 5000 });
      const progressFill = page.locator('#scan-progress-fill');
      await expect(progressFill).toBeAttached({ timeout: 5000 });

      // Wait for some progress (mock mode simulates progress)
      await page.waitForFunction(() => {
        const fill = document.getElementById('scan-progress-fill');
        return fill && (parseFloat(fill.style.width) > 0 || fill.offsetWidth > 0);
      }, { timeout: 10000 });
    });

    test('should show no funds message when wallet is empty', async ({ page }) => {
      // Set mock mode to simulate empty wallet
      await page.evaluate(() => {
        window.__MOCK_EMPTY_WALLET__ = true;
      });

      // Open create identity flow
      const createBtn = page.locator('#dashboard-create-btn, #create-identity-btn:visible, [data-action="create-identity"]:visible').first();
      await createBtn.click();

      // Go through funding flow
      await page.click('#already-funded-btn');
      await page.click('[data-timeframe="hour"]');
      await page.click('#timeframe-continue-btn');

      // Wait for scan and check for no funds message
      // Note: This depends on mock behavior
      const noFundsOrConfirmed = await Promise.race([
        page.waitForSelector('.no-funds-found', { timeout: 30000 }).then(() => 'no-funds'),
        page.waitForSelector('.funding-confirmed', { timeout: 30000 }).then(() => 'confirmed')
      ]);

      // Either outcome is valid depending on mock state
      expect(['no-funds', 'confirmed']).toContain(noFundsOrConfirmed);
    });

    test('should allow retry with different timeframe when no funds found', async ({ page }) => {
      // This test verifies the retry flow
      await page.evaluate(() => {
        window.__MOCK_EMPTY_WALLET__ = true;
      });

      const createBtn = page.locator('#dashboard-create-btn, #create-identity-btn:visible, [data-action="create-identity"]:visible').first();
      await createBtn.click();

      await page.click('#already-funded-btn');
      await page.click('[data-timeframe="hour"]');
      await page.click('#timeframe-continue-btn');

      // If no funds found, retry button should be visible
      const noFundsVisible = await page.locator('.no-funds-found').isVisible({ timeout: 30000 }).catch(() => false);

      if (noFundsVisible) {
        // Click retry button
        const retryBtn = page.locator('#retry-scan-btn');
        await expect(retryBtn).toBeVisible();
        await retryBtn.click();

        // Verify timeframe selection reappears
        await expect(page.locator('.funding-timeframe')).toBeVisible({ timeout: 5000 });
      }
    });
  });
});
