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
    const scenarios = category === 'all' ? getAllTestScenarios() : getTestScenariosByCategory(category);
    logger.info(`Found ${scenarios.length} test scenarios to execute`);
    let completedTests = 0;
    let successfulTests = 0;
    let failedTests = 0;
    // Execute each scenario
    for (const scenario of scenarios) {
        try {
            logger.info(`[${completedTests + 1}/${scenarios.length}] Running: ${scenario.name}`);
            const result = await runner.runTestCase(scenario, sdk);
            completedTests++;
            if (!result.lockError) {
                successfulTests++;
                logger.info(`✓ PASSED: ${scenario.name}`);
            }
            else {
                failedTests++;
                logger.info(`✗ FAILED: ${scenario.name} (lock at operation ${result.firstLockAtOperation})`);
            }
        }
        catch (error) {
            completedTests++;
            failedTests++;
            logger.error(`✗ ERROR: ${scenario.name}`, error);
        }
        // Add small delay between tests to let WASM settle
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    // Export results to CSV
    logger.info('Exporting results to CSV...');
    try {
        await runner.getResultLogger().exportToCsv();
        logger.info('✓ Results exported to CSV');
    }
    catch (error) {
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
    logger.info('1. Review results.json to identify patterns');
    logger.info('2. Check which scenarios avoid locks');
    logger.info('3. Implement solutions based on viable patterns');
    logger.info('4. Run solution tests to validate effectiveness');
    // Cleanup
    await sdk.resetWasmSdk();
}
// Parse command line arguments
const category = (process.argv[2] || 'core');
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
