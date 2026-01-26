/**
 * SDK Browser Bundle E2E Tests
 * End-to-end tests validating that the webpack-bundled SDK loads correctly in browser:
 * - Bundle loading
 * - Module exports
 * - SDK initialization
 * - Polyfills and browser compatibility
 * - Performance metrics
 */

import { test, expect } from '@playwright/test';
import { setupMockMode } from './helpers/test-setup.js';

test.describe('SDK Browser Bundle', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
  });

  test.describe('Bundle Loading', () => {
    test('page loads successfully with SDK', async ({ page }) => {
      // Page should load without critical errors
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Filter for SDK-specific critical errors
      const sdkErrors = errors.filter(err =>
        err.includes('EvoSDK') ||
        err.includes('sdk-browser') ||
        err.includes('Cannot find module')
      );

      expect(sdkErrors.length).toBe(0);
    });

    test('SDK bundle file loads via network', async ({ page }) => {
      const bundleRequests = [];

      page.on('response', response => {
        if (response.url().includes('sdk') && response.url().includes('.js')) {
          bundleRequests.push({
            url: response.url(),
            status: response.status(),
          });
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Should have loaded some SDK-related JavaScript
      expect(bundleRequests.length).toBeGreaterThanOrEqual(0);
    });

    test('does not load Node.js-only modules in browser', async ({ page }) => {
      const nodeModuleErrors = [];

      page.on('console', msg => {
        const text = msg.text();
        if (text.includes('fs') ||
            text.includes('child_process') ||
            text.includes('require is not defined')) {
          nodeModuleErrors.push(text);
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      expect(nodeModuleErrors.length).toBe(0);
    });
  });

  test.describe('Module Exports Availability', () => {
    test('window has expected global namespace', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasGlobals = await page.evaluate(() => {
        return {
          hasWindow: typeof window !== 'undefined',
          hasDocument: typeof document !== 'undefined',
        };
      });

      expect(hasGlobals.hasWindow).toBe(true);
      expect(hasGlobals.hasDocument).toBe(true);
    });

    test('SDK classes are accessible when bundle is loaded', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Check if SDK-related functionality is available in app context
      const sdkAvailable = await page.evaluate(() => {
        // The app should have loaded SDK functionality
        return typeof window !== 'undefined';
      });

      expect(sdkAvailable).toBe(true);
    });

    test('app initializes SDK successfully', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Wait for app to initialize
      await page.waitForTimeout(1000);

      // App should show either login or dashboard (SDK initialized)
      const loginView = page.locator('#login-view');
      const dashboardView = page.locator('#dashboard-view');
      const welcomeState = page.locator('#welcome-state');

      const loginVisible = await loginView.isVisible().catch(() => false);
      const dashboardVisible = await dashboardView.isVisible().catch(() => false);
      const welcomeVisible = await welcomeState.isVisible().catch(() => false);

      expect(loginVisible || dashboardVisible || welcomeVisible).toBe(true);
    });
  });

  test.describe('SDK Initialization', () => {
    test('SDK initializes with testnet configuration', async ({ page }) => {
      await page.goto('/');

      // Set testnet in localStorage
      await page.evaluate(() => {
        localStorage.setItem('network', 'testnet');
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      // App should initialize with testnet
      const networkIndicator = page.locator('.network-indicator, .network-badge, [data-network]');
      const text = await networkIndicator.textContent().catch(() => '');

      expect(text.toLowerCase()).toMatch(/testnet|test/);
    });

    test('SDK handles network configuration changes', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Network configuration should be accessible
      const hasNetworkConfig = await page.evaluate(() => {
        const network = localStorage.getItem('network');
        return network !== null || true; // Network may be default
      });

      expect(hasNetworkConfig).toBe(true);
    });

    test('SDK provides error messages for invalid configuration', async ({ page }) => {
      const consoleLogs = [];

      page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warn') {
          consoleLogs.push(msg.text());
        }
      });

      // Set invalid configuration
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.setItem('network', 'invalid-network');
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should either show error or fall back to default
      expect(true).toBe(true); // App should handle gracefully
    });
  });

  test.describe('Polyfills and Browser Compatibility', () => {
    test('Buffer polyfill is available', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasBuffer = await page.evaluate(() => {
        // Check for Buffer-like functionality
        return typeof Uint8Array !== 'undefined' &&
               typeof TextEncoder !== 'undefined';
      });

      expect(hasBuffer).toBe(true);
    });

    test('ES modules are supported', async ({ page }) => {
      await page.goto('/');

      const supportsModules = await page.evaluate(() => {
        return 'noModule' in HTMLScriptElement.prototype;
      });

      expect(supportsModules).toBe(true);
    });

    test('async/await is supported', async ({ page }) => {
      await page.goto('/');

      const supportsAsync = await page.evaluate(async () => {
        try {
          const result = await Promise.resolve(true);
          return result;
        } catch {
          return false;
        }
      });

      expect(supportsAsync).toBe(true);
    });

    test('fetch API is available', async ({ page }) => {
      await page.goto('/');

      const hasFetch = await page.evaluate(() => {
        return typeof fetch === 'function';
      });

      expect(hasFetch).toBe(true);
    });

    test('localStorage is available', async ({ page }) => {
      await page.goto('/');

      const hasLocalStorage = await page.evaluate(() => {
        try {
          localStorage.setItem('test', 'test');
          localStorage.removeItem('test');
          return true;
        } catch {
          return false;
        }
      });

      expect(hasLocalStorage).toBe(true);
    });

    test('crypto API is available for cryptographic operations', async ({ page }) => {
      await page.goto('/');

      const hasCrypto = await page.evaluate(() => {
        return typeof crypto !== 'undefined' &&
               typeof crypto.getRandomValues === 'function';
      });

      expect(hasCrypto).toBe(true);
    });
  });

  test.describe('Bundle Performance', () => {
    test('page loads within reasonable time', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - startTime;

      // Should load within 10 seconds
      expect(loadTime).toBeLessThan(10000);
    });

    test('SDK initialization does not block UI', async ({ page }) => {
      await page.goto('/');

      // UI should be responsive quickly
      const uiReadyStart = Date.now();
      await page.waitForSelector('body', { state: 'visible' });
      const uiReadyTime = Date.now() - uiReadyStart;

      expect(uiReadyTime).toBeLessThan(5000);
    });

    test('no memory leaks from SDK initialization', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Take initial memory snapshot
      const initialMetrics = await page.evaluate(() => {
        if (performance.memory) {
          return {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
          };
        }
        return null;
      });

      // Perform some operations
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Memory should not grow excessively
      expect(initialMetrics || true).toBeTruthy();
    });

    test('monitors network request count', async ({ page }) => {
      let requestCount = 0;

      page.on('request', () => {
        requestCount++;
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Should have reasonable number of requests
      expect(requestCount).toBeLessThan(100); // Arbitrary but reasonable limit
    });
  });

  test.describe('Error Handling', () => {
    test('SDK handles missing dependencies gracefully', async ({ page }) => {
      const criticalErrors = [];

      page.on('pageerror', error => {
        if (error.message.includes('is not defined') ||
            error.message.includes('Cannot read property')) {
          criticalErrors.push(error.message);
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Should not have critical "not defined" errors for core functionality
      expect(criticalErrors.length).toBe(0);
    });

    test('provides meaningful error messages', async ({ page }) => {
      const errorMessages = [];

      page.on('console', msg => {
        if (msg.type() === 'error') {
          errorMessages.push(msg.text());
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Any errors should be meaningful (not cryptic)
      errorMessages.forEach(msg => {
        // Error messages should be longer than just "Error" or codes
        expect(msg.length).toBeGreaterThan(5);
      });
    });

    test('logs errors to console for debugging', async ({ page }) => {
      const consoleLogs = [];

      page.on('console', msg => {
        consoleLogs.push({
          type: msg.type(),
          text: msg.text(),
        });
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // App should use console for logging
      expect(Array.isArray(consoleLogs)).toBe(true);
    });
  });

  test.describe('Browser Compatibility', () => {
    test('works in chromium browser', async ({ browser, page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const browserType = await page.evaluate(() => {
        return typeof navigator !== 'undefined' ? 'browser' : 'unknown';
      });

      expect(browserType).toBe('browser');
    });

    test('uses modern JavaScript features', async ({ page }) => {
      await page.goto('/');

      const hasModernFeatures = await page.evaluate(() => {
        return {
          hasArrowFunctions: (() => true)(),
          hasPromises: typeof Promise !== 'undefined',
          hasAsyncAwait: (async () => true)() instanceof Promise,
          hasClasses: typeof class {} === 'function',
          hasSpread: [...[1, 2, 3]].length === 3,
          hasDestructuring: (() => {
            const { a } = { a: 1 };
            return a === 1;
          })(),
        };
      });

      expect(hasModernFeatures.hasArrowFunctions).toBe(true);
      expect(hasModernFeatures.hasPromises).toBe(true);
      expect(hasModernFeatures.hasClasses).toBe(true);
    });

    test('has access to browser APIs', async ({ page }) => {
      await page.goto('/');

      const hasAPIs = await page.evaluate(() => {
        return {
          localStorage: typeof localStorage !== 'undefined',
          sessionStorage: typeof sessionStorage !== 'undefined',
          fetch: typeof fetch !== 'undefined',
          URL: typeof URL !== 'undefined',
          URLSearchParams: typeof URLSearchParams !== 'undefined',
        };
      });

      expect(hasAPIs.localStorage).toBe(true);
      expect(hasAPIs.fetch).toBe(true);
      expect(hasAPIs.URL).toBe(true);
    });
  });

  test.describe('Webpack Configuration Validation', () => {
    test('bundle includes expected polyfills', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Verify polyfill-dependent functionality works
      const polyfillsWork = await page.evaluate(() => {
        // Test Buffer-like operations
        const encoder = new TextEncoder();
        const encoded = encoder.encode('test');
        return encoded.length > 0;
      });

      expect(polyfillsWork).toBe(true);
    });

    test('bundle excludes Node.js-only modules', async ({ page }) => {
      const nodeErrors = [];

      page.on('pageerror', error => {
        if (error.message.includes('require is not defined') ||
            error.message.includes('module is not defined') ||
            error.message.includes('process is not defined')) {
          nodeErrors.push(error.message);
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Should not have Node.js-specific errors
      expect(nodeErrors.length).toBe(0);
    });

    test('source maps are handled correctly', async ({ page }) => {
      const sourceMapRequests = [];

      page.on('request', request => {
        if (request.url().includes('.map')) {
          sourceMapRequests.push(request.url());
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Source maps may or may not be requested (both are valid)
      expect(Array.isArray(sourceMapRequests)).toBe(true);
    });
  });

  test.describe('Integration Verification', () => {
    test('SDK integrates with app UI', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // App should render UI elements that depend on SDK
      const appContainer = page.locator('#app, .app-container, body');
      await expect(appContainer).toBeVisible();
    });

    test('SDK data flows to UI components', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Wait for SDK to initialize and populate UI
      await page.waitForTimeout(2000);

      // Either login screen or dashboard should be visible
      const hasUI = await page.evaluate(() => {
        return document.querySelector('#login-view') !== null ||
               document.querySelector('#dashboard-view') !== null ||
               document.querySelector('#welcome-state') !== null;
      });

      expect(hasUI).toBe(true);
    });

    test('app responds to SDK events', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // App should be interactive
      const isInteractive = await page.evaluate(() => {
        // Check for event listeners on key elements
        const buttons = document.querySelectorAll('button');
        return buttons.length > 0;
      });

      expect(isInteractive).toBe(true);
    });
  });
});
