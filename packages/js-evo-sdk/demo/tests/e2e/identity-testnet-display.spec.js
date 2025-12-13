/**
 * E2E Tests - Identity Display on Real Testnet
 *
 * Tests that verify REAL identities are fetched from testnet
 * and correctly displayed in the demo app UI.
 *
 * Uses two pages:
 * - Main app (/index.html) - Discovery flow
 * - Identity viewer (/identity-viewer/) - Direct ID lookup
 *
 * Run with: npm run test:e2e -- tests/e2e/identity-testnet-display.spec.js
 * Or: npx playwright test tests/e2e/identity-testnet-display.spec.js --headed
 */

import { test, expect } from '@playwright/test';

const MAIN_APP_URL = 'http://localhost:8080/index.html';
const IDENTITY_VIEWER_URL = 'http://localhost:8080/identity-viewer/';

// Known testnet data (from tests/fixtures/testnet.mjs)
const TESTNET_FIXTURES = {
  identityId: '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk',
  specializedBalanceIdentityId: 'AzaU7zqCT7X1kxh8yWxkT9PxAgNqWDu4Gz13emwcRyAT',
  username: 'alice',
  existingUsername: 'therealslimshaddy5',
  publicKeyHashUnique: 'b7e904ce25ed97594e72f7af0e66f298031c1754',
};

// Increase timeout for real network operations
test.setTimeout(120000);

test.describe('Identity Viewer - Direct Lookup on Testnet', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to identity viewer page
    await page.goto(IDENTITY_VIEWER_URL);

    // Wait for SDK to initialize (may take time for WASM load)
    await page.waitForSelector('#connectionStatus', { timeout: 30000 });

    // Wait for connection to be established
    await page.waitForFunction(
      () => {
        const status = document.getElementById('connectionStatus');
        return status && status.textContent.includes('Connected');
      },
      { timeout: 60000 }
    );
  });

  test('should connect to testnet SDK', async ({ page }) => {
    // Verify testnet button is visible
    await expect(page.locator('#testnetBtn')).toBeVisible();

    // Verify connection status shows connected
    const statusText = await page.locator('#connectionStatus').textContent();
    expect(statusText).toContain('Connected');
  });

  test('should fetch known identity by ID and display info', async ({ page }) => {
    // Enter known identity ID
    await page.fill('#identityInput', TESTNET_FIXTURES.identityId);

    // Click search button
    await page.click('#searchBtn');

    // Wait for dashboard to show identity data
    await page.waitForFunction(
      () => {
        const dashboard = document.getElementById('dashboard');
        return dashboard && !dashboard.hidden;
      },
      { timeout: 60000 }
    );

    // Verify identity ID is displayed (check first 8 chars match)
    const identityIdText = await page.locator('#identityId').textContent();
    expect(identityIdText).toContain(TESTNET_FIXTURES.identityId.substring(0, 8));

    // Verify balance is shown (should be a number, not placeholder)
    const balanceText = await page.locator('#balance').textContent();
    expect(balanceText).not.toBe('—');
    expect(balanceText).not.toBe('');

    // Verify public keys count is greater than 0
    const keysCountText = await page.locator('#publicKeysCount').textContent();
    const keysCount = parseInt(keysCountText || '0');
    expect(keysCount).toBeGreaterThan(0);

    // Verify revision is shown
    const revisionText = await page.locator('#revision').textContent();
    expect(revisionText).not.toBe('—');
  });

  test('should display public keys list with details', async ({ page }) => {
    // Enter known identity ID and search
    await page.fill('#identityInput', TESTNET_FIXTURES.identityId);
    await page.click('#searchBtn');

    // Wait for dashboard to appear
    await page.waitForFunction(
      () => {
        const dashboard = document.getElementById('dashboard');
        return dashboard && !dashboard.hidden;
      },
      { timeout: 60000 }
    );

    // Verify keys list container is visible
    const keysList = page.locator('#publicKeysList');
    await expect(keysList).toBeVisible();

    // Count key entries (look for key-item elements or similar)
    const keysContainer = await keysList.innerHTML();
    expect(keysContainer.length).toBeGreaterThan(10); // Should have content

    // Verify at least one key is shown (check for key-related content)
    const pageContent = await page.content();
    expect(
      pageContent.includes('AUTHENTICATION') ||
      pageContent.includes('TRANSFER') ||
      pageContent.includes('Key ID') ||
      pageContent.includes('Purpose')
    ).toBe(true);
  });

  test('should handle non-existent identity gracefully', async ({ page }) => {
    // Enter fake identity ID (valid format but doesn't exist)
    await page.fill('#identityInput', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

    // Click search
    await page.click('#searchBtn');

    // Wait for error to appear or dashboard to remain hidden
    await page.waitForTimeout(10000);

    // Check that either error is shown or dashboard is hidden
    const errorVisible = await page.locator('#error').isVisible();
    const dashboardHidden = await page.locator('#dashboard').isHidden();

    // At least one of these conditions should be true
    expect(errorVisible || dashboardHidden).toBe(true);
  });

  test('should fetch another known identity to verify consistency', async ({ page }) => {
    // Use the specialized balance identity
    await page.fill('#identityInput', TESTNET_FIXTURES.specializedBalanceIdentityId);
    await page.click('#searchBtn');

    // Wait for dashboard
    await page.waitForFunction(
      () => {
        const dashboard = document.getElementById('dashboard');
        return dashboard && !dashboard.hidden;
      },
      { timeout: 60000 }
    );

    // Verify this identity also loads correctly
    const identityIdText = await page.locator('#identityId').textContent();
    expect(identityIdText).toContain(
      TESTNET_FIXTURES.specializedBalanceIdentityId.substring(0, 8)
    );
  });
});

