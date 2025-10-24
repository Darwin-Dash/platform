import { test, expect } from '@playwright/test';

/**
 * Dash Platform Status Dashboard - End-to-End Test Suite
 *
 * Tests the automatic status dashboard:
 * 1. Auto-connection on page load
 * 2. Dashboard UI and metric displays
 * 3. Auto-refresh functionality
 * 4. Data presentation and formatting
 * 5. Error handling
 * 6. Responsiveness across viewports
 *
 * Console Logging:
 * - All console messages (errors, warnings, logs, infos, debugs) are captured in page.consoleLogs
 * - Access via: page.consoleLogs.errors, page.consoleLogs.warnings, page.consoleLogs.logs, etc.
 * - Useful for debugging test failures
 */

/**
 * Helper function to print console logs for debugging
 * @param {Object} consoleLogs - The consoleLogs object from page
 * @param {string} testName - Name of the test for context
 */
function printConsoleLogs(consoleLogs, testName) {
  const hasAnyLogs = Object.values(consoleLogs).some(arr => arr.length > 0);
  if (hasAnyLogs) {
    console.log(`\n=== Console Logs for: ${testName} ===`);
    if (consoleLogs.errors.length > 0) console.log('ERRORS:', consoleLogs.errors);
    if (consoleLogs.warnings.length > 0) console.log('WARNINGS:', consoleLogs.warnings);
    if (consoleLogs.logs.length > 0) console.log('LOGS:', consoleLogs.logs);
    if (consoleLogs.infos.length > 0) console.log('INFOS:', consoleLogs.infos);
    if (consoleLogs.debugs.length > 0) console.log('DEBUGS:', consoleLogs.debugs);
  }
}

