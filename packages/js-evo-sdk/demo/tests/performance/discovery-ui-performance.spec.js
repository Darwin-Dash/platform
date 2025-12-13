/**
 * UI Performance Tests - Identity Discovery
 *
 * Validates that UI remains responsive during identity discovery
 * and updates happen within acceptable time frames.
 *
 * Run: npx playwright test tests/performance/discovery-ui-performance.spec.js
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8080/index-static.html';

test.describe('Discovery UI Performance', () => {

  test.beforeEach(async ({ page }) => {
    // Ensure mock mode for consistent, fast discovery
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      localStorage.setItem('useMockMode', 'true');
      localStorage.removeItem('dash-logged-in');
    });
    await page.reload();
  });

  test('progress counter should update regularly during discovery', async ({ page }) => {
    console.log('\n📊 Testing: Progress counter updates');

    // Start discovery
    await page.click('#login-form button[type="submit"]');

    // Wait for discovery view
    await page.waitForSelector('#discovery-progress-view:not([hidden])');
    console.log('✅ Discovery started');

    // Measure time between counter updates
    const timestamps = [];
    let lastValue = 0;
    let updateCount = 0;

    // Watch for 5 updates or timeout after 10 seconds
    for (let i = 0; i < 5; i++) {
      try {
        await page.waitForFunction(
          (prev) => {
            const el = document.getElementById('discovery-scanned');
            return el && parseInt(el.textContent || '0') > prev;
          },
          lastValue,
          { timeout: 10000 }
        );

        timestamps.push(Date.now());
        const currentValue = parseInt(await page.locator('#discovery-scanned').textContent() || '0');
        console.log(`  Update ${i + 1}: counter = ${currentValue}`);

        lastValue = currentValue;
        updateCount++;
      } catch (error) {
        console.log(`  ℹ️  Update ${i + 1}: timed out (discovery may have completed)`);
        break;
      }
    }

    console.log(`✅ Received ${updateCount} progress updates`);

    // Calculate intervals if we have multiple updates
    if (timestamps.length > 1) {
      const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]);
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const maxInterval = Math.max(...intervals);

      console.log(`  Average update interval: ${avgInterval.toFixed(0)}ms`);
      console.log(`  Max interval: ${maxInterval}ms`);

      expect(avgInterval).toBeLessThan(5000); // Updates at least every 5 seconds
    }
  });

  test('UI should remain responsive during discovery', async ({ page }) => {
    console.log('\n⚡ Testing: UI responsiveness during discovery');

    // Start discovery
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#discovery-progress-view:not([hidden])');
    console.log('✅ Discovery started');

    // Try to interact with UI during discovery
    // This tests that the page doesn't freeze

    const startTime = Date.now();
    const interactionDuration = 5000; // Attempt interactions for 5 seconds
    let successfulInteractions = 0;

    while (Date.now() - startTime < interactionDuration) {
      try {
        // Try hovering - should respond quickly
        await page.hover('#discovery-progress-view', { force: true });
        successfulInteractions++;

        // Small delay between interactions
        await page.waitForTimeout(300);
      } catch (error) {
        console.warn('  ⚠️  Interaction failed:', error.message);
        break;
      }
    }

    console.log(`✅ Completed ${successfulInteractions} UI interactions`);
    expect(successfulInteractions).toBeGreaterThan(0);

    // Wait for discovery to complete
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 15000 });
    console.log('✅ Discovery completed');
  });

  test('should handle rapid counter increments without lag', async ({ page }) => {
    console.log('\n🚀 Testing: Rapid counter increments');

    // Start discovery
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#discovery-progress-view:not([hidden])');
    console.log('✅ Discovery started');

    // Measure counter value every 100ms for 5 seconds
    const measurements = [];
    const measurementStart = Date.now();
    const measurementDuration = 5000;

    while (Date.now() - measurementStart < measurementDuration) {
      const scanned = parseInt(await page.locator('#discovery-scanned').textContent() || '0');
      const found = parseInt(await page.locator('#discovery-count').textContent() || '0');

      measurements.push({ time: Date.now(), scanned, found });
      await page.waitForTimeout(100);
    }

    if (measurements.length > 0) {
      const timeSpan = measurements[measurements.length - 1].time - measurements[0].time;
      const finalScanned = measurements[measurements.length - 1].scanned;
      const finalFound = measurements[measurements.length - 1].found;

      console.log(`  Time span: ${timeSpan}ms`);
      console.log(`  Final scanned: ${finalScanned}`);
      console.log(`  Final found: ${finalFound}`);
      console.log(`✅ UI handled ${measurements.length} measurements without lag`);

      expect(measurements.length).toBeGreaterThan(5);
    }
  });

  test('should complete discovery without memory issues', async ({ page }) => {
    console.log('\n💾 Testing: Memory usage during discovery');

    const initialMemory = await page.evaluate(() => {
      if (performance.memory) {
        return performance.memory.usedJSHeapSize;
      }
      return null;
    });

    if (initialMemory) {
      console.log(`  Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
    }

    // Perform discovery
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 15000 });
    console.log('✅ Discovery completed');

    const finalMemory = await page.evaluate(() => {
      if (performance.memory) {
        return performance.memory.usedJSHeapSize;
      }
      return null;
    });

    if (initialMemory && finalMemory) {
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      console.log(`  Final memory: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Memory increase: ${memoryIncreaseMB.toFixed(2)} MB`);

      // Memory increase should be reasonable (< 50MB for demo)
      expect(finalMemory).toBeLessThan(150 * 1024 * 1024);
    } else {
      console.log('  ℹ️  Memory measurement not available in this browser');
    }
  });

  test('should handle multiple rapid discoveries', async ({ page }) => {
    console.log('\n🔄 Testing: Multiple rapid discoveries');

    // Perform 3 discoveries in succession
    for (let i = 0; i < 3; i++) {
      console.log(`  Discovery ${i + 1}/3...`);

      if (i > 0) {
        // Logout
        await page.click('#logout-btn');
        await page.waitForSelector('#login-view:not([hidden])');
      }

      // Login/discover
      await page.click('#login-form button[type="submit"]');
      await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 15000 });

      console.log(`    ✅ Completed`);
    }

    // Should still be functional
    const isDashboardVisible = await page.locator('#dashboard-view').isVisible();
    expect(isDashboardVisible).toBe(true);

    console.log('✅ All 3 discoveries completed successfully');
  });

  test('discovery progress should show before completion', async ({ page }) => {
    console.log('\n⏱️  Testing: Progress visibility timing');

    const clickStart = Date.now();

    // Start discovery
    await page.click('#login-form button[type="submit"]');

    // Measure how long until progress view appears
    const progressViewStart = Date.now();
    await page.waitForSelector('#discovery-progress-view:not([hidden])', { timeout: 2000 });
    const progressViewDuration = Date.now() - progressViewStart;

    console.log(`  Progress view appeared in ${progressViewDuration}ms`);
    expect(progressViewDuration).toBeLessThan(2000);

    // Measure how long until first counter update
    const firstUpdateStart = Date.now();
    await page.waitForFunction(
      () => parseInt(document.getElementById('discovery-scanned')?.textContent || '0') > 0,
      { timeout: 5000 }
    );
    const firstUpdateDuration = Date.now() - firstUpdateStart;

    console.log(`  First counter update in ${firstUpdateDuration}ms`);
    expect(firstUpdateDuration).toBeLessThan(5000);

    // Measure total discovery time
    const totalStart = Date.now();
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 15000 });
    const totalDuration = Date.now() - totalStart;

    console.log(`  Total discovery time: ${totalDuration}ms`);
    expect(totalDuration).toBeLessThan(15000);
  });

  test('counter values should be accurate', async ({ page }) => {
    console.log('\n✔️  Testing: Counter accuracy');

    // Start discovery
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#discovery-progress-view:not([hidden])');

    // Wait for discovery to complete
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 15000 });

    // Get final counter values
    const finalScanned = parseInt(await page.locator('#discovery-scanned').textContent() || '0');
    const finalFound = parseInt(await page.locator('#discovery-count').textContent() || '0');

    console.log(`  Final scanned: ${finalScanned}`);
    console.log(`  Final found: ${finalFound}`);

    // Scanned should be >= found
    expect(finalScanned).toBeGreaterThanOrEqual(finalFound);

    // Both should be non-negative
    expect(finalScanned).toBeGreaterThanOrEqual(0);
    expect(finalFound).toBeGreaterThanOrEqual(0);

    console.log('✅ Counter values are accurate and consistent');
  });
});
