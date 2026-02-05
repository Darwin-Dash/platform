import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded, waitForDashboard } from './helpers/test-setup.js';

/**
 * Visual Regression Tests
 *
 * Tests visual appearance across different states and viewports.
 * Note: These tests capture screenshots for visual comparison.
 */
test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
    await page.waitForTimeout(500);
  });

  test('dashboard view is rendered', async ({ page }) => {
    await waitForDashboard(page);

    // Dashboard should have expected elements
    const dashboard = page.locator('#dashboard-view');
    await expect(dashboard).toBeVisible();

    // Take screenshot (creates baseline on first run)
    await expect(dashboard).toHaveScreenshot('dashboard.png', {
      maxDiffPixelRatio: 0.15,
    });
  });

  test('identity cards are rendered', async ({ page }) => {
    await waitForDashboard(page);

    // Identity cards should be visible
    const cards = page.locator('.identity-card');
    await expect(cards.first()).toBeVisible();

    // Take screenshot of cards area
    const main = page.locator('main').first();
    await expect(main).toHaveScreenshot('identity-cards.png', {
      maxDiffPixelRatio: 0.15,
    });
  });

  test('header is rendered', async ({ page }) => {
    await waitForDashboard(page);

    // Header should be visible
    const header = page.locator('header').first();
    await expect(header).toBeVisible();

    // Take screenshot
    await expect(header).toHaveScreenshot('header.png', {
      maxDiffPixelRatio: 0.15,
    });
  });

  test('actions menu renders correctly', async ({ page }) => {
    await waitForDashboard(page);

    // Open actions menu
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.waitForTimeout(300);

    // Menu should be visible
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();

    // Take screenshot of menu
    await expect(menu).toHaveScreenshot('actions-menu.png', {
      maxDiffPixelRatio: 0.15,
    });
  });

  test('modal renders correctly', async ({ page }) => {
    await waitForDashboard(page);

    // Open create modal
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.waitForTimeout(300);
    await page.getByRole('menuitem', { name: /Create Identity/i }).click();
    await page.waitForTimeout(500);

    // Find visible modal
    const fundingModal = page.locator('#wallet-funding-modal');
    const createModal = page.locator('#create-modal');

    const fundingVisible = await fundingModal.isVisible().catch(() => false);
    const createVisible = await createModal.isVisible().catch(() => false);

    if (fundingVisible) {
      await expect(fundingModal).toHaveScreenshot('funding-modal.png', {
        maxDiffPixelRatio: 0.15,
      });
    } else if (createVisible) {
      await expect(createModal).toHaveScreenshot('create-modal.png', {
        maxDiffPixelRatio: 0.15,
      });
    }
  });

  test('mobile viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.reload();
    await handleLoginIfNeeded(page);
    await waitForDashboard(page);

    await expect(page).toHaveScreenshot('mobile-view.png', {
      maxDiffPixelRatio: 0.15,
      fullPage: true,
    });
  });

  test('tablet viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.reload();
    await handleLoginIfNeeded(page);
    await waitForDashboard(page);

    await expect(page).toHaveScreenshot('tablet-view.png', {
      maxDiffPixelRatio: 0.15,
      fullPage: true,
    });
  });
});
