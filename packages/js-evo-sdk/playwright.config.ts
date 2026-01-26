import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for js-evo-sdk demo applications
 */
export default defineConfig({
  // Test directory
  testDir: './demo/tests/e2e',

  // Run tests in files in parallel
  fullyParallel: false, // Sequential to avoid WASM conflicts

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: 1,

  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: process.env.DEMO_URL || 'http://localhost:8080',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'on-first-retry',

    // Increase timeout for testnet operations
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },

  // Timeout for each test
  timeout: 120000,

  // Expect timeout
  expect: {
    timeout: 10000,
  },

  // Configure projects for major browsers
  projects: [
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
    // Testnet project with longer timeouts
    {
      name: 'testnet',
      use: {
        ...devices['Desktop Chrome'],
        actionTimeout: 60000,
        navigationTimeout: 60000,
      },
      timeout: 300000, // 5 minutes for testnet operations
    },
  ],

  // Run your local dev server before starting the tests
  webServer: process.env.CI ? undefined : {
    command: 'yarn demo:serve',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },

  // Output folders
  outputDir: 'test-results',
});