test.describe('Main App - Discovery Flow on Testnet', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to main app
    await page.goto(MAIN_APP_URL);

    // Force REAL SDK mode (not mock)
    await page.evaluate(() => {
      localStorage.setItem('useMockMode', 'false');
      localStorage.removeItem('dash-logged-in');
      localStorage.removeItem('dash-identity-manager-state');
    });

    // Reload to apply settings
    await page.reload();
  });

  test('should show login screen with mnemonic input', async ({ page }) => {
    // Login view should be visible
    await expect(page.locator('#login-view')).toBeVisible();

    // Mnemonic input should be visible
    await expect(page.locator('#login-mnemonic')).toBeVisible();

    // Login button should be visible
    await expect(page.locator('#login-form button[type="submit"]')).toBeVisible();
  });

  test('should have test mnemonic pre-filled', async ({ page }) => {
    const mnemonicInput = page.locator('#login-mnemonic');
    const value = await mnemonicInput.inputValue();

    // Test mnemonic should be pre-filled
    expect(value).toContain('abandon');
  });

  test('should show discovery progress when login clicked', async ({ page }) => {
    // Click login with prefilled test mnemonic
    await page.click('#login-form button[type="submit"]');

    // Discovery progress view should become visible
    const discoveryView = page.locator('#discovery-progress-view');
    await expect(discoveryView).toBeVisible({ timeout: 15000 });

    // Progress counters should be visible
    await expect(page.locator('#discovery-scanned')).toBeVisible();
    await expect(page.locator('#discovery-count')).toBeVisible();
  });

  test('should complete discovery and show dashboard', async ({ page }) => {
    // Click login
    await page.click('#login-form button[type="submit"]');

    // Wait for discovery to appear
    await expect(page.locator('#discovery-progress-view')).toBeVisible({
      timeout: 15000,
    });

    // Wait for discovery to complete and dashboard to appear
    // This may take a while on real network
    await page.waitForSelector('#dashboard-view:not([hidden])', {
      timeout: 90000,
    });

    // Dashboard should be visible
    await expect(page.locator('#dashboard-view')).toBeVisible();

    // Login view should be hidden
    await expect(page.locator('#login-view')).toBeHidden();
  });

  test('should show real progress counter updates during discovery', async ({ page }) => {
    // Click login
    await page.click('#login-form button[type="submit"]');

    // Wait for discovery progress to appear
    await expect(page.locator('#discovery-progress-view')).toBeVisible({
      timeout: 15000,
    });

    // Track scanned counter updates over time
    const updates = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      const scanned = await page.locator('#discovery-scanned').textContent();
      updates.push(parseInt(scanned || '0'));

      // If discovery completed early, stop tracking
      const dashboardVisible = await page.locator('#dashboard-view').isVisible();
      if (dashboardVisible) break;
    }

    // Counter should show progress (at least one update > 0)
    const hasProgress = updates.some((val) => val > 0);
    expect(hasProgress).toBe(true);
  });

  test('should log SDK initialization to console', async ({ page }) => {
    // Monitor console for SDK loading messages
    const consoleMessages = [];
    page.on('console', (msg) => {
      consoleMessages.push(msg.text());
    });

    // Click login
    await page.click('#login-form button[type="submit"]');

    // Wait for discovery to start
    await page.waitForTimeout(5000);

    // Should see SDK-related console messages
    const hasSdkLogs = consoleMessages.some(
      (msg) =>
        msg.includes('Mode: REAL') ||
        msg.includes('EvoSDK') ||
        msg.includes('SDK') ||
        msg.includes('Loading')
    );

    expect(hasSdkLogs).toBe(true);
  });

  test('should not show SDK injection errors', async ({ page }) => {
    // Monitor console for errors
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Click login
    await page.click('#login-form button[type="submit"]');

    // Wait for discovery
    await page.waitForTimeout(10000);

    // Should not have SDK injection or RwLock errors
    const hasCriticalErrors = consoleErrors.some(
      (msg) =>
        msg.includes('SDK not injected') ||
        msg.includes('already locked') ||
        msg.includes('RwLock')
    );

    expect(hasCriticalErrors).toBe(false);
  });
});

test.describe('Console Monitoring - Error Detection', () => {
  test('should complete identity viewer load without JS errors', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto(IDENTITY_VIEWER_URL);

    // Wait for page to fully load
    await page.waitForTimeout(5000);

    // Filter out expected errors (like network timeouts on slow connections)
    const criticalErrors = pageErrors.filter(
      (err) =>
        !err.includes('timeout') &&
        !err.includes('network') &&
        !err.includes('CORS')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('should complete main app load without JS errors', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto(MAIN_APP_URL);

    // Wait for page to fully load
    await page.waitForTimeout(5000);

    // Filter out expected errors
    const criticalErrors = pageErrors.filter(
      (err) =>
        !err.includes('timeout') &&
        !err.includes('network') &&
        !err.includes('CORS')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
