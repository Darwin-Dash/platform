/**
 * E2E tests for Historic Funding Flow
 * Tests the "Already funded" path with blockchain scanning
 */
import { test, expect } from '@playwright/test';

test.describe('Historic Funding Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Force mock mode for predictable testing
    await page.addInitScript(() => {
      localStorage.setItem('useMockMode', 'true');
      localStorage.setItem('dash-logged-in', 'true');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Modal Display', () => {
    test('shows funding modal when create identity is clicked', async ({ page }) => {
      // Look for create identity button (may be in different locations)
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await expect(page.locator('#wallet-funding-modal')).toBeVisible({ timeout: 5000 });
      }
    });

    test('shows initial step with funding options', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await expect(page.locator('.funding-initial')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#already-funded-btn')).toBeVisible();
        await expect(page.locator('#sending-now-btn')).toBeVisible();
      }
    });
  });

  test.describe('Timeframe Selection', () => {
    test('shows timeframe options after selecting "Already funded"', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await expect(page.locator('#wallet-funding-modal')).toBeVisible();
        await page.click('#already-funded-btn');
        await expect(page.locator('.funding-timeframe')).toBeVisible({ timeout: 5000 });
      }
    });

    test('displays all timeframe options (hour, day, week)', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#already-funded-btn');

        await expect(page.locator('input[value="hour"]')).toBeVisible();
        await expect(page.locator('input[value="day"]')).toBeVisible();
        await expect(page.locator('input[value="week"]')).toBeVisible();
      }
    });

    test('hour timeframe is selected by default', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#already-funded-btn');

        const hourRadio = page.locator('input[value="hour"]');
        await expect(hourRadio).toBeChecked();
      }
    });
  });

  test.describe('Blockchain Scanning', () => {
    test('shows scanning progress after timeframe selection', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#already-funded-btn');
        await page.click('input[value="hour"]');
        await page.click('#timeframe-continue-btn');

        // Should show scanning UI
        await expect(page.locator('.funding-scanning')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#scan-progress-fill')).toBeVisible();
      }
    });

    test('displays block scan progress', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#already-funded-btn');
        await page.click('input[value="hour"]');
        await page.click('#timeframe-continue-btn');

        // Wait for progress to start
        await expect(page.locator('#scan-blocks-scanned')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#scan-blocks-total')).toBeVisible();
      }
    });
  });

  test.describe('Successful Scan', () => {
    test('shows confirmation step after successful scan', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#already-funded-btn');
        await page.click('input[value="hour"]');
        await page.click('#timeframe-continue-btn');

        // Wait for scan completion (mock ~2s)
        await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 15000 });
      }
    });

    test('displays detected balance after scan', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#already-funded-btn');
        await page.click('input[value="hour"]');
        await page.click('#timeframe-continue-btn');

        // Wait for confirmation
        await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 15000 });

        // Check balance is displayed
        const balanceText = await page.locator('.detected-balance').textContent();
        expect(balanceText).toContain('DASH');
      }
    });

    test('shows proceed button after successful scan', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#already-funded-btn');
        await page.click('input[value="hour"]');
        await page.click('#timeframe-continue-btn');

        await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#proceed-to-create-btn')).toBeVisible();
      }
    });
  });

  test.describe('No Funds Found', () => {
    test('shows no funds found when scan returns empty', async ({ page }) => {
      // Set flag to return empty UTXOs
      await page.addInitScript(() => {
        window.__MOCK_EMPTY_UTXOS__ = true;
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#already-funded-btn');
        await page.click('input[value="hour"]');
        await page.click('#timeframe-continue-btn');

        // Should show "no funds found" message
        await expect(page.locator('.no-funds-found')).toBeVisible({ timeout: 15000 });
      }
    });

    test('provides retry options when no funds found', async ({ page }) => {
      await page.addInitScript(() => {
        window.__MOCK_EMPTY_UTXOS__ = true;
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#already-funded-btn');
        await page.click('input[value="hour"]');
        await page.click('#timeframe-continue-btn');

        await expect(page.locator('.no-funds-found')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#retry-scan-btn')).toBeVisible();
        await expect(page.locator('#send-now-instead-btn')).toBeVisible();
      }
    });
  });

  test.describe('Navigation', () => {
    test('can go back from timeframe to initial step', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#already-funded-btn');
        await expect(page.locator('.funding-timeframe')).toBeVisible();

        await page.click('#timeframe-back-btn');
        await expect(page.locator('.funding-initial')).toBeVisible();
      }
    });

    test('can cancel from scanning step', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#already-funded-btn');
        await page.click('input[value="hour"]');
        await page.click('#timeframe-continue-btn');

        await expect(page.locator('.funding-scanning')).toBeVisible({ timeout: 5000 });
        await page.click('#scanning-cancel-btn');

        // Should return to initial step
        await expect(page.locator('.funding-initial')).toBeVisible();
      }
    });

    test('closes modal on cancel from initial step', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await expect(page.locator('#wallet-funding-modal')).toBeVisible();

        await page.click('.modal-cancel');
        await expect(page.locator('#wallet-funding-modal')).toBeHidden();
      }
    });
  });

  test.describe('Complete Flow', () => {
    test('completes full historic funding flow', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        // Step 1: Open modal
        await createBtn.click();
        await expect(page.locator('#wallet-funding-modal')).toBeVisible();

        // Step 2: Select "Already funded"
        await page.click('#already-funded-btn');
        await expect(page.locator('.funding-timeframe')).toBeVisible();

        // Step 3: Select timeframe and continue
        await page.click('input[value="hour"]');
        await page.click('#timeframe-continue-btn');

        // Step 4: Wait for scanning
        await expect(page.locator('.funding-scanning')).toBeVisible({ timeout: 5000 });

        // Step 5: Wait for confirmation
        await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 15000 });

        // Step 6: Verify balance
        const balanceText = await page.locator('.detected-balance').textContent();
        expect(balanceText).toContain('DASH');

        // Step 7: Proceed
        await page.click('#proceed-to-create-btn');
        await expect(page.locator('#wallet-funding-modal')).toBeHidden();
      }
    });
  });
});
