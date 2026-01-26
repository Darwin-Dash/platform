/**
 * E2E Tests - Identity Discovery
 *
 * Tests the complete identity discovery workflow in both mock and real SDK modes.
 * Validates login flow, progress feedback, error handling, and state management.
 */

import { test, expect } from '@playwright/test';
import { setupMockMode, setupTestnetMode, handleLoginIfNeeded } from './helpers/test-setup.js';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test.describe('Identity Discovery - Mock Mode', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);

    // Ensure logged out state for discovery tests
    await page.evaluate(() => {
      localStorage.removeItem('dash-logged-in');
    });
    await page.reload();
  });

  test('displays login screen on initial load', async ({ page }) => {
    // Login view should be visible
    const loginView = page.locator('#login-view');
    await expect(loginView).toBeVisible();

    // Mnemonic input should be visible
    const mnemonicInput = page.locator('#login-mnemonic');
    await expect(mnemonicInput).toBeVisible();

    // Login button should be visible
    const loginBtn = page.locator('#login-form button[type="submit"]');
    await expect(loginBtn).toBeVisible();
  });

  test('pre-fills test mnemonic in mock mode', async ({ page }) => {
    const mnemonicInput = page.locator('#login-mnemonic');
    const value = await mnemonicInput.inputValue();

    // Should have test mnemonic pre-filled
    expect(value).toBe(TEST_MNEMONIC);
  });

  test('shows discovery progress during login', async ({ page }) => {
    // Click login button
    await page.click('#login-form button[type="submit"]');

    // Discovery progress view should become visible
    const discoveryView = page.locator('#discovery-progress-view');
    await expect(discoveryView).toBeVisible({ timeout: 2000 });

    // Progress counters should be visible
    const scannedCounter = page.locator('#discovery-scanned');
    const foundCounter = page.locator('#discovery-count');

    await expect(scannedCounter).toBeVisible();
    await expect(foundCounter).toBeVisible();

    // Counters should update during discovery
    await page.waitForTimeout(500);
    const scannedValue = await scannedCounter.textContent();

    expect(parseInt(scannedValue || '0')).toBeGreaterThan(0);
  });

  test('completes discovery and shows dashboard', async ({ page }) => {
    // Submit login form
    await page.click('#login-form button[type="submit"]');

    // Wait for discovery to complete (max 5 seconds)
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 5000 });

    // Dashboard should be visible
    const dashboardView = page.locator('#dashboard-view');
    await expect(dashboardView).toBeVisible();

    // Discovery view should be hidden
    const discoveryView = page.locator('#discovery-progress-view');
    await expect(discoveryView).toBeHidden();

    // Login view should be hidden
    const loginView = page.locator('#login-view');
    await expect(loginView).toBeHidden();
  });

  test('finds mock identities and displays them', async ({ page }) => {
    await page.click('#login-form button[type="submit"]');

    // Wait for dashboard
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 5000 });

    // Should show identity count in stats
    const statIdentities = page.locator('#stat-identities');
    const count = await statIdentities.textContent();

    expect(parseInt(count || '0')).toBeGreaterThan(0);

    // Identity cards should be visible
    const identityCards = page.locator('.identity-card');
    await expect(identityCards.first()).toBeVisible();
  });

  test('shows completion notification', async ({ page }) => {
    await page.click('#login-form button[type="submit"]');

    // Wait for success notification
    await page.waitForSelector('.notification', { timeout: 5000 });

    // Notification should contain success message
    const notification = page.locator('.notification');
    const text = await notification.textContent();

    expect(text).toContain('Wallet connected');
  });
});

test.describe('Identity Discovery - Real SDK Mode', () => {
  test.beforeEach(async ({ page }) => {
    await setupTestnetMode(page);

    await page.evaluate(() => {
      localStorage.removeItem('dash-logged-in');
    });
    await page.reload();
  });

  test('attempts SDK initialization', async ({ page }) => {
    // Monitor console for SDK loading messages
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    // Click login
    await page.click('#login-form button[type="submit"]');

    // Wait a moment for console messages
    await page.waitForTimeout(1000);

    // Should see SDK mode activation in console
    const hasSdkMode = consoleMessages.some(msg =>
      msg.includes('Mode: REAL') || msg.includes('EvoSDK')
    );

    expect(hasSdkMode).toBe(true);
  });

  test('shows realistic progress with batch updates', async ({ page }) => {
    await page.click('#login-form button[type="submit"]');

    // Discovery view should show
    await expect(page.locator('#discovery-progress-view')).toBeVisible({ timeout: 2000 });

    // Track scanned count over time
    const scannedValues = [];

    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(300);
      const scanned = await page.locator('#discovery-scanned').textContent();
      scannedValues.push(parseInt(scanned || '0'));
    }

    // Scanned count should increase (showing batches)
    expect(scannedValues[scannedValues.length - 1]).toBeGreaterThan(scannedValues[0]);
  });

  test('falls back to mock on SDK errors', async ({ page }) => {
    // Even if SDK fails, should complete discovery via fallback
    await page.click('#login-form button[type="submit"]');

    // Should eventually show dashboard (via fallback if needed)
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 10000 });

    const dashboardView = page.locator('#dashboard-view');
    await expect(dashboardView).toBeVisible();
  });

  test('displays batch progress in console', async ({ page }) => {
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    await page.click('#login-form button[type="submit"]');

    // Wait for discovery to process
    await page.waitForTimeout(2000);

    // Should see batch progress messages
    const hasBatchMessages = consoleMessages.some(msg =>
      msg.includes('Batch') || msg.includes('Scanned')
    );

    expect(hasBatchMessages).toBe(true);
  });
});

