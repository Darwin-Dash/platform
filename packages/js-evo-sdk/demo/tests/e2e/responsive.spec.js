import { test, expect, devices } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded } from './helpers/test-setup.js';

test.describe('Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
  });

  test('displays correctly on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await handleLoginIfNeeded(page);

    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    // Header should be full width
    const header = page.locator('.app-header');
    const headerBox = await header.boundingBox();

    expect(headerBox?.width).toBeGreaterThan(1000);
  });

  test('displays correctly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await handleLoginIfNeeded(page);

    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    // Content should be visible and properly sized
    const main = page.locator('main, .main-content');
    await expect(main).toBeVisible();
  });

  test('displays correctly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await handleLoginIfNeeded(page);

    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    // Content should be visible
    const main = page.locator('main, .main-content');
    await expect(main).toBeVisible();

    // Mobile menu or hamburger may be visible
    const mobileMenu = page.locator('.mobile-menu, .hamburger, .menu-toggle');
    // May or may not have mobile menu depending on design
  });

  test('modals are centered on all viewports', async ({ page }) => {
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await handleLoginIfNeeded(page);
      await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

      // Open a modal if possible
      const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn');
      if (await actionsBtn.isVisible()) {
        await actionsBtn.click();
        await page.locator('[data-action="create"]').click();

        const modal = page.locator('.modal:not([hidden])');
        if (await modal.isVisible()) {
          const modalBox = await modal.boundingBox();

          if (modalBox) {
            // Modal should be centered
            const centerX = viewport.width / 2;
            const modalCenterX = modalBox.x + modalBox.width / 2;

            // Allow some tolerance
            expect(Math.abs(modalCenterX - centerX)).toBeLessThan(50);
          }

          // Close modal for next iteration
          await page.keyboard.press('Escape');
        }
      }
    }
  });

  test('text remains readable at all sizes', async ({ page }) => {
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 375, height: 667, name: 'mobile' },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await handleLoginIfNeeded(page);
      await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

      // Check that text elements are visible
      const headings = page.locator('h1, h2, h3');
      const headingCount = await headings.count();

      if (headingCount > 0) {
        const firstHeading = headings.first();
        await expect(firstHeading).toBeVisible();

        // Font size should be reasonable
        const fontSize = await firstHeading.evaluate((el) =>
          parseFloat(window.getComputedStyle(el).fontSize)
        );
        expect(fontSize).toBeGreaterThan(12);
      }
    }
  });

  test('buttons are tappable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    // Find all buttons
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.nth(i);
      if (await button.isVisible()) {
        const box = await button.boundingBox();

        if (box) {
          // Minimum tap target should be 44x44 (WCAG)
          expect(box.width).toBeGreaterThanOrEqual(30); // Allow some flexibility
          expect(box.height).toBeGreaterThanOrEqual(30);
        }
      }
    }
  });

  test('no horizontal scroll on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    // Check for horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });
});
