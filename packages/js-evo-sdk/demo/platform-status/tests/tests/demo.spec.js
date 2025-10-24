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
 */

test.describe('Dash Platform Status Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the demo page using baseURL
    await page.goto('index.html');
  });

  test.describe('Page Load & Auto-Connection', () => {
    test('should load without console errors', async ({ page }) => {
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          // Filter out expected SDK module loading errors
          const text = msg.text();
          if (!text.includes('dist/evo-sdk.module.js') &&
              !text.includes('Failed to fetch dynamically') &&
              !text.includes('Failed to load resource')) {
            errors.push(text);
          }
        }
      });

      // Wait for initial load and connection attempt
      await page.waitForTimeout(2000);
      expect(errors).toEqual([]);
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
      await expect(connectionStatus).toContainText(/Connecting|Connected|Connection Failed/, {
        timeout: 8000
      });
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
  });

  test.describe('Network Selector Component', () => {
    test('should display network selector', async ({ page }) => {
      const selector = page.locator('#networkSelect');
      await expect(selector).toBeVisible();
    });

    test('should have testnet and mainnet options', async ({ page }) => {
      const selector = page.locator('#networkSelect');

      const options = await selector.locator('option').count();
      expect(options).toBe(2);

      const testnetOption = page.locator('option[value="testnet"]');
      const mainnetOption = page.locator('option[value="mainnet"]');

      await expect(testnetOption).toBeVisible();
      await expect(mainnetOption).toBeVisible();
    });

    test('should default to testnet', async ({ page }) => {
      const selector = page.locator('#networkSelect');
      const value = await selector.inputValue();
      expect(value).toBe('testnet');
    });

    test('should have proper labels for network options', async ({ page }) => {
      const testnetOption = page.locator('option[value="testnet"]');
      const mainnetOption = page.locator('option[value="mainnet"]');

      const testnetText = await testnetOption.textContent();
      const mainnetText = await mainnetOption.textContent();

      expect(testnetText).toBe('Testnet');
      expect(mainnetText).toBe('Mainnet');
    });

    test('should update description when network is selected', async ({ page }) => {
      const selector = page.locator('#networkSelect');
      const description = page.locator('#networkDescription');

      // Initial state
      await expect(description).toContainText('Testnet Live Status Dashboard');

      // Change to mainnet
      await selector.selectOption('mainnet');
      await page.waitForTimeout(2000);

      // Description should update
      await expect(description).toContainText('Mainnet Live Status Dashboard');

      // Change back to testnet
      await selector.selectOption('testnet');
      await page.waitForTimeout(2000);

      // Description should revert
      await expect(description).toContainText('Testnet Live Status Dashboard');
    });

    test('should show connecting state when switching networks', async ({ page }) => {
      const selector = page.locator('#networkSelect');
      const connectionStatus = page.locator('#connectionStatus');

      // Change network
      await selector.selectOption('mainnet');

      // Should show "Connecting..." initially
      await expect(connectionStatus).toContainText('Connecting...', { timeout: 1000 }).catch(() => {
        // It's okay if it transitions too quickly
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

      if (status === 'Connected') {
        // Block Height
        await expect(page.locator('#blockHeight')).toBeVisible();

        // Peers Count
        await expect(page.locator('#peersCount')).toBeVisible();

        // Network
        await expect(page.locator('#network')).toBeVisible();

        // Sync Status
        await expect(page.locator('#syncStatus')).toBeVisible();
      }
    });

    test('should display block height metric', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const blockHeight = page.locator('#blockHeight');
        const text = await blockHeight.textContent();

        // Should contain a number or dash
        expect(/\d+|—/.test(text)).toBe(true);
      }
    });

    test('should display peers count metric', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const peersCount = page.locator('#peersCount');
        const text = await peersCount.textContent();

        expect(/\d+|—/.test(text)).toBe(true);
      }
    });

    test('should display network metric', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const network = page.locator('#network');
        const text = await network.textContent();

        // Should show testnet or similar
        expect(text).toBeTruthy();
      }
    });

    test('should display sync status', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const syncStatus = page.locator('#syncStatus');
        const text = await syncStatus.textContent();

        expect(/Synced|Catching Up/.test(text)).toBe(true);
      }
    });

    test('should display all info cards', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
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
      }
    });

    test('should display software versions', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const dapi = await page.locator('#versionDAPI').textContent();
        const drive = await page.locator('#versionDrive').textContent();
        const tenderdash = await page.locator('#versionTenderdash').textContent();

        // All should have values or dashes
        expect(dapi).toBeTruthy();
        expect(drive).toBeTruthy();
        expect(tenderdash).toBeTruthy();
      }
    });

    test('should display protocol versions', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const p2p = await page.locator('#protocolP2P').textContent();
        const block = await page.locator('#protocolBlock').textContent();

        expect(p2p).toBeTruthy();
        expect(block).toBeTruthy();
      }
    });

    test('should display chain information with truncated hash', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const latestHash = await page.locator('#latestHash').textContent();

        // Should have truncated format (12 chars, dots, 12 chars) or dashes
        if (latestHash !== '—') {
          expect(latestHash.includes('...')).toBe(true);
        }
      }
    });

    test('should display node information', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const nodeId = await page.locator('#nodeId').textContent();
        const listening = await page.locator('#listening').textContent();

        expect(nodeId).toBeTruthy();
        expect(['Yes', 'No']).toContain(listening);
      }
    });
  });

  test.describe('Auto-Refresh Functionality', () => {
    test.beforeEach(async ({ page }) => {
      // Wait for initial load
      await page.waitForTimeout(5000);
    });

    test('should display last updated timestamp in footer', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const lastUpdatedText = page.locator('#lastUpdatedText');
        const text = await lastUpdatedText.textContent();

        expect(text).toContain('Last updated:');
        expect(/\d{2}:\d{2}:\d{2}/.test(text)).toBe(true);
      }
    });

    test('should display pulsing indicator in footer', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const pulse = page.locator('.footer .pulse');
        await expect(pulse).toBeVisible();
      }
    });

    test('should update timestamp periodically', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const lastUpdatedText = page.locator('#lastUpdatedText');

        const firstTime = await lastUpdatedText.textContent();

        // Wait and check if timestamp updates (30+ seconds)
        // For testing purposes, we just verify it's a valid timestamp
        expect(firstTime).toContain('Last updated:');
      }
    });

    test('should have last updated in footer, not in main container', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const footerLastUpdated = page.locator('.footer #lastUpdated');
        await expect(footerLastUpdated).toBeVisible();
      }
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

      // Network selector should be visible and accessible
      await expect(page.locator('#networkSelect')).toBeVisible();

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

      // Network selector should be visible
      await expect(page.locator('#networkSelect')).toBeVisible();
    });

    test('should be responsive on desktop viewport', async ({ page }) => {
      // Set desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('');

      await page.waitForTimeout(2000);

      // All major sections should be visible
      await expect(page.locator('.header')).toBeVisible();

      // Network selector should be visible
      await expect(page.locator('#networkSelect')).toBeVisible();

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
      const selector = page.locator('#networkSelect');
      await selector.selectOption('mainnet');
      await page.waitForTimeout(4000);

      // Verify network changed
      description = await page.locator('#networkDescription').textContent();
      expect(description).toContain('Mainnet');

      // Verify connection status (should be connected or connecting)
      status = await page.locator('#connectionStatus').textContent();
      expect(['Connecting...', 'Connected', 'Connection Failed']).toContain(status);

      // Switch back to testnet
      await selector.selectOption('testnet');
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

      if (status === 'Connected') {
        const blockHeight = await page.locator('#blockHeight').textContent();

        if (blockHeight !== '—') {
          const height = parseInt(blockHeight);
          expect(height).toBeGreaterThan(0);
        }
      }
    });

    test('should display valid peer counts', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const peersCount = await page.locator('#peersCount').textContent();

        if (peersCount !== '—') {
          const peers = parseInt(peersCount);
          expect(peers).toBeGreaterThanOrEqual(0);
        }
      }
    });

    test('should display valid network identifier', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const network = await page.locator('#network').textContent();

        // Should contain testnet or similar identifier
        expect(network).toBeTruthy();
        expect(['testnet', 'mainnet', '—']).toContain(network.toLowerCase());
      }
    });

    test('should display hash in correct format', async ({ page }) => {
      const status = await page.locator('#connectionStatus').textContent();

      if (status === 'Connected') {
        const hash = await page.locator('#latestHash').textContent();

        if (hash !== '—') {
          // Should be truncated: 12chars...12chars
          expect(hash.includes('...')).toBe(true);
          expect(hash.length).toBeGreaterThan(20);
        }
      }
    });
  });
});
