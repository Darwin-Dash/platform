import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded, waitForDashboard } from './helpers/test-setup.js';

/**
 * Performance E2E Tests
 *
 * Tests performance characteristics in mock mode.
 */
test.describe('Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
  });

  test('page loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - startTime;

    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
    console.log(`Page load time: ${loadTime}ms`);
  });

  test('login completes within acceptable time', async ({ page }) => {
    await page.goto('/');

    const startTime = Date.now();
    await handleLoginIfNeeded(page);
    const loginTime = Date.now() - startTime;

    // Login should complete within 15 seconds (mock mode)
    expect(loginTime).toBeLessThan(15000);
    console.log(`Login time: ${loginTime}ms`);
  });

  test('dashboard loads within acceptable time', async ({ page }) => {
    await handleLoginIfNeeded(page);

    const startTime = Date.now();
    await waitForDashboard(page);
    const dashboardTime = Date.now() - startTime;

    // Dashboard should load within 15 seconds
    expect(dashboardTime).toBeLessThan(15000);
    console.log(`Dashboard load time: ${dashboardTime}ms`);
  });

  test('actions menu opens quickly', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await waitForDashboard(page);

    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn');
    await expect(actionsBtn).toBeVisible();

    const startTime = Date.now();
    await actionsBtn.click();
    await page.waitForTimeout(300);

    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();

    const openTime = Date.now() - startTime;

    // Menu should open within 1 second
    expect(openTime).toBeLessThan(1000);
    console.log(`Menu open time: ${openTime}ms`);
  });

  test('modal opens within acceptable time', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await waitForDashboard(page);

    // Open actions menu
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.waitForTimeout(300);

    const startTime = Date.now();
    await page.getByRole('menuitem', { name: /Create Identity/i }).click();
    await page.waitForTimeout(500);

    // Check for modal
    const fundingModal = page.locator('#wallet-funding-modal');
    const createModal = page.locator('#create-modal');

    const fundingVisible = await fundingModal.isVisible().catch(() => false);
    const createVisible = await createModal.isVisible().catch(() => false);

    const openTime = Date.now() - startTime;

    // Modal should open within 2 seconds
    expect(openTime).toBeLessThan(2000);
    expect(fundingVisible || createVisible).toBe(true);
    console.log(`Modal open time: ${openTime}ms`);
  });

  test('bundle size is within limits', async ({ page }) => {
    const responses = [];

    page.on('response', (response) => {
      if (response.url().includes('.js')) {
        responses.push({
          url: response.url(),
          size: parseInt(response.headers()['content-length'] || '0'),
        });
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Calculate total JS size
    const totalJsSize = responses.reduce((sum, r) => sum + r.size, 0);

    // Total JS should be under 10MB (gzipped would be smaller)
    expect(totalJsSize).toBeLessThan(10 * 1024 * 1024);
    console.log(`Total JS size: ${(totalJsSize / 1024 / 1024).toFixed(2)}MB`);
  });
});
