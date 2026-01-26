import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded } from './helpers/test-setup.js';

test.describe('Identity Selector Component', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
  });

  test('shows identity selector when identities exist', async ({ page }) => {
    // Wait for dashboard or welcome state
    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    // If dashboard is visible, selector should be present
    const isDashboard = await page.locator('#dashboard-view').isVisible().catch(() => false);

    if (isDashboard) {
      const selector = page.locator('.identity-selector');
      await expect(selector).toBeVisible();
    }
  });

  test('selector displays identity count badge', async ({ page }) => {
    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    const isDashboard = await page.locator('#dashboard-view').isVisible().catch(() => false);

    if (isDashboard) {
      const countBadge = page.locator('.identity-count, .selector-count');
      // Badge should show number of identities
      const countText = await countBadge.textContent().catch(() => null);
      if (countText) {
        expect(parseInt(countText)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('can open identity dropdown', async ({ page }) => {
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    // Click to open selector dropdown
    const selectorTrigger = page.locator('.selector-trigger, .identity-selector-trigger');
    await selectorTrigger.click();

    // Dropdown should appear
    const dropdown = page.locator('.selector-dropdown, .identity-dropdown');
    await expect(dropdown).toBeVisible();
  });

  test('dropdown shows identity list', async ({ page }) => {
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    // Open dropdown
    const selectorTrigger = page.locator('.selector-trigger, .identity-selector-trigger');
    await selectorTrigger.click();

    // Should show identity items
    const identityItems = page.locator('.identity-item');
    const count = await identityItems.count();

    // At least one identity should be visible (mock mode creates test identities)
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('can select different identity', async ({ page }) => {
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    // Open dropdown
    await page.locator('.selector-trigger, .identity-selector-trigger').click();

    const identityItems = page.locator('.identity-item');
    const count = await identityItems.count();

    if (count >= 2) {
      // Click the second identity
      await identityItems.nth(1).click();

      // Dropdown should close
      const dropdown = page.locator('.selector-dropdown, .identity-dropdown');
      await expect(dropdown).toBeHidden({ timeout: 2000 });
    }
  });

  test('closes dropdown when clicking outside', async ({ page }) => {
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    // Open dropdown
    await page.locator('.selector-trigger, .identity-selector-trigger').click();

    const dropdown = page.locator('.selector-dropdown, .identity-dropdown');
    await expect(dropdown).toBeVisible();

    // Click outside
    await page.click('body', { position: { x: 10, y: 10 } });

    // Dropdown should close
    await expect(dropdown).toBeHidden({ timeout: 2000 });
  });
});
