/**
 * WASM Concurrency Diagnostic Test Suite
 *
 * Orchestrates execution of all diagnostic tests to identify viable solutions
 * for the "already locked to a reader" WASM SDK constraint.
 *
 * Usage:
 * npx ts-node tests/integration/wasm-concurrency-diagnostics/index.ts [category]
 *
 * Categories: core | variants | solutions | integration | all (default)
 */

import { EvoSDK } from '../../src/sdk.js';
import { WasmConcurrencyDiagnosticRunner } from './test-framework.js';
import { getTestScenariosByCategory, getAllTestScenarios } from './scenarios.js';
import { createLogger } from '../../src/identities/utils/identity-logger.js';

const logger = createLogger('WasmDiagnosticSuite');

/**
 * Main diagnostic test runner
 *
 * FIXED: Creates a fresh SDK instance for each test scenario to prevent
 * cascading failures from shared WASM state pollution.
 */
async function runDiagnosticSuite(category: 'core' | 'variants' | 'solutions' | 'integration' | 'all' = 'all'): Promise<void> {
  logger.info('Starting WASM Concurrency Diagnostic Test Suite');
  logger.info(`Category: ${category}`);
  logger.info('Note: Each test runs with isolated SDK instance to prevent state pollution');

  // Initialize diagnostic runner (shared, just logs results)
  const runner = new WasmConcurrencyDiagnosticRunner('./test-results/wasm-diagnostics');

  // Get test scenarios
  const scenarios =
    category === 'all' ? getAllTestScenarios() : getTestScenariosByCategory(category as any);

  logger.info(`Found ${scenarios.length} test scenarios to execute`);

  let completedTests = 0;
  let successfulTests = 0;
  let failedTests = 0;

  // Execute each scenario with isolated SDK
  for (const scenario of scenarios) {
    try {
      logger.info(`[${completedTests + 1}/${scenarios.length}] Running: ${scenario.name}`);

      // CREATE FRESH SDK FOR EACH TEST (this is the fix!)
      const sdk = EvoSDK.testnetTrusted();
      await sdk.connect();

      const result = await runner.runTestCase(scenario, sdk);

      // Cleanup SDK after test
      try {
        await sdk.resetWasmSdk();
      } catch (e) {
        logger.debug(`SDK cleanup error (non-fatal): ${e}`);
      }

      completedTests++;
      if (!result.lockError) {
        successfulTests++;
        logger.info(`✓ PASSED: ${scenario.name}`);
      } else {
        failedTests++;
        logger.info(`✗ FAILED: ${scenario.name} (lock at operation ${result.firstLockAtOperation})`);
      }
    } catch (error) {
      completedTests++;
      failedTests++;
      logger.error(`✗ ERROR: ${scenario.name}`, error);
    }

    // Increased delay between tests to let WASM fully release (was 1s, now 3s)
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Export results to CSV
  logger.info('Exporting results to CSV...');
  try {
    await runner.getResultLogger().exportToCsv();
    logger.info('✓ Results exported to CSV');
  } catch (error) {
    logger.error('Failed to export results:', error);
  }

  // Log summary
  logger.info('');
  logger.info('=== DIAGNOSTIC SUMMARY ===');
  logger.info(`Total Tests: ${completedTests}`);
  logger.info(`Successful (No Locks): ${successfulTests}`);
  logger.info(`Failed (With Locks): ${failedTests}`);
  logger.info(`Success Rate: ${((successfulTests / completedTests) * 100).toFixed(1)}%`);
  logger.info('');
  logger.info('Results saved to: ./test-results/wasm-diagnostics/');
  logger.info('- results.json: Full detailed results');
  logger.info('- summary.json: Aggregate statistics');
  logger.info('- results.csv: CSV export for analysis');
  logger.info('');
  logger.info('NEXT STEPS:');
  logger.info('1. Review results.json to identify which scenarios pass');
  logger.info('2. Identify viable patterns (sequential, fresh-per-op, etc.)');
  logger.info('3. For failing patterns, investigate if issue is WASM SDK or test');
  logger.info('4. Implement solutions based on patterns that passed');
}

// Parse command line arguments
const category = (process.argv[2] || 'core') as any;

if (!['core', 'variants', 'solutions', 'integration', 'all'].includes(category)) {
  logger.error(`Invalid category: ${category}`);
  logger.info('Valid categories: core, variants, solutions, integration, all');
  process.exit(1);
}

// Run the diagnostic suite
runDiagnosticSuite(category).then(() => {
  logger.info('Diagnostic suite complete');
  process.exit(0);
}).catch((error) => {
  logger.error('Diagnostic suite failed:', error);
  process.exit(1);
});
