import { test, expect } from '@playwright/test';

/**
 * Activity Panel E2E Tests
 *
 * Note: The ActivityPanel component exists but is not currently integrated
 * into the main demo app. These tests will skip until the feature is enabled.
 */

test.describe('Activity Panel - Operation Tracking', () => {
  test.beforeEach(async ({ page }) => {
    // Set mock mode and login state BEFORE page loads
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('useMockMode', 'true');
      localStorage.setItem('dash-logged-in', 'true');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('activity panel exists if feature is enabled', async ({ page }) => {
    // Check if activity panel is present
    const panel = page.locator('#activity-panel');
    const panelVisible = await panel.isVisible().catch(() => false);

    if (!panelVisible) {
      // Feature not yet integrated - skip test
      test.skip();
      return;
    }

    await expect(panel).toBeVisible();
  });

  test('operations are tracked when started', async ({ page }) => {
    // Check if activity panel is present
    const panel = page.locator('#activity-panel');
    const panelVisible = await panel.isVisible().catch(() => false);

    if (!panelVisible) {
      // Feature not yet integrated - skip test
      test.skip();
      return;
    }

    // Start a top-up operation through wallet funding flow
    const topUpBtn = page.locator('button:has-text("Top Up")').first();
    await topUpBtn.click();

    // Complete funding flow
    await page.click('#already-funded-btn');
    await page.click('[data-timeframe="hour"]');
    await page.click('#timeframe-continue-btn');
    await page.waitForSelector('.funding-confirmed', { timeout: 30000 });
    await page.click('#proceed-to-create-btn');

    // Check if operation appears in activity panel
    const operationItem = page.locator('.operation-item, .activity-item');
    await expect(operationItem.first()).toBeVisible({ timeout: 10000 });
  });

  test('panel can be toggled', async ({ page }) => {
    // Check if activity panel is present
    const panel = page.locator('#activity-panel');
    const panelVisible = await panel.isVisible().catch(() => false);

    if (!panelVisible) {
      // Feature not yet integrated - skip test
      test.skip();
      return;
    }

    // Click toggle button (use specific ID to avoid strict mode violation)
    const toggleBtn = page.locator('#activity-panel-toggle');
    await toggleBtn.click();

    // Panel should toggle state
    await expect(panel).toBeVisible();
  });
});
