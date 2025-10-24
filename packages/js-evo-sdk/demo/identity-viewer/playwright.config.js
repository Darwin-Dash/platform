import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Dash Identity Viewer E2E tests
 *
 * OPTIMIZED FOR LOCAL DEVELOPMENT:
 * - Quick mode (default): 1 browser (chromium), serial execution
 * - Full mode (CI or FULL_TEST=1): All browsers, parallel execution
 *
 * Usage:
 * - Quick: npm test (runs only chromium, fast debugging)
 * - Full: FULL_TEST=1 npm test (runs all browsers for pre-commit checks)
 *
 * Server: Started from demo directory at http://localhost:8000/
 * Base URL: http://localhost:8000/
 */

const FULL_TEST_MODE = process.env.FULL_TEST === '1' || process.env.CI;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',

  /* Run tests in files in parallel - only in full mode */
  fullyParallel: FULL_TEST_MODE,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Serial execution for local dev (1 worker), parallel for CI/full mode */
  workers: FULL_TEST_MODE ? undefined : 1,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:8000/',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: FULL_TEST_MODE ? [
    // Full test mode: All browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ] : [
    // Quick test mode: Chromium only for fast local debugging
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'cd .. && python3 -m http.server 8000',
    url: 'http://localhost:8000/identity-viewer/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
});