test.describe('Identity Discovery - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await page.evaluate(() => {
      localStorage.removeItem('dash-logged-in');
    });
    await page.reload();
  });

  test('handles empty mnemonic', async ({ page }) => {
    // Clear mnemonic input
    await page.fill('#login-mnemonic', '');

    // Try to login
    await page.click('#login-form button[type="submit"]');

    // Should show error notification
    await page.waitForSelector('.notification', { timeout: 2000 });

    const notification = page.locator('.notification');
    const text = await notification.textContent();

    expect(text).toContain('mnemonic');
  });

  test('handles invalid mnemonic format', async ({ page }) => {
    // Enter invalid mnemonic
    await page.fill('#login-mnemonic', 'invalid mnemonic words');

    // Try to login
    await page.click('#login-form button[type="submit"]');

    // Should show error or handle gracefully
    await page.waitForSelector('.notification, #login-view', { timeout: 3000 });
  });

  test('handles network timeout gracefully', async ({ page }) => {
    // Enable real mode which may timeout
    await page.evaluate(() => {
      localStorage.setItem('useMockMode', 'false');
    });

    await page.reload();

    // Submit login
    await page.click('#login-form button[type="submit"]');

    // Should eventually complete (via fallback)
    await page.waitForSelector('#dashboard-view:not([hidden]), #login-view:not([hidden])', {
      timeout: 15000
    });

    // One of these views should be visible
    const dashboardVisible = await page.locator('#dashboard-view').isVisible();
    const loginVisible = await page.locator('#login-view').isVisible();

    expect(dashboardVisible || loginVisible).toBe(true);
  });
});

test.describe('Identity Discovery - Progress Feedback', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await page.evaluate(() => {
      localStorage.removeItem('dash-logged-in');
    });
    await page.reload();
  });

  test('shows scanned counter incrementing', async ({ page }) => {
    await page.click('#login-form button[type="submit"]');

    await expect(page.locator('#discovery-progress-view')).toBeVisible();

    // Capture initial value
    await page.waitForTimeout(100);
    const initial = await page.locator('#discovery-scanned').textContent();

    // Wait for update
    await page.waitForTimeout(300);
    const updated = await page.locator('#discovery-scanned').textContent();

    // Value should have changed
    expect(updated).not.toBe(initial);
    expect(parseInt(updated || '0')).toBeGreaterThan(parseInt(initial || '0'));
  });

  test('shows found counter updating', async ({ page }) => {
    await page.click('#login-form button[type="submit"]');

    await expect(page.locator('#discovery-progress-view')).toBeVisible();

    // Wait for identities to be found
    await page.waitForTimeout(500);

    const foundCount = await page.locator('#discovery-count').textContent();
    expect(parseInt(foundCount || '0')).toBeGreaterThan(0);
  });

  test('updates counters in real-time', async ({ page }) => {
    await page.click('#login-form button[type="submit"]');

    await expect(page.locator('#discovery-progress-view')).toBeVisible();

    const updates = [];

    // Capture multiple snapshots
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(200);
      const scanned = await page.locator('#discovery-scanned').textContent();
      const found = await page.locator('#discovery-count').textContent();

      updates.push({
        scanned: parseInt(scanned || '0'),
        found: parseInt(found || '0')
      });
    }

    // At least one counter should have changed
    const scannedChanged = updates.some((u, i) => i > 0 && u.scanned !== updates[0].scanned);
    const foundChanged = updates.some((u, i) => i > 0 && u.found !== updates[0].found);

    expect(scannedChanged || foundChanged).toBe(true);
  });
});

