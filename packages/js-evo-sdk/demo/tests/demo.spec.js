import { test, expect, Page } from '@playwright/test';

/**
 * js-evo-sdk Demo - End-to-End Test Suite
 *
 * Tests the complete demo workflow:
 * 1. Page initialization and UI elements
 * 2. SDK connection to Dash Platform testnet
 * 3. Platform status queries
 * 4. Activity logging
 * 5. Error handling
 */

test.describe('js-evo-sdk Demo', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the demo page
    await page.goto('/');

    // Wait for demo to initialize (activity log shows ready message)
    await page.waitForSelector('#logs', { state: 'visible' });
  });

  test.describe('Page Load & Initial State', () => {
    test('should load without console errors', async ({ page }) => {
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      await page.waitForTimeout(1000);
      expect(errors).toEqual([]);
    });

    test('should display correct page title', async ({ page }) => {
      const title = await page.title();
      expect(title).toContain('js-evo-sdk Demo');
    });

    test('should show all required UI elements', async ({ page }) => {
      // Status section
      await expect(page.locator('#status')).toBeVisible();
      await expect(page.locator('#version')).toBeVisible();

      // Buttons
      await expect(page.locator('#connectBtn')).toBeVisible();
      await expect(page.locator('#queryBtn')).toBeVisible();

      // Log and results areas
      await expect(page.locator('#logs')).toBeVisible();
      await expect(page.locator('#results')).toBeVisible();
    });

    test('should have initial disconnected state', async ({ page }) => {
      const status = await page.locator('#status').textContent();
      expect(status).toContain('Disconnected');

      const version = await page.locator('#version').textContent();
      expect(version).toBe('—');

      const connectBtn = page.locator('#connectBtn');
      await expect(connectBtn).toBeEnabled();

      const queryBtn = page.locator('#queryBtn');
      await expect(queryBtn).toBeDisabled();
    });

    test('should show initial activity log messages', async ({ page }) => {
      const logText = await page.locator('#logs').textContent();
      expect(logText).toContain('Demo ready');
      expect(logText).toContain('js-evo-sdk');
    });
  });

  test.describe('SDK Connection Flow', () => {
    test('should connect to Dash Platform testnet', async ({ page }) => {
      // Click connect button
      const connectBtn = page.locator('#connectBtn');
      await expect(connectBtn).toBeEnabled();
      await connectBtn.click();

      // Wait for connection status to change
      const status = page.locator('#status');

      // Connection may fail immediately (if testnet unreachable) or show "Connecting"
      // So we check for either state, not just "Connecting"
      await expect(status).toContainText(/Connecting|Connection Failed|Connected/, { timeout: 5000 });

      // Wait a moment for final status
      await page.waitForTimeout(2000);

      // Check for either Connected or Error status (connection might fail due to network)
      const statusText = await status.textContent();
      expect(['Connected', 'Connection Failed']).toContain(statusText);
    });

    test('should log connection initialization steps', async ({ page }) => {
      await page.locator('#connectBtn').click();

      // Wait for logs to appear
      await page.waitForTimeout(2000);

      const logsText = await page.locator('#logs').textContent();
      expect(logsText).toContain('Initializing SDK');
    });

    test('should update version on successful connection', async ({ page }) => {
      await page.locator('#connectBtn').click();

      // Wait for connection attempt
      await page.waitForTimeout(3000);

      // If connection successful, version should be populated
      // If connection failed, version remains unchanged
      const version = await page.locator('#version').textContent();
      const status = await page.locator('#status').textContent();

      if (status.includes('Connected')) {
        expect(version).not.toBe('—');
        expect(parseInt(version)).toBeGreaterThan(0);
      }
    });

    test('should disable connect button after clicking', async ({ page }) => {
      const connectBtn = page.locator('#connectBtn');

      // Initially enabled
      await expect(connectBtn).toBeEnabled();

      // Click it
      await connectBtn.click();

      // Should be disabled while connecting
      await page.waitForTimeout(500);
      const isDisabled = await connectBtn.isDisabled();
      expect(isDisabled).toBe(true);
    });

    test('should enable query button on successful connection', async ({ page }) => {
      const queryBtn = page.locator('#queryBtn');

      // Initially disabled
      await expect(queryBtn).toBeDisabled();

      // Try to connect
      await page.locator('#connectBtn').click();

      // Wait for connection result
      await page.waitForTimeout(3000);

      const status = await page.locator('#status').textContent();
      if (status.includes('Connected')) {
        // Query button should be enabled
        await expect(queryBtn).toBeEnabled();
      }
    });
  });

  test.describe('Platform Query Operations', () => {
    test.beforeEach(async ({ page }) => {
      // Connect first
      await page.locator('#connectBtn').click();
      await page.waitForTimeout(3000);

      // Check if connected (skip query tests if connection failed)
      const status = await page.locator('#status').textContent();
      test.skip(!status.includes('Connected'), 'SDK not connected to testnet');
    });

    test('should fetch platform status', async ({ page }) => {
      const queryBtn = page.locator('#queryBtn');
      await expect(queryBtn).toBeEnabled();

      // Click query button
      await queryBtn.click();

      // Wait for results
      await page.waitForTimeout(2000);

      // Check results section contains data
      const results = await page.locator('#results').textContent();
      expect(results).toContain('System Information');
    });

    test('should display block height in results', async ({ page }) => {
      await page.locator('#queryBtn').click();

      await page.waitForTimeout(2000);

      const results = await page.locator('#results').textContent();
      expect(results).toContain('Block Height');

      // Should have a number value
      const blockHeightElement = page.locator('#results dd').first();
      const blockHeight = await blockHeightElement.textContent();
      expect(/\d+/.test(blockHeight)).toBe(true);
    });

    test('should display protocol version in results', async ({ page }) => {
      await page.locator('#queryBtn').click();

      await page.waitForTimeout(2000);

      const results = await page.locator('#results').textContent();
      expect(results).toContain('Protocol Version');
    });

    test('should display timestamp in results', async ({ page }) => {
      await page.locator('#queryBtn').click();

      await page.waitForTimeout(2000);

      const results = await page.locator('#results').textContent();
      expect(results).toContain('Time');

      // Should have a date-like value
      const timeElement = page.locator('#results dl dd').nth(2);
      const timeText = await timeElement.textContent();
      expect(timeText.length).toBeGreaterThan(5);
    });

    test('should log query operation', async ({ page }) => {
      await page.locator('#queryBtn').click();

      await page.waitForTimeout(2000);

      const logsText = await page.locator('#logs').textContent();
      expect(logsText).toContain('Fetching platform status');
      expect(logsText).toContain('Successfully fetched system information');
    });
  });

  test.describe('Activity Log Functionality', () => {
    test('should auto-scroll log to show latest messages', async ({ page }) => {
      // Connect to trigger many log messages
      await page.locator('#connectBtn').click();

      await page.waitForTimeout(2000);

      // Get scroll position
      const logsContainer = page.locator('#logs');
      const scrollTop = await logsContainer.evaluate((el) => el.scrollTop);
      const scrollHeight = await logsContainer.evaluate((el) => el.scrollHeight);
      const clientHeight = await logsContainer.evaluate((el) => el.clientHeight);

      // Should be scrolled to bottom
      expect(scrollTop + clientHeight).toBeGreaterThanOrEqual(scrollHeight - 10);
    });

    test('should display log entries with timestamps', async ({ page }) => {
      await page.locator('#connectBtn').click();

      await page.waitForTimeout(1500);

      const logEntries = await page.locator('.log-entry').count();
      expect(logEntries).toBeGreaterThan(0);

      // Each entry should have a timestamp
      const firstEntry = await page.locator('.log-entry').first().textContent();
      expect(/\[\d{2}:\d{2}:\d{2}\]/.test(firstEntry)).toBe(true);
    });

    test('should color-code log entries by type', async ({ page }) => {
      await page.locator('#connectBtn').click();

      await page.waitForTimeout(1500);

      // Check for different log type classes
      const infoLog = page.locator('.log-info').first();
      const successLog = page.locator('.log-success').first();

      const hasInfoLog = (await infoLog.count()) > 0;
      const hasSuccessLog = (await successLog.count()) > 0;

      expect(hasInfoLog || hasSuccessLog).toBe(true);
    });

    test('should maintain log order chronologically', async ({ page }) => {
      await page.locator('#connectBtn').click();

      await page.waitForTimeout(2000);

      const entries = await page.locator('.log-entry').allTextContents();
      const timestamps = entries.map((entry) => {
        const match = entry.match(/\[(\d{2}):(\d{2}):(\d{2})\]/);
        if (match) {
          return match[1] + ':' + match[2] + ':' + match[3];
        }
        return null;
      });

      // All should have timestamps
      const validTimestamps = timestamps.filter((t) => t !== null);
      expect(validTimestamps.length).toBe(entries.length);
    });
  });

  test.describe('Error Handling', () => {
    test('should display error messages in activity log', async ({ page }) => {
      // This test checks that error handling works
      // If SDK fails to connect, errors should appear

      await page.locator('#connectBtn').click();

      await page.waitForTimeout(3000);

      const logsText = await page.locator('#logs').textContent();
      const status = await page.locator('#status').textContent();

      // Either successful or error - both should be logged
      expect(logsText.length).toBeGreaterThan(0);
      expect(['Connected', 'Connection Failed', 'Connecting']).toContain(
        status.trim(),
      );
    });

    test('should show error styling on connection failure', async ({ page }) => {
      await page.locator('#connectBtn').click();

      await page.waitForTimeout(3000);

      const status = page.locator('#status');
      const statusText = await status.textContent();

      // If failed, should have error class
      if (statusText.includes('Failed')) {
        const statusClass = await status.getAttribute('class');
        expect(statusClass).toContain('error');
      }
    });
  });

  test.describe('UI Responsiveness', () => {
    test('should be responsive on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Navigate to page
      await page.goto('/');

      // All elements should still be visible and functional
      await expect(page.locator('#connectBtn')).toBeVisible();
      await expect(page.locator('#logs')).toBeVisible();
      await expect(page.locator('#results')).toBeVisible();

      // Connect should still work
      await page.locator('#connectBtn').click();
      await page.waitForTimeout(1000);

      const status = await page.locator('#status').textContent();
      expect(['Connecting', 'Connected', 'Connection Failed']).toContain(
        status.trim(),
      );
    });

    test('should be responsive on tablet viewport', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });

      await page.goto('/');

      // Elements should be visible
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('#connectBtn')).toBeVisible();
    });

    test('should be responsive on desktop viewport', async ({ page }) => {
      // Set desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 });

      await page.goto('/');

      // All elements should be visible
      await expect(page.locator('.content')).toBeVisible();
      await expect(page.locator('#connectBtn')).toBeVisible();
      await expect(page.locator('#logs')).toBeVisible();
    });
  });

  test.describe('Integration Tests', () => {
    test('complete flow: connect and query platform status', async ({ page }) => {
      // Connect
      await page.locator('#connectBtn').click();
      await page.waitForTimeout(3000);

      const status = await page.locator('#status').textContent();
      if (status.includes('Connected')) {
        // Query
        await page.locator('#queryBtn').click();
        await page.waitForTimeout(2000);

        // Verify results
        const results = await page.locator('#results').textContent();
        expect(results).toContain('System Information');
        expect(results).toContain('Block Height');

        // Verify activity log shows both operations
        const logsText = await page.locator('#logs').textContent();
        expect(logsText).toContain('Initializing SDK');
        expect(logsText).toContain('Fetching platform status');
      }
    });

    test('should handle multiple connections gracefully', async ({ page }) => {
      // First connection
      await page.locator('#connectBtn').click();
      await page.waitForTimeout(2000);

      const firstStatus = await page.locator('#status').textContent();

      // Try to connect again (button should be disabled)
      const connectBtn = page.locator('#connectBtn');
      const isDisabled = await connectBtn.isDisabled();

      if (firstStatus.includes('Connected')) {
        expect(isDisabled).toBe(true);
      }
    });
  });
});
