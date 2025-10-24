import { test, expect } from '@playwright/test';

/**
 * Debug script to capture console errors and SDK behavior
 * Run with: npx playwright test debug-console.spec.js
 */

test.describe('Console Error Debugger', () => {
  test('capture all console output and SDK behavior', async ({ page }) => {
    const consoleMessages = [];
    const errors = [];
    const warnings = [];
    const networkErrors = [];

    // Capture all console output
    page.on('console', (msg) => {
      const text = msg.text();
      const type = msg.type();

      // Print to test output immediately so we can see it
      console.log(`[BROWSER ${type.toUpperCase()}] ${text}`);

      consoleMessages.push({ type, text, timestamp: new Date().toISOString() });

      if (type === 'error') {
        errors.push(text);
      } else if (type === 'warning') {
        warnings.push(text);
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      errors.push(`Page Error: ${error.message}\n${error.stack}`);
    });

    // Capture network failures
    page.on('requestfailed', (request) => {
      networkErrors.push({
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText,
      });
    });

    // Navigate to the app
    console.log('\n=== Loading Identity Viewer ===');
    await page.goto('/identity-viewer/');

    // Wait for page to load and initialize
    console.log('=== Waiting for page initialization (10 seconds) ===');
    await page.waitForTimeout(10000);

    // Check connection status
    const connectionStatus = await page.locator('#connectionStatus').textContent().catch(() => 'NOT FOUND');
    console.log(`Connection Status: ${connectionStatus}`);

    // Check if default identity is populated
    const identityInputValue = await page.locator('#identityInput').inputValue().catch(() => '');
    console.log(`Default Identity ID in input: ${identityInputValue || 'EMPTY'}`);

    // Check dashboard visibility
    const dashboardVisible = await page.locator('#dashboard').isVisible().catch(() => false);
    const loadingVisible = await page.locator('#loading').isVisible().catch(() => false);
    const errorVisible = await page.locator('#error').isVisible().catch(() => false);

    console.log(`Dashboard visible: ${dashboardVisible}`);
    console.log(`Loading visible: ${loadingVisible}`);
    console.log(`Error visible: ${errorVisible}`);

    // If error is visible, capture it
    if (errorVisible) {
      const errorText = await page.locator('#error').textContent();
      console.log(`Error message: ${errorText}`);
    }

    // If dashboard is visible, check metric values
    if (dashboardVisible) {
      const balance = await page.locator('#balance').textContent().catch(() => 'ERROR');
      const revision = await page.locator('#revision').textContent().catch(() => 'ERROR');
      const keysCount = await page.locator('#publicKeysCount').textContent().catch(() => 'ERROR');

      console.log(`Balance: ${balance}`);
      console.log(`Revision: ${revision}`);
      console.log(`Public Keys Count: ${keysCount}`);
    }

    // Try to manually trigger identity fetch
    if (identityInputValue) {
      console.log('\n=== Attempting Manual Identity Fetch ===');
      await page.locator('#searchBtn').click();
      await page.waitForTimeout(5000); // Wait for API call

      // Check again after fetch
      const dashboardVisibleAfter = await page.locator('#dashboard').isVisible().catch(() => false);
      console.log(`Dashboard visible after fetch: ${dashboardVisibleAfter}`);

      if (dashboardVisibleAfter) {
        const balance = await page.locator('#balance').textContent().catch(() => 'ERROR');
        const revision = await page.locator('#revision').textContent().catch(() => 'ERROR');
        const keysCount = await page.locator('#publicKeysCount').textContent().catch(() => 'ERROR');

        console.log(`Balance after fetch: ${balance}`);
        console.log(`Revision after fetch: ${revision}`);
        console.log(`Public Keys Count after fetch: ${keysCount}`);
      }
    }

    // Print all captured information
    console.log('\n=== CONSOLE MESSAGES ===');
    consoleMessages.forEach((msg, i) => {
      console.log(`[${i}] [${msg.type}] ${msg.text}`);
    });

    console.log('\n=== ERRORS ===');
    if (errors.length === 0) {
      console.log('No errors captured');
    } else {
      errors.forEach((err, i) => {
        console.log(`[${i}] ${err}`);
      });
    }

    console.log('\n=== WARNINGS ===');
    if (warnings.length === 0) {
      console.log('No warnings captured');
    } else {
      warnings.forEach((warn, i) => {
        console.log(`[${i}] ${warn}`);
      });
    }

    console.log('\n=== NETWORK FAILURES ===');
    if (networkErrors.length === 0) {
      console.log('No network failures');
    } else {
      networkErrors.forEach((err, i) => {
        console.log(`[${i}] ${err.method} ${err.url} - ${err.failure}`);
      });
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Total console messages: ${consoleMessages.length}`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Warnings: ${warnings.length}`);
    console.log(`Network failures: ${networkErrors.length}`);
    console.log(`Connection Status: ${connectionStatus}`);
    console.log(`Dashboard Loaded: ${dashboardVisible}`);

    // This test always passes - it's just for debugging
    expect(true).toBe(true);
  });
});
