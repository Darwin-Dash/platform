// Load environment variables first, before any imports
import 'dotenv/config';
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
  // Run specific projects with --project flag:
  //   yarn playwright test --project=firefox
  //   yarn playwright test --project=testnet
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
    // Testnet project with longer timeouts for real network tests (read-only tests)
    {
      name: 'testnet',
      testDir: './demo/tests/e2e/real-network',
      testIgnore: '**/write-*.spec.js', // Skip write tests that need funded wallet
      use: {
        ...devices['Desktop Chrome'],
        actionTimeout: 120000,
        navigationTimeout: 120000,
      },
      timeout: 300000, // 5 minutes for testnet operations
    },
    // Testnet-funded project for write operations requiring pre-funded wallet
    // Uses MNEMONIC env var for wallet with funds
    {
      name: 'testnet-funded',
      testDir: './demo/tests/e2e/real-network',
      testMatch: '**/write-*.spec.js', // Only run write tests
      use: {
        ...devices['Desktop Chrome'],
        actionTimeout: 180000, // 3 minutes for UTXO discovery
        navigationTimeout: 180000,
      },
      timeout: 600000, // 10 minutes for full create/topup operations
      retries: 1, // Retry once on failure (testnet can be flaky)
    },
  ],

  // Run your local dev server before starting the tests
  webServer: process.env.CI ? undefined : {
    command: 'yarn demo:web:dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },

  // Output folders
  outputDir: 'test-results',
});
