/**
 * E2E tests for Realtime Funding Flow
 * Tests the "Sending now" path with InstantSend + ChainLock monitoring
 */
import { test, expect } from '@playwright/test';

test.describe('Realtime Funding Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Force mock mode for predictable testing
    await page.addInitScript(() => {
      localStorage.setItem('useMockMode', 'true');
      localStorage.setItem('dash-logged-in', 'true');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Monitoring Step', () => {
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
  });

  test.describe('Transaction Detection', () => {
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

    test('displays transaction ID when detected', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#sending-now-btn');

        // Wait for transaction detection
        await expect(page.locator('.status-tx-detected')).toBeVisible({ timeout: 15000 });

        // Check TX ID is displayed
        const txIdText = await page.locator('.tx-id').textContent();
        expect(txIdText).toContain('TX:');
      }
    });
  });

  test.describe('InstantLock Confirmation', () => {
    test('shows InstantLock confirmation status', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#sending-now-btn');

        // Wait for InstantLock (after TX detection)
        await expect(page.locator('.status-instantlocked')).toBeVisible({ timeout: 20000 });
      }
    });

    test('updates progress stages for InstantLock', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#sending-now-btn');

        // Wait for InstantLock
        await expect(page.locator('.status-instantlocked')).toBeVisible({ timeout: 20000 });

        // Check stage indicators
        const txStage = page.locator('#stage-tx');
        const isStage = page.locator('#stage-is');

        await expect(txStage).toHaveClass(/stage-complete/);
        await expect(isStage).toHaveClass(/stage-complete/);
      }
    });
  });

  test.describe('ChainLock Confirmation', () => {
    test('shows ChainLock confirmation status', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#sending-now-btn');

        // Wait for ChainLock (after InstantLock)
        await expect(page.locator('.status-chainlocked')).toBeVisible({ timeout: 25000 });
      }
    });

    test('updates all progress stages for ChainLock', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#sending-now-btn');

        // Wait for ChainLock
        await expect(page.locator('.status-chainlocked')).toBeVisible({ timeout: 25000 });

        // Check all stage indicators are complete
        const clStage = page.locator('#stage-cl');
        await expect(clStage).toHaveClass(/stage-complete/);
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
  });

  test.describe('Confirmation Step', () => {
    test('displays balance after confirmation', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#sending-now-btn');

        // Wait for confirmation
        await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 30000 });

        // Check balance is displayed
        const balanceText = await page.locator('.detected-balance').textContent();
        expect(balanceText).toContain('DASH');
      }
    });

    test('shows proceed button after confirmation', async ({ page }) => {
      const createBtn = page.locator('[data-action="create-identity"], #create-identity-btn, button:has-text("Create Identity")').first();

      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.click('#sending-now-btn');

        await expect(page.locator('.funding-confirmed')).toBeVisible({ timeout: 30000 });
        await expect(page.locator('#proceed-to-create-btn')).toBeVisible();
      }
    });
  });

  test.describe('Navigation', () => {
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

  test.describe('Complete Flow', () => {
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

  test.describe('Copy Address', () => {
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
  });
});
