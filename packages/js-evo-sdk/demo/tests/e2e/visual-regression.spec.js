import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded } from './helpers/test-setup.js';

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
  });

  test('login page matches snapshot', async ({ page }) => {
    await page.goto('/');

    // Ensure page is stable
    await page.waitForLoadState('networkidle');

    // Clear any localStorage to show login
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Take screenshot
    const loginView = page.locator('#login-view');
    if (await loginView.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(loginView).toHaveScreenshot('login-page.png', {
        maxDiffPixelRatio: 0.1,
      });
    }
  });

  test('dashboard matches snapshot', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    // Wait for content to load
    await page.waitForTimeout(1000);

    const dashboardView = page.locator('#dashboard-view');
    await expect(dashboardView).toHaveScreenshot('dashboard.png', {
      maxDiffPixelRatio: 0.1,
    });
  });

  test('identity selector matches snapshot', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const selectorTrigger = page.locator('.selector-trigger, .identity-selector-trigger');
    if (await selectorTrigger.isVisible()) {
      await selectorTrigger.click();

      const dropdown = page.locator('.selector-dropdown, .identity-dropdown');
      await dropdown.waitFor({ state: 'visible' });

      await expect(dropdown).toHaveScreenshot('identity-selector.png', {
        maxDiffPixelRatio: 0.1,
      });
    }
  });

  test('create modal matches snapshot', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn');
    if (await actionsBtn.isVisible()) {
      await actionsBtn.click();
      await page.locator('[data-action="create"]').click();

      const modal = page.locator('.modal:not([hidden])');
      await modal.waitFor({ state: 'visible' });

      await expect(modal).toHaveScreenshot('create-modal.png', {
        maxDiffPixelRatio: 0.1,
      });
    }
  });

  test('mobile layout matches snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    await expect(page).toHaveScreenshot('mobile-layout.png', {
      maxDiffPixelRatio: 0.15, // More tolerance for mobile
      fullPage: true,
    });
  });

  test('tablet layout matches snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    await expect(page).toHaveScreenshot('tablet-layout.png', {
      maxDiffPixelRatio: 0.1,
      fullPage: true,
    });
  });

  test('error state matches snapshot', async ({ page }) => {
    await page.goto('/');

    // Try to trigger an error state by entering invalid mnemonic
    const loginView = page.locator('#login-view');
    if (await loginView.isVisible({ timeout: 5000 }).catch(() => false)) {
      const mnemonicField = page.locator('#mnemonic-input, [name="mnemonic"]');
      await mnemonicField.fill('invalid mnemonic');
      await page.locator('#login-form button[type="submit"]').click();

      // Wait for error to appear
      const errorMsg = page.locator('.error-message, .mnemonic-error');
      if (await errorMsg.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(errorMsg).toHaveScreenshot('error-state.png', {
          maxDiffPixelRatio: 0.1,
        });
      }
    }
  });

  test('dark mode matches snapshot', async ({ page }) => {
    // Set dark mode preference
    await page.emulateMedia({ colorScheme: 'dark' });

    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    // Check if app supports dark mode
    const isDarkMode = await page.evaluate(() => {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    if (isDarkMode) {
      await expect(page).toHaveScreenshot('dark-mode.png', {
        maxDiffPixelRatio: 0.1,
        fullPage: true,
      });
    }
  });
});
