/**
 * Global setup for Playwright E2E tests
 * Handles authentication and initial state
 */

export default async function globalSetup(config) {
  // No global setup needed for now
  // Each test manages its own state via localStorage
  console.log('Playwright global setup complete');
}
