/**
 * WASM Concurrency Diagnostic Test Suite
 *
 * Orchestrates execution of all diagnostic tests to identify viable solutions
 * for the "already locked to a reader" WASM SDK constraint.
 *
 * Usage:
 *   npx ts-node tests/integration/wasm-concurrency-diagnostics/index.ts [category]
 *
 * Categories: core | variants | solutions | integration | all (default)
 */

import { EvoSDK } from '../../../src/sdk.js';
import { WasmConcurrencyDiagnosticRunner } from './test-framework.js';
import { getTestScenariosByCategory, getAllTestScenarios } from './scenarios.js';

/**
 * Main diagnostic test runner
 */
async function runDiagnosticSuite(category: string = 'all'): Promise<void> {
  console.log('Starting WASM Concurrency Diagnostic Test Suite');
  console.log(`Category: ${category}`);

  // Initialize SDK for tests
  const sdk = EvoSDK.testnetTrusted();
  await sdk.connect();

  // Initialize diagnostic runner
  const runner = new WasmConcurrencyDiagnosticRunner('./test-results/wasm-diagnostics');

  // Get test scenarios
  const scenarios =
    category === 'all'
      ? getAllTestScenarios()
      : getTestScenariosByCategory(category as 'core' | 'variants' | 'solutions' | 'integration');

  console.log(`Found ${scenarios.length} test scenarios to execute`);

  let completedTests = 0;
  let successfulTests = 0;
  let failedTests = 0;

  // Execute each scenario
  for (const scenario of scenarios) {
    try {
      console.log(`[${completedTests + 1}/${scenarios.length}] Running: ${scenario.name}`);

      const result = await runner.runTestCase(scenario, sdk);

      if (result.summary.success) {
        successfulTests++;
        console.log(`  ✅ PASS - No locks detected`);
      } else {
        failedTests++;
        console.log(`  ❌ FAIL - Locks detected: ${result.summary.locksDetected}`);
      }

      completedTests++;
    } catch (error) {
      failedTests++;
      completedTests++;
      console.error(`  ❌ ERROR - ${(error as Error).message}`);
    }
  }

  // Export results
  try {
    await runner.getResultLogger().exportToCsv();
    await runner.getResultLogger().exportToJson();
  } catch {
    console.log('Note: Could not export results to files');
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('DIAGNOSTIC TEST SUITE COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total tests: ${completedTests}`);
  console.log(`Successful (no locks): ${successfulTests}`);
  console.log(`Failed (locks detected): ${failedTests}`);
  console.log(`Success rate: ${((successfulTests / completedTests) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));
  console.log('\nNEXT STEPS:');
  console.log('1. Review results.json to identify patterns');
  console.log('2. Check which scenarios avoid locks');
  console.log('3. Implement solutions based on viable patterns');
  console.log('4. Run solution tests to validate effectiveness');
  console.log('='.repeat(60));

  sdk.resetWasmSdk();
}

// Parse command line argument for category
const category = process.argv[2] || 'all';

// Run the diagnostic suite
runDiagnosticSuite(category).catch((error) => {
  console.error('Fatal error running diagnostic suite:', error);
  process.exit(1);
});

// Export for programmatic use
export { runDiagnosticSuite };
export * from './scenarios.js';
export * from './test-framework.js';
export * from './result-logger.js';
