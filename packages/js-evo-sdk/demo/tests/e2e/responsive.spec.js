import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded, waitForDashboard } from './helpers/test-setup.js';

/**
 * Responsive Design E2E Tests
 *
 * Tests responsive design behavior in mock mode.
 */
test.describe('Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
    await page.waitForTimeout(500);
  });

  test('displays correctly on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await waitForDashboard(page);

    // Main content should be visible
    const main = page.locator('main').first();
    await expect(main).toBeVisible();

    // Content should be wide
    const mainBox = await main.boundingBox();
    expect(mainBox?.width).toBeGreaterThan(500);
  });

  test('displays correctly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    // Reload to apply viewport
    await page.reload();
    await handleLoginIfNeeded(page);
    await waitForDashboard(page);

    // Content should be visible
    const main = page.locator('main').first();
    await expect(main).toBeVisible();
  });

  test('displays correctly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Reload to apply viewport
    await page.reload();
    await handleLoginIfNeeded(page);
    await waitForDashboard(page);

    // Content should be visible
    const main = page.locator('main').first();
    await expect(main).toBeVisible();
  });

  test('header remains visible on all viewports', async ({ page }) => {
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.reload();
      await handleLoginIfNeeded(page);
      await waitForDashboard(page);

      // Header should be visible
      const header = page.locator('header').first();
      await expect(header).toBeVisible();
    }
  });

  test('actions button accessible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.reload();
    await handleLoginIfNeeded(page);
    await waitForDashboard(page);

    // Actions button should be visible
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn');
    await expect(actionsBtn).toBeVisible();
  });

  test('identity cards visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.reload();
    await handleLoginIfNeeded(page);
    await waitForDashboard(page);

    // Identity cards should be visible
    const cards = page.locator('.identity-card');
    const count = await cards.count();

    expect(count).toBeGreaterThan(0);
  });

  test('stats section visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.reload();
    await handleLoginIfNeeded(page);
    await waitForDashboard(page);

    // Stats should show identities/names labels
    const identitiesLabel = page.getByText('Identities', { exact: true });
    await expect(identitiesLabel).toBeVisible();
  });
});
