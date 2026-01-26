import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded } from './helpers/test-setup.js';

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

    // Login should complete within 10 seconds (mock mode)
    expect(loginTime).toBeLessThan(10000);
    console.log(`Login time: ${loginTime}ms`);
  });

  test('identity selector opens quickly', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const selectorTrigger = page.locator('.selector-trigger, .identity-selector-trigger');
    if (await selectorTrigger.isVisible()) {
      const startTime = Date.now();
      await selectorTrigger.click();

      const dropdown = page.locator('.selector-dropdown, .identity-dropdown');
      await dropdown.waitFor({ state: 'visible', timeout: 1000 });

      const openTime = Date.now() - startTime;

      // Dropdown should open within 500ms
      expect(openTime).toBeLessThan(500);
      console.log(`Selector open time: ${openTime}ms`);
    }
  });

  test('modal opens quickly', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn');
    if (await actionsBtn.isVisible()) {
      await actionsBtn.click();

      const startTime = Date.now();
      await page.locator('[data-action="create"]').click();

      const modal = page.locator('.modal:not([hidden])');
      await modal.waitFor({ state: 'visible', timeout: 1000 });

      const openTime = Date.now() - startTime;

      // Modal should open within 500ms
      expect(openTime).toBeLessThan(500);
      console.log(`Modal open time: ${openTime}ms`);
    }
  });

  test('no memory leaks after multiple operations', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    // Get initial memory usage
    const initialMetrics = await page.metrics();
    const initialHeap = initialMetrics.JSHeapUsedSize;

    // Perform multiple operations
    for (let i = 0; i < 10; i++) {
      const selectorTrigger = page.locator('.selector-trigger, .identity-selector-trigger');
      if (await selectorTrigger.isVisible()) {
        await selectorTrigger.click();
        await page.waitForTimeout(100);
        await page.click('body', { position: { x: 10, y: 10 } });
        await page.waitForTimeout(100);
      }
    }

    // Get final memory usage
    const finalMetrics = await page.metrics();
    const finalHeap = finalMetrics.JSHeapUsedSize;

    // Memory shouldn't grow more than 50MB
    const memoryGrowth = finalHeap - initialHeap;
    expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    console.log(`Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
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

    // Total JS should be under 5MB (gzipped would be smaller)
    expect(totalJsSize).toBeLessThan(5 * 1024 * 1024);
    console.log(`Total JS size: ${(totalJsSize / 1024 / 1024).toFixed(2)}MB`);
  });
});