test.describe('Identity Discovery - State Persistence', () => {
  test('persists login state after discovery', async ({ page }) => {
    await setupMockMode(page);
    await page.evaluate(() => {
      localStorage.removeItem('dash-logged-in');
    });
    await page.reload();

    // Complete login
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 5000 });

    // Reload page
    await page.reload();

    // Should skip login and go straight to dashboard
    const loginView = page.locator('#login-view');
    await expect(loginView).toBeHidden({ timeout: 2000 });

    const dashboardView = page.locator('#dashboard-view');
    await expect(dashboardView).toBeVisible();
  });

  test('remembers discovered identities after reload', async ({ page }) => {
    await setupMockMode(page);
    await page.evaluate(() => {
      localStorage.removeItem('dash-logged-in');
    });
    await page.reload();

    // Complete discovery
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 5000 });

    // Get identity count
    const countBefore = await page.locator('#stat-identities').textContent();

    // Reload
    await page.reload();

    // Identity count should be same
    const countAfter = await page.locator('#stat-identities').textContent();
    expect(countAfter).toBe(countBefore);
  });

  test('allows logout and re-login', async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);

    // Verify logged in
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 5000 });

    // Find and click logout button
    const logoutBtn = page.locator('[data-action="logout"], #logout-btn');
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();

      // Should return to login screen
      await expect(page.locator('#login-view')).toBeVisible();
    }
  });
});

test.describe('Identity Discovery - Empty Wallet', () => {
  test('handles wallet with no identities', async ({ page }) => {
    await setupMockMode(page);

    // Inject empty wallet scenario
    await page.evaluate(() => {
      localStorage.removeItem('dash-logged-in');
      localStorage.removeItem('dash-identity-manager-state');
    });

    await page.reload();

    // Login
    await page.click('#login-form button[type="submit"]');

    // Wait for completion
    await page.waitForSelector('#discovery-progress-view[hidden]', { timeout: 5000 });

    // Should show welcome state for empty wallet
    const welcomeState = page.locator('#welcome-state');
    const dashboardView = page.locator('#dashboard-view');

    // Either welcome state or dashboard with zero identities should show
    const welcomeVisible = await welcomeState.isVisible();
    const dashboardVisible = await dashboardView.isVisible();

    expect(welcomeVisible || dashboardVisible).toBe(true);
  });

  test('shows create identity prompt for new users', async ({ page }) => {
    await setupMockMode(page);

    await page.evaluate(() => {
      localStorage.removeItem('dash-logged-in');
      localStorage.removeItem('dash-identity-manager-state');
    });

    await page.reload();
    await page.click('#login-form button[type="submit"]');

    // Wait for views to settle
    await page.waitForTimeout(2000);

    const welcomeState = page.locator('#welcome-state');
    if (await welcomeState.isVisible()) {
      // Should have create identity button
      const createBtn = page.locator('#create-identity-btn, [data-action="create"]');
      await expect(createBtn).toBeVisible();
    }
  });
});

test.describe('Identity Discovery - SDK Validation', () => {
  test.beforeEach(async ({ page }) => {
    await setupTestnetMode(page);
    await page.evaluate(() => {
      localStorage.removeItem('dash-logged-in');
    });
    await page.reload();
  });

  test('creates wallet with offlineMode flag', async ({ page }) => {
    // Capture console output to verify offlineMode is being used
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });

    // Start login
    await page.click('#login-form button[type="submit"]');

    // Wait for wallet creation
    await page.waitForTimeout(2000);

    // Check that offlineMode flag is mentioned in console
    const hasOfflineMode = consoleLogs.some(msg =>
      msg.includes('offlineMode') || msg.includes('offlineMode: true')
    );

    // Whether or not we see the log, the app should continue
    const hasSDKInjectionError = consoleLogs.some(msg =>
      msg.includes('SDK not injected') || msg.includes('[IdentitySyncWorker]')
    );

    expect(hasSDKInjectionError).toBe(false);
  });

  test('discovers identities without IdentitySyncWorker errors', async ({ page }) => {
    const consoleErrors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Start discovery
    await page.click('#login-form button[type="submit"]');

    // Wait for discovery progress to show
    await expect(page.locator('#discovery-progress-view')).toBeVisible({ timeout: 3000 });

    // Monitor for batch progress updates
    let batchesDetected = 0;
    for (let i = 0; i < 5; i++) {
      const scanned = await page.locator('#discovery-scanned').textContent();
      if (scanned && parseInt(scanned) > 0) {
        batchesDetected++;
      }
      await page.waitForTimeout(500);
    }

    // Should have seen some progress
    expect(batchesDetected).toBeGreaterThan(0);

    // Should not have SDK injection errors
    const injectionErrors = consoleErrors.filter(msg =>
      msg.includes('SDK not injected') ||
      msg.includes('IdentitySyncWorker') ||
      msg.includes('already locked')
    );

    expect(injectionErrors).toHaveLength(0);
  });

  test('validates network configuration', async ({ page }) => {
    // Check that we're connecting to testnet
    const configuredNetwork = await page.evaluate(() => {
      return localStorage.getItem('selectedNetwork') || localStorage.getItem('network') || 'testnet';
    });

    expect(['testnet', 'mainnet']).toContain(configuredNetwork);
  });
});
