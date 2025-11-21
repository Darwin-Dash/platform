/**
 * WASM Concurrency Diagnostic Test Suite
 *
 * Orchestrates execution of all diagnostic tests to identify viable solutions
 * for the "already locked to a reader" WASM SDK constraint.
 *
 * Usage:
 * node tests/integration/wasm-concurrency-diagnostics/index.mjs [category]
 *
 * Categories: core | variants | solutions | integration | all (default)
 */

import { EvoSDK } from '../../../dist/sdk.js';
import { WasmConcurrencyDiagnosticRunner } from './test-framework.mjs';
import { getTestScenariosByCategory, getAllTestScenarios } from './scenarios.mjs';
import { createLogger } from '../../../dist/identities/utils/identity-logger.js';

const logger = createLogger('WasmDiagnosticSuite');

/**
 * Main diagnostic test runner
 */
async function runDiagnosticSuite(category = 'all') {
  logger.info('Starting WASM Concurrency Diagnostic Test Suite');
  logger.info(`Category: ${category}`);

  // Initialize SDK for tests
  const sdk = EvoSDK.testnetTrusted();
  await sdk.connect();

  // Initialize diagnostic runner
  const runner = new WasmConcurrencyDiagnosticRunner('./test-results/wasm-diagnostics');

  // Get test scenarios
  const scenarios =
    category === 'all' ? getAllTestScenarios() : getTestScenariosByCategory(category);

  logger.info(`Found ${scenarios.length} test scenarios to execute`);

  let completedTests = 0;
  let successfulTests = 0;
  let failedTests = 0;

  // Execute each scenario
  for (const scenario of scenarios) {
    try {
      logger.info(`[${completedTests + 1}/${scenarios.length}] Running: ${scenario.name}`);

      const result = await runner.runTestCase(scenario, sdk);

      if (result.summary.success) {
        successfulTests++;
        logger.info(`  ✅ PASS - No locks detected`);
      } else {
        failedTests++;
        logger.warn(`  ❌ FAIL - Locks detected: ${result.summary.locksDetected}`);
      }

      completedTests++;
    } catch (error) {
      failedTests++;
      completedTests++;
      logger.error(`  ❌ ERROR - ${error.message}`);
    }
  }

  // Export results
  await runner.getResultLogger().exportToCsv();

  // Print summary
  logger.info('\n' + '='.repeat(60));
  logger.info('DIAGNOSTIC TEST SUITE COMPLETE');
  logger.info('='.repeat(60));
  logger.info(`Total tests: ${completedTests}`);
  logger.info(`Successful (no locks): ${successfulTests}`);
  logger.info(`Failed (locks detected): ${failedTests}`);
  logger.info(`Success rate: ${((successfulTests / completedTests) * 100).toFixed(1)}%`);
  logger.info('='.repeat(60));
  logger.info('\nNEXT STEPS:');
  logger.info('1. Review results.json to identify patterns');
  logger.info('2. Check which scenarios avoid locks');
  logger.info('3. Implement solutions based on viable patterns');
  logger.info('4. Run solution tests to validate effectiveness');
  logger.info('='.repeat(60));

  await sdk.disconnect();
}

// Parse command line argument for category
const category = process.argv[2] || 'all';

// Run the diagnostic suite
runDiagnosticSuite(category).catch(error => {
  console.error('Fatal error running diagnostic suite:', error);
  process.exit(1);
});