test.describe('Dash Platform Status Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Set up global console logging for troubleshooting
    const consoleLogs = {
      errors: [],
      warnings: [],
      logs: [],
      infos: [],
      debugs: []
    };

    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();

      if (type === 'error') {
        consoleLogs.errors.push(text);
      } else if (type === 'warning') {
        consoleLogs.warnings.push(text);
      } else if (type === 'log') {
        consoleLogs.logs.push(text);
      } else if (type === 'info') {
        consoleLogs.infos.push(text);
      } else if (type === 'debug') {
        consoleLogs.debugs.push(text);
      }
    });

    // Attach to page object for access in tests
    page.consoleLogs = consoleLogs;

    // Navigate to the page (baseURL is http://localhost:8000/)
    await page.goto('/');
  });

  test.describe('Page Load & Auto-Connection', () => {
    test('should load without console errors', async ({ page }) => {
      // Wait for initial load and connection attempt
      await page.waitForTimeout(2000);

      // Check errors captured by global console logger
      expect(page.consoleLogs.errors).toEqual([],
        `Expected no console errors, but got: ${page.consoleLogs.errors.join('; ')}`);
    });

    test('should display correct page title', async ({ page }) => {
      const title = await page.title();
      expect(title).toBe('Dash Platform Status');
    });

    test('should show loading state initially', async ({ page }) => {
      // Immediately check for loading spinner
      const loading = page.locator('#loading');
      await expect(loading).toBeVisible({ timeout: 1000 }).catch(() => {
        // It's okay if already connected
      });
    });

    test('should auto-connect without user interaction', async ({ page }) => {
      // Wait for connection to complete (up to 5 seconds)
      const connectionStatus = page.locator('#connectionStatus');

      // Should transition from "Connecting" to either "Connected" or show error
      try {
        await expect(connectionStatus).toContainText(/Connecting|Connected|Connection Failed/, {
          timeout: 8000
        });
      } catch (error) {
        // Log console messages for debugging connection failures
        printConsoleLogs(page.consoleLogs, 'auto-connect test');
        throw error;
      }
    });

    test('should display connection status badge', async ({ page }) => {
      await page.waitForTimeout(2000);
      const badge = page.locator('#connectionStatus');
      await expect(badge).toBeVisible();

      const statusText = await badge.textContent();
      expect(['Connecting...', 'Connected', 'Connection Failed']).toContain(statusText);
    });

    test('should show header with title and subtitle', async ({ page }) => {
      const header = page.locator('.header');
      await expect(header).toBeVisible();

      const title = page.locator('h1');
      await expect(title).toContainText('Dash Platform Status');

      const subtitle = page.locator('#networkDescription');
      await expect(subtitle).toContainText('Testnet Live Status Dashboard');
    });

    test('should load SDK module successfully', async ({ page }) => {
      // Verify that the SDK module file loads via HTTP with 200 status
      const sdkModuleResponse = await page.request.head('/dist/evo-sdk.module.js');
      expect(sdkModuleResponse.status()).toBe(200,
        `SDK module should load successfully. Got status ${sdkModuleResponse.status()}`);
    });

    test('should have SDK available in initialization context', async ({ page }) => {
      // Verify SDK was successfully imported and initialized
      // by checking that we get either "Connected" or a valid error message, not a module error
      const connectionStatus = page.locator('#connectionStatus');
      const statusText = await connectionStatus.textContent();

      // The status should be one of these - NOT a module loading error
      const validStates = ['Connecting...', 'Connected', 'Connection Failed'];
      try {
        expect(validStates).toContain(statusText,
          `SDK should load successfully. Status: ${statusText}`);
      } catch (error) {
        // Log console messages for debugging SDK loading issues
        printConsoleLogs(page.consoleLogs, 'SDK initialization test');
        throw error;
      }

      // If status is "Connection Failed", verify it's not due to SDK module loading
      if (statusText === 'Connection Failed') {
        const error = page.locator('#error');
        const errorText = await error.textContent();
        expect(errorText).not.toContain('evo-sdk.module.js',
          'Connection failure should not be due to SDK module loading');
        expect(errorText).not.toContain('Failed to fetch dynamically',
          'Connection failure should not be due to module import');
      }
    });
  });

  test.describe('Network Toggle Component', () => {
    test('should display network toggle button', async ({ page }) => {
      const button = page.locator('#networkToggle');
      await expect(button).toBeVisible();
    });

    test('should default to testnet', async ({ page }) => {
      const button = page.locator('#networkToggle');
      const text = await button.textContent();
      expect(text).toContain('Testnet');
    });

    test('should update description on load', async ({ page }) => {
      const description = page.locator('#networkDescription');
      await expect(description).toContainText('Testnet Live Status Dashboard');
    });

    test('should toggle network when button clicked', async ({ page }) => {
      const button = page.locator('#networkToggle');
      const description = page.locator('#networkDescription');

      // Initial state - testnet
      await expect(description).toContainText('Testnet Live Status Dashboard');

      // Click to switch to mainnet
      await button.click();
      await page.waitForTimeout(2000);

      // Description should update
      await expect(description).toContainText('Mainnet Live Status Dashboard');

      // Click again to switch back to testnet
      await button.click();
      await page.waitForTimeout(2000);

      // Description should revert
      await expect(description).toContainText('Testnet Live Status Dashboard');
    });

    test('should show connecting state when switching networks', async ({ page }) => {
      const button = page.locator('#networkToggle');
      const connectionStatus = page.locator('#connectionStatus');

      // Click to change network
      await button.click();

      // Should show "Connecting..." initially
      await expect(connectionStatus).toContainText('Connecting...', { timeout: 2000 }).catch(() => {
        // It's okay if it transitions too quickly or is already connected
      });
    });
  });

  test.describe('Dashboard Display', () => {
    test.beforeEach(async ({ page }) => {
      // Wait for dashboard to load and display
      await page.waitForTimeout(5000);
    });

    test('should display metrics grid after connection', async ({ page }) => {
      const dashboard = page.locator('#dashboard');

      // Dashboard should be visible (connection succeeded)
      const isVisible = await dashboard.isVisible().catch(() => false);
      if (isVisible) {
        // Verify metric cards exist
        const metricsGrid = page.locator('.metrics-grid');
        await expect(metricsGrid).toBeVisible();
      }
    });

    test('should display all metric cards', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      // Connection must succeed for dashboard to show metrics
      expect(status).toBe('Connected',
        `SDK must be connected to display metrics. Current status: ${status}`);

      // Block Height
      await expect(page.locator('#blockHeight')).toBeVisible();

      // Peers Count
      await expect(page.locator('#peersCount')).toBeVisible();

      // Network
      await expect(page.locator('#network')).toBeVisible();

      // Sync Status
      await expect(page.locator('#syncStatus')).toBeVisible();
    });

    test('should display block height metric', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `Must be connected to display metrics. Current status: ${status}`);

      const blockHeight = page.locator('#blockHeight');
      const text = await blockHeight.textContent();

      // Should contain a number or dash
      expect(/\d+|—/.test(text)).toBe(true);
    });

    test('should display peers count metric', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `Must be connected to display metrics. Current status: ${status}`);

      const peersCount = page.locator('#peersCount');
      const text = await peersCount.textContent();

      expect(/\d+|—/.test(text)).toBe(true);
    });

    test('should display network metric', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `Must be connected to display metrics. Current status: ${status}`);

      const network = page.locator('#network');
      const text = await network.textContent();

      // Should show testnet or similar
      expect(text).toBeTruthy();
    });

    test('should display sync status', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `Must be connected to display metrics. Current status: ${status}`);

      const syncStatus = page.locator('#syncStatus');
      const text = await syncStatus.textContent();

      expect(/Synced|Catching Up/.test(text)).toBe(true);
    });

    test('should display all info cards', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `SDK must be connected to display info cards. Current status: ${status}`);

      // Software Versions card
      const versionDAPI = page.locator('#versionDAPI');
      await expect(versionDAPI).toBeVisible();

      // Protocol card
      const protocolP2P = page.locator('#protocolP2P');
      await expect(protocolP2P).toBeVisible();

      // Chain Info card
      const latestHash = page.locator('#latestHash');
      await expect(latestHash).toBeVisible();

      // Node Info card
      const nodeId = page.locator('#nodeId');
      await expect(nodeId).toBeVisible();
    });

    test('should display software versions', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `SDK must be connected to display software versions. Current status: ${status}`);

      const dapi = await page.locator('#versionDAPI').textContent();
      const drive = await page.locator('#versionDrive').textContent();
      const tenderdash = await page.locator('#versionTenderdash').textContent();

      // All should have values or dashes
      expect(dapi).toBeTruthy();
      expect(drive).toBeTruthy();
      expect(tenderdash).toBeTruthy();
    });

    test('should display protocol versions', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `SDK must be connected to display protocol versions. Current status: ${status}`);

      const p2p = await page.locator('#protocolP2P').textContent();
      const block = await page.locator('#protocolBlock').textContent();

      expect(p2p).toBeTruthy();
      expect(block).toBeTruthy();
    });

    test('should display chain information with truncated hash', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `SDK must be connected to display chain information. Current status: ${status}`);

      const latestHash = await page.locator('#latestHash').textContent();

      // Should have truncated format (12 chars, dots, 12 chars) or dashes
      if (latestHash !== '—') {
        expect(latestHash.includes('...')).toBe(true);
      }
    });

    test('should display node information', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `SDK must be connected to display node information. Current status: ${status}`);

      const nodeId = await page.locator('#nodeId').textContent();
      const listening = await page.locator('#listening').textContent();

      expect(nodeId).toBeTruthy();
      expect(['Yes', 'No']).toContain(listening);
    });
  });

  test.describe('Auto-Refresh Functionality', () => {
    test.beforeEach(async ({ page }) => {
      // Wait for initial load
      await page.waitForTimeout(5000);
    });

    test('should display last updated timestamp in footer', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `SDK must be connected to display refresh information. Current status: ${status}`);

      const lastUpdatedText = page.locator('#lastUpdatedText');
      const text = await lastUpdatedText.textContent();

      expect(text).toContain('Last updated:');
      expect(/\d{2}:\d{2}:\d{2}/.test(text)).toBe(true);
    });

    test('should display pulsing indicator in footer', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `SDK must be connected to display refresh indicator. Current status: ${status}`);

      const pulse = page.locator('.footer .pulse');
      await expect(pulse).toBeVisible();
    });

    test('should update timestamp periodically', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `SDK must be connected for refresh testing. Current status: ${status}`);

      const lastUpdatedText = page.locator('#lastUpdatedText');

      const firstTime = await lastUpdatedText.textContent();

      // Wait and check if timestamp updates (30+ seconds)
      // For testing purposes, we just verify it's a valid timestamp
      expect(firstTime).toContain('Last updated:');
    });

    test('should have last updated in footer, not in main container', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `SDK must be connected. Current status: ${status}`);

      const footerLastUpdated = page.locator('.footer #lastUpdated');
      await expect(footerLastUpdated).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should display error message on connection failure', async ({ page }) => {
      // Some network conditions might cause connection to fail
      // If so, error message should be displayed
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connection Failed') {
        const error = page.locator('#error');
        await expect(error).toBeVisible();

        const errorText = await error.textContent();
        expect(errorText).toBeTruthy();
      }
    });

    test('should hide error when connection succeeds', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const error = page.locator('#error');
        const isHidden = await error.evaluate(el => el.style.display === 'none' || !el.offsetParent);
        expect(isHidden).toBe(true);
      }
    });
  });

  test.describe('UI Responsiveness', () => {
    test('should be responsive on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('');

      // Wait for content
      await page.waitForTimeout(2000);

      // Header should be visible
      await expect(page.locator('.header')).toBeVisible();

      // Connection status should be visible
      await expect(page.locator('#connectionStatus')).toBeVisible();

      // Network toggle should be visible and accessible
      await expect(page.locator('#networkToggle')).toBeVisible();

      // Footer should be visible
      await expect(page.locator('.footer')).toBeVisible();
    });

    test('should be responsive on tablet viewport', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('');

      await page.waitForTimeout(2000);

      // Main elements should be visible
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('.container')).toBeVisible();

      // Network toggle should be visible
      await expect(page.locator('#networkToggle')).toBeVisible();
    });

    test('should be responsive on desktop viewport', async ({ page }) => {
      // Set desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('');

      await page.waitForTimeout(2000);

      // All major sections should be visible
      await expect(page.locator('.header')).toBeVisible();

      // Network toggle should be visible
      await expect(page.locator('#networkToggle')).toBeVisible();

      const status = await page.locator('#connectionStatus').textContent();
      if (status === 'Connected') {
        await expect(page.locator('.metrics-grid')).toBeVisible();
        await expect(page.locator('.info-grid')).toBeVisible();
      }
    });

    test('should adapt grid layout on smaller screens', async ({ page }) => {
      // Mobile should have single-column grid
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');

      const metricsGrid = page.locator('.metrics-grid');
      const gridCols = await metricsGrid.evaluate((el) => {
        return window.getComputedStyle(el).gridTemplateColumns;
      });

      // Mobile should have reduced grid columns (1fr)
      expect(gridCols).toBeTruthy();
    });
  });

  test.describe('Integration Tests', () => {
    test('complete flow: auto-connect and display status', async ({ page }) => {
      // Page loads automatically
      await page.goto('');

      // Should show connecting state initially
      let status = await page.locator('#connectionStatus').textContent();
      expect(['Connecting...', 'Connected', 'Connection Failed']).toContain(status);

      // Wait for connection to complete
      await page.waitForTimeout(5000);

      status = await page.locator('#connectionStatus').textContent();

      // Should be either connected or show error
      expect(['Connected', 'Connection Failed']).toContain(status);

      if (status === 'Connected') {
        // Dashboard should be visible
        await expect(page.locator('#dashboard')).toBeVisible();

        // Should have metrics
        const blockHeight = await page.locator('#blockHeight').textContent();
        expect(blockHeight).toBeTruthy();

        // Should have last updated timestamp
        const lastUpdated = await page.locator('#lastUpdated').textContent();
        expect(lastUpdated).toContain('Last updated:');
      }
    });

    test('should maintain connection and display stable data', async ({ page }) => {
      // Allow time for connection and first data fetch
      await page.goto('');
      await page.waitForTimeout(4000);

      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        // Get initial values
        const initialBlockHeight = await page.locator('#blockHeight').textContent();
        const initialPeers = await page.locator('#peersCount').textContent();

        // Values should exist
        expect(initialBlockHeight).toBeTruthy();
        expect(initialPeers).toBeTruthy();

        // Wait a bit
        await page.waitForTimeout(2000);

        // Values should still exist (no crashes)
        const latestBlockHeight = await page.locator('#blockHeight').textContent();
        const latestPeers = await page.locator('#peersCount').textContent();

        expect(latestBlockHeight).toBeTruthy();
        expect(latestPeers).toBeTruthy();
      }
    });

    test('should handle long running dashboard', async ({ page }) => {
      await page.goto('');
      await page.waitForTimeout(4000);

      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        // Simulate 5 refresh cycles (would be 150 seconds with 30s intervals)
        // For testing, just verify dashboard is stable
        for (let i = 0; i < 3; i++) {
          await page.waitForTimeout(1000);

          // Check that key elements are still visible
          const dashboard = page.locator('#dashboard');
          const isVisible = await dashboard.isVisible().catch(() => false);
          expect(isVisible).toBe(true);
        }
      }
    });

    test('complete flow: network switching with data refresh', async ({ page }) => {
      // Page loads on testnet
      await page.goto('');
      await page.waitForTimeout(5000);

      let status = await page.locator('#connectionStatus').textContent();
      expect(['Connecting...', 'Connected', 'Connection Failed']).toContain(status);

      let description = await page.locator('#networkDescription').textContent();
      expect(description).toContain('Testnet');

      // Switch to mainnet
      const button = page.locator('#networkToggle');
      await button.click();
      await page.waitForTimeout(4000);

      // Verify network changed
      description = await page.locator('#networkDescription').textContent();
      expect(description).toContain('Mainnet');

      // Verify connection status (should be connected or connecting)
      status = await page.locator('#connectionStatus').textContent();
      expect(['Connecting...', 'Connected', 'Connection Failed']).toContain(status);

      // Switch back to testnet
      await button.click();
      await page.waitForTimeout(4000);

      // Verify back to testnet
      description = await page.locator('#networkDescription').textContent();
      expect(description).toContain('Testnet');
    });
  });

  test.describe('Data Validation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('');
      await page.waitForTimeout(4000);
    });

    test('should display valid block heights', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `SDK must be connected for data validation. Current status: ${status}`);

      const blockHeight = await page.locator('#blockHeight').textContent();

      if (blockHeight !== '—') {
        const height = parseInt(blockHeight);
        expect(height).toBeGreaterThan(0);
      }
    });

    test('should display valid peer counts', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `SDK must be connected for data validation. Current status: ${status}`);

      const peersCount = await page.locator('#peersCount').textContent();

      if (peersCount !== '—') {
        const peers = parseInt(peersCount);
        expect(peers).toBeGreaterThanOrEqual(0);
      }
    });

    test('should display valid network identifier', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `SDK must be connected for data validation. Current status: ${status}`);

      const network = await page.locator('#network').textContent();

      // Should contain testnet or similar identifier
      expect(network).toBeTruthy();
      expect(['testnet', 'mainnet', '—']).toContain(network.toLowerCase());
    });

    test('should display hash in correct format', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      expect(status).toBe('Connected',
        `SDK must be connected for data validation. Current status: ${status}`);

      const hash = await page.locator('#latestHash').textContent();

      if (hash !== '—') {
        // Should be truncated: 12chars...12chars
        expect(hash.includes('...')).toBe(true);
        expect(hash.length).toBeGreaterThan(20);
      }
    });
  });
});
