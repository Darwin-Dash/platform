import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded, waitForDashboard } from './helpers/test-setup.js';

test.describe('Identity Selector Component', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
    // Give app time to fully initialize
    await page.waitForTimeout(500);
  });

  test('shows identity selector when identities exist', async ({ page }) => {
    // Wait for dashboard to be visible (not hidden)
    await waitForDashboard(page);

    // Selector should be present in header
    const selector = page.locator('.identity-selector');
    await expect(selector).toBeVisible();
  });

  test('selector displays current identity or placeholder', async ({ page }) => {
    await waitForDashboard(page);

    // The selector trigger should show identity preview
    const preview = page.locator('.identity-preview');
    await expect(preview).toBeVisible();

    // Should have label text (either "Select Identity" or actual identity name)
    const label = page.locator('.identity-preview .identity-label');
    const labelText = await label.textContent();
    expect(labelText).toBeTruthy();
  });

  test('can open identity dropdown', async ({ page }) => {
    await waitForDashboard(page);

    // Click to open selector dropdown
    const selectorTrigger = page.locator('.selector-trigger');
    await selectorTrigger.click();

    // Dropdown should appear (wait for hidden attribute to be removed)
    const dropdown = page.locator('.selector-dropdown');
    await expect(dropdown).toBeVisible({ timeout: 2000 });
  });

  test('dropdown shows identity list', async ({ page }) => {
    await waitForDashboard(page);

    // Open dropdown
    await page.locator('.selector-trigger').click();
    await page.waitForTimeout(300); // Allow dropdown animation

    // Should show identity items
    const identityItems = page.locator('.identity-item');
    const count = await identityItems.count();

    // Mock mode creates 3 test identities
    expect(count).toBe(3);
  });

  test('can select different identity', async ({ page }) => {
    await waitForDashboard(page);

    // Open dropdown
    await page.locator('.selector-trigger').click();
    await page.waitForTimeout(300);

    const identityItems = page.locator('.identity-item');
    const count = await identityItems.count();

    if (count >= 2) {
      // Click the second identity
      await identityItems.nth(1).click();

      // Dropdown should close
      const dropdown = page.locator('.selector-dropdown');
      await expect(dropdown).toBeHidden({ timeout: 2000 });
    }
  });

  test('closes dropdown when clicking outside', async ({ page }) => {
    await waitForDashboard(page);

    // Open dropdown
    await page.locator('.selector-trigger').click();
    await page.waitForTimeout(300);

    const dropdown = page.locator('.selector-dropdown');
    await expect(dropdown).toBeVisible();

    // Click outside (on the header area)
    await page.locator('.app-header').click({ position: { x: 10, y: 10 } });

    // Dropdown should close
    await expect(dropdown).toBeHidden({ timeout: 2000 });
  });
});
