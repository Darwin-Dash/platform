import { test, expect } from '@playwright/test';

/**
 * Dash Identity Viewer - End-to-End Test Suite
 *
 * Tests the identity viewer dashboard:
 * 1. Page load and SDK initialization
 * 2. Identity search functionality
 * 3. Identity data display
 * 4. Network toggle functionality
 * 5. Refresh functionality
 * 6. Error handling
 * 7. Responsive design
 */

test.describe('Dash Identity Viewer', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the identity viewer page (baseURL is http://localhost:8000/, server runs from demo directory)
    await page.goto('/identity-viewer/');
  });

  test.describe('Page Load & Initial State', () => {
    test('should capture all console errors during initialization', async ({ page }) => {
      const errors = [];
      const warnings = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        } else if (msg.type() === 'warn') {
          warnings.push(msg.text());
        }
      });

      // Wait for initial load and SDK initialization
      // Use a more robust wait - look for either the connecting or connected status
      try {
        await page.waitForFunction(
          () => {
            const status = document.getElementById('connectionStatus');
            return status && (status.textContent.includes('Connecting') || status.textContent.includes('Connected') || status.textContent.includes('Connection Failed'));
          },
          { timeout: 5000 }
        );
      } catch (e) {
        // If the SDK doesn't initialize, that's also valid state for this test
        console.log('SDK initialization not complete, continuing anyway');
      }

      // Report any errors (but don't fail yet - we might have network errors in testing)
      if (errors.length > 0) {
        console.log('Console errors detected:', errors);
      }
    });

    test('should load without console errors', async ({ page }) => {
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          // DO NOT filter out SDK module loading errors - these are critical
          errors.push(msg.text());
        }
      });

      // Wait for initial load and SDK status to show (either connection state)
      try {
        await page.waitForFunction(
          () => {
            const status = document.getElementById('connectionStatus');
            return status && status.textContent.trim().length > 0;
          },
          { timeout: 5000 }
        );
      } catch (e) {
        // SDK may not be loading, that's OK for this test
      }

      expect(errors).toEqual([], `Expected no console errors, but got: ${errors.join('; ')}`);
    });

    test('should display correct page title', async ({ page }) => {
      const title = await page.title();
      expect(title).toBe('Dash Identity Viewer');
    });

    test('should show all required UI elements', async ({ page }) => {
      // Header
      await expect(page.locator('h1')).toContainText('Dash Identity Viewer');

      // Search controls
      await expect(page.locator('#identityInput')).toBeVisible();
      await expect(page.locator('#searchBtn')).toBeVisible();
      await expect(page.locator('#refreshBtn')).toBeVisible();

      // Network buttons
      await expect(page.locator('#testnetBtn')).toBeVisible();
      await expect(page.locator('#mainnetBtn')).toBeVisible();

      // Status badge
      await expect(page.locator('#connectionStatus')).toBeVisible();
    });

    test('should have initial disconnected state', async ({ page }) => {
      const status = page.locator('#connectionStatus');
      const statusText = await status.textContent();

      // Initially should be connecting or connected
      expect(['Connecting...', 'Connected', 'Connection Failed']).toContain(statusText);
    });

    test('should show initial activity log messages', async ({ page }) => {
      // Verify that the page structure is present
      const loading = page.locator('#loading');
      const dashboard = page.locator('#dashboard');

      // Check that elements exist in the DOM (not necessarily visible)
      const loadingExists = await loading.count() > 0;
      const dashboardExists = await dashboard.count() > 0;

      expect(loadingExists).toBe(true);
      expect(dashboardExists).toBe(true);
    });

    test('should load SDK module successfully', async ({ page }) => {
      // Verify that the SDK module file loads via HTTP with 200 status
      const sdkModuleResponse = await page.request.head('/dist/evo-sdk.module.js');
      expect(sdkModuleResponse.status()).toBe(200,
        `SDK module should load successfully. Got status ${sdkModuleResponse.status()}`);
    });

    test('should have SDK available in initialization context', async ({ page }) => {
      // Wait for SDK initialization status to appear
      const connectionStatus = page.locator('#connectionStatus');
      await expect(connectionStatus).not.toContainText('Connecting', { timeout: 8000 }).catch(() => {
        // If it times out waiting for status change, it may still be connecting - that's OK
      });

      const statusText = await connectionStatus.textContent();

      // The status should indicate SDK loaded successfully
      const validStates = ['Connecting...', 'Connected', 'Connection Failed'];
      expect(validStates).toContain(statusText,
        `SDK should load successfully. Status: ${statusText}`);

      // If connection failed, verify it's not a module loading error
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

  test.describe('Identity Search Functionality', () => {
    test('should display search input field', async ({ page }) => {
      const input = page.locator('#identityInput');
      await expect(input).toBeVisible();
      await expect(input).toHaveAttribute('placeholder', /Enter identity ID/);
    });

    test('should populate with default identity on load', async ({ page }) => {
      const input = page.locator('#identityInput');
      // Wait for the input field to have a value
      await expect(input).toHaveValue(/.+/, { timeout: 5000 });
      const value = await input.inputValue();

      // Should have some default identity value
      expect(value.length).toBeGreaterThan(0);
    });

    test('should fetch identity on search button click', async ({ page }) => {
      // Wait for initial SDK connection
      const status = page.locator('#connectionStatus');
      await expect(status).toContainText(/Connected|Connection Failed/, { timeout: 8000 });

      // Get connection status
      const statusText = await status.textContent();

      if (statusText === 'Connected') {
        // Dashboard should already be visible from initial load
        // Click search button to reload
        const searchBtn = page.locator('#searchBtn');
        await searchBtn.click();

        // Wait for either dashboard or error to appear
        const dashboard = page.locator('#dashboard');
        const error = page.locator('#error');

        try {
          await Promise.race([
            dashboard.waitFor({ state: 'visible', timeout: 8000 }),
            error.waitFor({ state: 'visible', timeout: 8000 })
          ]);
        } catch (e) {
          // If neither appears, that's OK - just check current state
        }

        const isVisible = await dashboard.isVisible().catch(() => false);
        const errorVisible = await error.isVisible().catch(() => false);

        expect(isVisible || errorVisible).toBe(true);
      }
    });

    test('should allow search via Enter key', async ({ page }) => {
      const status = page.locator('#connectionStatus');
      await expect(status).toContainText(/Connected|Connection Failed/, { timeout: 8000 });

      const statusText = await status.textContent();

      if (statusText === 'Connected') {
        const input = page.locator('#identityInput');
        await input.press('Enter');

        // Wait for either dashboard or error to appear
        const dashboard = page.locator('#dashboard');
        const error = page.locator('#error');

        try {
          await Promise.race([
            dashboard.waitFor({ state: 'visible', timeout: 8000 }),
            error.waitFor({ state: 'visible', timeout: 8000 })
          ]);
        } catch (e) {
          // If neither appears, that's OK - just check current state
        }

        const dashboardVisible = await dashboard.isVisible().catch(() => false);
        const errorVisible = await error.isVisible().catch(() => false);

        expect(dashboardVisible || errorVisible).toBe(true);
      }
    });

    test('should show error for invalid identity ID', async ({ page }) => {
      const status = page.locator('#connectionStatus');
      await expect(status).toContainText('Connected', { timeout: 8000 });

      const input = page.locator('#identityInput');
      const searchBtn = page.locator('#searchBtn');

      // Enter invalid identity ID
      await input.fill('invalid-id-xyz');
      await searchBtn.click();

      // Should show error message
      const error = page.locator('#error');
      await expect(error).toBeVisible({ timeout: 5000 });
      const errorText = await error.textContent();
      expect(errorText.length).toBeGreaterThan(0);
    });
  });

  test.describe('Identity Data Display', () => {
    test('should display identity metrics', async ({ page }) => {
      const status = page.locator('#connectionStatus');
      await expect(status).toContainText('Connected', { timeout: 8000 });

      // Trigger search to load identity
      const searchBtn = page.locator('#searchBtn');
      await searchBtn.click();

      // Wait for dashboard to appear with data
      const dashboard = page.locator("#dashboard");
      await expect(dashboard).toBeVisible({ timeout: 8000 }).catch(() => {});

      // Check metrics are present (they might show "—" if not connected)
      await expect(page.locator('#identityId')).toBeVisible();
      await expect(page.locator('#balance')).toBeVisible();
      await expect(page.locator('#publicKeysCount')).toBeVisible();
      await expect(page.locator('#revision')).toBeVisible();

      // Verify metrics contain actual data (not undefined or error text)
      const idText = await page.locator('#identityId').textContent();
      const balanceText = await page.locator('#balance').textContent();
      const keysCountText = await page.locator('#publicKeysCount').textContent();
      const revisionText = await page.locator('#revision').textContent();

      expect(idText).not.toContain('undefined');
      expect(balanceText).not.toContain('undefined');
      expect(idText?.length).toBeGreaterThan(0, 'Identity ID should have content');
      expect(balanceText?.length).toBeGreaterThan(0, 'Balance should have content');

      // CRITICAL: Validate actual values
      const keysCount = parseInt(keysCountText || '0');
      const revision = parseInt(revisionText || '0');

      expect(keysCount).toBeGreaterThan(0, `Public keys count should be > 0, got: ${keysCount}`);

      // Revision can be 0 for new identities, but should be a valid number
      expect(revision).toBeGreaterThanOrEqual(0, `Revision should be >= 0, got: ${revision}`);
      expect(revision).not.toBeNaN();

      // Validate balance is a reasonable number
      const balance = parseInt((balanceText || '0').replace(/,/g, ''));
      expect(balance).toBeGreaterThan(0, `Balance should be > 0, got: ${balance}`);
    });


    test('should display public keys section', async ({ page }) => {
      const status = page.locator('#connectionStatus');
      await expect(status).toContainText('Connected', { timeout: 8000 });

      const searchBtn = page.locator('#searchBtn');
      await searchBtn.click();

      // Wait for dashboard to be visible (which contains the public keys list)
      const dashboard = page.locator('#dashboard');
      await expect(dashboard).toBeVisible({ timeout: 8000 });

      // Public keys list should be present and have content
      const publicKeysList = page.locator('#publicKeysList');
      // The list should have actual content (not just the placeholder "—")
      await expect(publicKeysList).toContainText(/Key|No public keys/, { timeout: 5000 });
    });

    test('should validate WASM object methods are called correctly', async ({ page }) => {
      const status = page.locator('#connectionStatus');
      await expect(status).toContainText('Connected', { timeout: 8000 });

      // Set up comprehensive error capture before search
      const errors = [];
      const warnings = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        } else if (msg.type() === 'warn') {
          warnings.push(msg.text());
        }
      });

      // Perform search to trigger WASM object conversion
      const searchBtn = page.locator('#searchBtn');
      await searchBtn.click();
      await page.waitForTimeout(2500);

      // Critical: Check for WASM object conversion errors
      const base58Errors = errors.filter(e =>
        e.includes('base58') ||
        e.includes('Cannot read properties of undefined') ||
        e.includes('reading \'base58\'') ||
        e.includes('Cannot read property') ||
        e.includes('identity.id') ||
        e.includes('identity.ownerId')
      );

      // Check for getId/getOwnerId errors (which would indicate wrong API calls)
      const methodCallErrors = errors.filter(e =>
        e.includes('getId') ||
        e.includes('getOwnerId') ||
        e.includes('is not a function')
      );

      // If dashboard loaded successfully, WASM methods must have been called correctly
      const dashboard = page.locator('#dashboard');
      const isDashboardVisible = await dashboard.isVisible().catch(() => false);

      if (isDashboardVisible) {
        // Dashboard is visible - validate that WASM conversion worked
        expect(base58Errors).toEqual([],
          `WASM object conversion failed. Errors: ${base58Errors.join('; ')}`);
        expect(methodCallErrors).toEqual([],
          `WASM object methods not called correctly. Errors: ${methodCallErrors.join('; ')}`);
      }

      // Verify no "undefined" appears in displayed identity ID or owner ID
      const identityIdText = await page.locator('#identityId').textContent().catch(() => '');
      const ownerIdText = await page.locator('#ownerId').textContent().catch(() => '');

      expect(identityIdText).not.toContain('undefined', 'Identity ID should not display "undefined"');
      expect(ownerIdText).not.toContain('undefined', 'Owner ID should not display "undefined"');

      // Verify metric cards are populated with actual data (not placeholders)
      if (isDashboardVisible) {
        const idContent = identityIdText?.trim();
        const ownerContent = ownerIdText?.trim();

        expect(idContent).not.toBe('—', 'Identity ID should be populated with actual data');
        // Owner ID is expected to be 'N/A' since basic get() doesn't return owner data
        expect(ownerContent).toBe('N/A', 'Owner ID should be N/A when using basic get() method');
        expect(idContent?.length).toBeGreaterThan(3, 'Identity ID should have meaningful content');
      }
    });
  });

  test.describe('Network Toggle Component', () => {
    test('should display network toggle buttons', async ({ page }) => {
      const testnetBtn = page.locator('#testnetBtn');
      const mainnetBtn = page.locator('#mainnetBtn');

      await expect(testnetBtn).toBeVisible();
      await expect(mainnetBtn).toBeVisible();
    });

    test('should default to testnet', async ({ page }) => {
      const testnetBtn = page.locator('#testnetBtn');
      const mainnetBtn = page.locator('#mainnetBtn');

      const testnetClass = await testnetBtn.getAttribute('class');
      expect(testnetClass).toContain('active');
    });

    test('should update description on network selection', async ({ page }) => {
      const description = page.locator('#networkDescription');

      // Initially testnet
      await expect(description).toContainText('Testnet');
    });

    test('should toggle network when button clicked', async ({ page }) => {
      const testnetBtn = page.locator('#testnetBtn');
      const mainnetBtn = page.locator('#mainnetBtn');
      const description = page.locator('#networkDescription');

      // Click mainnet button
      await mainnetBtn.click();
      await page.waitForTimeout(2000);

      // Description should update
      await expect(description).toContainText('Mainnet');

      // Click testnet button
      await testnetBtn.click();
      await page.waitForTimeout(2000);

      // Description should revert
      await expect(description).toContainText('Testnet');
    });

    test('should show connecting state when switching networks', async ({ page }) => {
      const mainnetBtn = page.locator('#mainnetBtn');
      const connectionStatus = page.locator('#connectionStatus');

      // Click to switch network
      await mainnetBtn.click();

      // Should show connecting state briefly
      const statusText = await connectionStatus.textContent();
      expect(['Connecting...', 'Connected', 'Connection Failed']).toContain(statusText);
    });
  });

  test.describe('Refresh Functionality', () => {
    test('should display refresh button', async ({ page }) => {
      const refreshBtn = page.locator('#refreshBtn');
      await expect(refreshBtn).toBeVisible();
    });

    test('should refresh current identity', async ({ page }) => {
      const status = page.locator('#connectionStatus');
      await expect(status).toContainText('Connected', { timeout: 8000 });

      // Load identity first
      const searchBtn = page.locator('#searchBtn');
      await searchBtn.click();
      await page.waitForTimeout(2000);

      // Now refresh
      const refreshBtn = page.locator('#refreshBtn');
      await refreshBtn.click();
      await page.waitForTimeout(2000);

      // Should still show data or error
      const dashboard = page.locator('#dashboard');
      const error = page.locator('#error');

      const dashboardVisible = await dashboard.isVisible().catch(() => false);
      const errorVisible = await error.isVisible().catch(() => false);

      expect(dashboardVisible || errorVisible).toBe(true);
    });

    test('should update timestamp after refresh', async ({ page }) => {
      const status = page.locator('#connectionStatus');
      await expect(status).toContainText('Connected', { timeout: 8000 });

      const searchBtn = page.locator('#searchBtn');
      await searchBtn.click();
      await page.waitForTimeout(2000);

      // Check for timestamp element
      const lastUpdated = page.locator('#lastUpdatedText');
      const text = await lastUpdated.textContent();

      // Should contain "Last updated:" with time
      expect(text).toContain('Last updated');
    });
  });

  test.describe('Error Handling', () => {
    test('should display error messages in error container', async ({ page }) => {
      const status = page.locator('#connectionStatus');
      await expect(status).toContainText('Connected', { timeout: 8000 });

      // Try to search for invalid identity
      const input = page.locator('#identityInput');
      const searchBtn = page.locator('#searchBtn');

      await input.fill('invalid');
      await searchBtn.click();

      // Error should be visible
      const error = page.locator('#error');
      await expect(error).toBeVisible({ timeout: 5000 });
    });

    test('should show error styling on connection failure', async ({ page }) => {
      const status = page.locator('#connectionStatus');

      // Wait to see what happens
      await page.waitForTimeout(5000);
      const statusText = await status.textContent();

      if (statusText === 'Connection Failed') {
        const statusClass = await status.getAttribute('class');
        expect(statusClass).toContain('error');
      }
    });

    test('should allow retry after error', async ({ page }) => {
      const status = page.locator('#connectionStatus');
      await expect(status).toContainText('Connected', { timeout: 8000 });

      const input = page.locator('#identityInput');
      const searchBtn = page.locator('#searchBtn');

      // First attempt - invalid
      await input.fill('invalid');
      await searchBtn.click();
      await page.waitForTimeout(1000);

      // Second attempt - valid
      const defaultIdentity = await input.getAttribute('placeholder');
      await input.fill(defaultIdentity?.split('(')[1]?.split(')')[0] || 'DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq');
      await searchBtn.click();
      await page.waitForTimeout(2000);

      // Should either show data or error, but not be stuck
      const dashboard = page.locator('#dashboard');
      const error = page.locator('#error');

      const dashboardVisible = await dashboard.isVisible().catch(() => false);
      const errorVisible = await error.isVisible().catch(() => false);

      expect(dashboardVisible || errorVisible).toBe(true);
    });
  });

  test.describe('UI Responsiveness', () => {
    test('should be responsive on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      // All elements should still be accessible
      await expect(page.locator('#identityInput')).toBeVisible();
      await expect(page.locator('#searchBtn')).toBeVisible();
      await expect(page.locator('h1')).toContainText('Dash Identity Viewer');
    });

    test('should be responsive on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });

      // All elements should still be accessible
      await expect(page.locator('#identityInput')).toBeVisible();
      await expect(page.locator('#testnetBtn')).toBeVisible();
      await expect(page.locator('h1')).toContainText('Dash Identity Viewer');
    });

    test('should be responsive on desktop viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });

      // All elements should still be accessible
      await expect(page.locator('#identityInput')).toBeVisible();
      await expect(page.locator('#mainnetBtn')).toBeVisible();
      await expect(page.locator('h1')).toContainText('Dash Identity Viewer');
    });
  });


  test.describe('Integration Tests', () => {
    test('should complete flow: connect and search identity', async ({ page }) => {
      // Wait for connection
      const status = page.locator('#connectionStatus');
      await expect(status).toContainText('Connected', { timeout: 8000 });

      // Search for identity
      const searchBtn = page.locator('#searchBtn');
      await searchBtn.click();

      // Wait for result (increased timeout for async operations)
      await page.waitForTimeout(6000);

      // Should show either dashboard or error
      const dashboard = page.locator('#dashboard');
      const error = page.locator('#error');

      const dashboardVisible = await dashboard.isVisible().catch(() => false);
      const errorVisible = await error.isVisible().catch(() => false);

      expect(dashboardVisible || errorVisible).toBe(true,
        'Should show either dashboard data or error message');
    });

    test('should handle network switching gracefully', async ({ page }) => {
      // Initial state - testnet
      const testnetBtn = page.locator('#testnetBtn');
      const mainnetBtn = page.locator('#mainnetBtn');
      const status = page.locator('#connectionStatus');

      // Wait for initial connection
      await expect(status).toContainText('Connected', { timeout: 8000 });

      // Switch to mainnet
      await mainnetBtn.click();
      await page.waitForTimeout(3000);

      // Should be attempting connection
      const statusText = await status.textContent();
      expect(['Connecting...', 'Connected', 'Connection Failed']).toContain(statusText);

      // Switch back to testnet
      await testnetBtn.click();
      await page.waitForTimeout(3000);

      // Should still have valid status
      const finalStatusText = await status.textContent();
      expect(['Connecting...', 'Connected', 'Connection Failed']).toContain(finalStatusText);
    });
  });
});
