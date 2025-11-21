#!/usr/bin/env node

/**
 * Queue + DAPI POC Test Runner
 *
 * Executes the 4 focused POC scenarios to validate the Queue + DAPI solution
 * for eliminating WASM mutex conflicts.
 *
 * Usage:
 *   node run-poc-tests.mjs
 *
 * Requirements:
 *   - TEST_MNEMONICS.test_mnemonic_1.mnemonic must be set in helpers/testnet-data.mjs
 *   - SDK must be built: npm run build
 */

import { EvoSDK } from '../../../dist/sdk.js';
import QueueDAPITestRunner from './test-framework-queue-dapi.mjs';
import { POC_SCENARIOS } from './scenarios-queue-dapi.mjs';
import {
  getTestMnemonic,
  getPOCTestParameters,
  validateScenarioConfiguration,
  hasConfiguredMnemonics
} from './helpers/testnet-data.mjs';
import { createLogger } from '../../../dist/identities/utils/identity-logger.js';

const logger = createLogger('POCTestRunner');

/**
 * Main POC test execution function
 */
async function runPOCTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          Queue + DAPI POC Test Execution - Phase 3              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // ============================================================================
  // PRE-FLIGHT CHECKS
  // ============================================================================
  logger.info('Running pre-flight checks...');

  // Check if mnemonics are configured
  if (!hasConfiguredMnemonics()) {
    console.error('\n❌ ERROR: No test mnemonics configured!');
    console.error('   Please set TEST_MNEMONICS.test_mnemonic_1.mnemonic in:');
    console.error('   helpers/testnet-data.mjs');
    process.exit(1);
  }

  // Get mnemonic
  let testMnemonic;
  try {
    testMnemonic = getTestMnemonic('test_mnemonic_1');
    console.log('✅ Test mnemonic configured');
  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    process.exit(1);
  }

  // Get test parameters
  const testParams = getPOCTestParameters();
  console.log('✅ Test parameters loaded');

  // Validate scenarios
  const scenarios = Object.values(POC_SCENARIOS);
  for (const scenario of scenarios) {
    const validation = validateScenarioConfiguration(scenario);
    if (!validation.valid) {
      console.error(`\n❌ Invalid scenario: ${validation.errors.join(', ')}`);
      process.exit(1);
    }
  }
  console.log(`✅ All 4 scenarios validated`);

  // ============================================================================
  // INITIALIZE TEST ENVIRONMENT
  // ============================================================================
  console.log('\n📋 Initializing test environment...');

  let sdk;
  let runner;

  try {
    // Create SDK
    sdk = EvoSDK.testnetTrusted();
    console.log('  Connecting to testnet...');
    await sdk.connect();
    console.log('  ✅ SDK connected');

    // Initialize test runner
    runner = new QueueDAPITestRunner('./test-results/wasm-diagnostics');
    runner.initialize(testMnemonic, {
      createAmount: testParams.queueCreateAmount,
      topUpAmount: testParams.queueTopUpAmount,
      dapiTimeout: testParams.dapiQueryTimeout,
      dapiQueryRetries: testParams.dapiQueryRetries
    });
    console.log('  ✅ Test runner initialized\n');
  } catch (error) {
    console.error(`\n❌ Failed to initialize test environment: ${error.message}`);
    process.exit(1);
  }

  // ============================================================================
  // EXECUTE TESTS
  // ============================================================================
  console.log('═══════════════════════════════════════════════════════════════\n');

  const results = [];
  let scenarioIndex = 0;

  // Scenario A: Queue Concurrent Creates
  scenarioIndex++;
  console.log(`[${scenarioIndex}/4] 🔄 Scenario A: Queue Concurrent Creates`);
  console.log('     Testing: 3 × identityCreate() concurrently');
  console.log('     Expected: Sequential execution, 0 mutex errors\n');

  try {
    const resultA = await runner.runScenario(
      POC_SCENARIOS.scenarioA_queue_concurrent_creates,
      sdk
    );
    results.push(resultA);

    displayScenarioResult('A', resultA);
  } catch (error) {
    console.error(`  ❌ Scenario A failed: ${error.message}\n`);
    results.push({ name: 'Scenario A', success: false, error: error.message });
  }

  // Scenario B: Queue Concurrent TopUps
  scenarioIndex++;
  console.log(`[${scenarioIndex}/4] 🔄 Scenario B: Queue Concurrent TopUps`);
  console.log('     Testing: 3 × identityTopUp() concurrently');
  console.log('     Expected: Sequential execution, 0 mutex errors\n');

  try {
    const resultB = await runner.runScenario(
      POC_SCENARIOS.scenarioB_queue_concurrent_topups,
      sdk
    );
    results.push(resultB);

    displayScenarioResult('B', resultB);
  } catch (error) {
    console.error(`  ❌ Scenario B failed: ${error.message}\n`);
    results.push({ name: 'Scenario B', success: false, error: error.message });
  }

  // Scenario C: DAPI Concurrent Reads
  scenarioIndex++;
  console.log(`[${scenarioIndex}/4] 🔄 Scenario C: DAPI Concurrent Reads`);
  console.log('     Testing: 4 × getIdentitiesForMnemonic() concurrently');
  console.log('     Expected: Parallel execution, 100-200ms\n');

  try {
    const resultC = await runner.runScenario(
      POC_SCENARIOS.scenarioC_dapi_concurrent_reads,
      sdk
    );
    results.push(resultC);

    displayScenarioResult('C', resultC);
  } catch (error) {
    console.error(`  ❌ Scenario C failed: ${error.message}\n`);
    results.push({ name: 'Scenario C', success: false, error: error.message });
  }

  // Scenario D: Mixed Queue + DAPI
  scenarioIndex++;
  console.log(`[${scenarioIndex}/4] 🔄 Scenario D: Mixed Queue + DAPI`);
  console.log('     Testing: 2 × create (queued) + 3 × read (DAPI)');
  console.log('     Expected: Independent streams, no blocking\n');

  try {
    const resultD = await runner.runScenario(
      POC_SCENARIOS.scenarioD_mixed_queue_and_dapi,
      sdk
    );
    results.push(resultD);

    displayScenarioResult('D', resultD);
  } catch (error) {
    console.error(`  ❌ Scenario D failed: ${error.message}\n`);
    results.push({ name: 'Scenario D', success: false, error: error.message });
  }

  // ============================================================================
  // AGGREGATE RESULTS
  // ============================================================================
  console.log('\n═══════════════════════════════════════════════════════════════\n');
  console.log('📊 TEST SUMMARY\n');

  const passedCount = results.filter(
    r => !r.lockError && r.successCount === r.operationCount
  ).length;
  const totalScenarios = results.length;

  console.log(`Total Scenarios: ${totalScenarios}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${totalScenarios - passedCount}\n`);

  // Validate success criteria
  const queueCreateResult = results[0];
  const queueTopupResult = results[1];
  const dapiReadResult = results[2];
  const mixedResult = results[3];

  const criteria = {
    queuePrevents: !queueCreateResult?.lockError && !queueTopupResult?.lockError,
    queueSerializes:
      queueCreateResult?.totalExecutionTime >= 300 &&
      queueTopupResult?.totalExecutionTime >= 300,
    dapiParallel: dapiReadResult?.totalExecutionTime < 500,
    mixedIndependent: mixedResult?.totalExecutionTime < 700
  };

  console.log('✅ SUCCESS CRITERIA VALIDATION\n');
  console.log(`  Queue prevents mutex errors:     ${criteria.queuePrevents ? '✅' : '❌'}`);
  console.log(`  Queue serializes operations:     ${criteria.queueSerializes ? '✅' : '❌'}`);
  console.log(`  DAPI enables parallel reads:     ${criteria.dapiParallel ? '✅' : '❌'}`);
  console.log(`  Mixed layer independence:        ${criteria.mixedIndependent ? '✅' : '❌'}`);

  // Final verdict
  const allPassed =
    passedCount === totalScenarios &&
    Object.values(criteria).every(c => c === true);

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  if (allPassed) {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ POC VALIDATION PASSED                     ║');
    console.log('║                                                                ║');
    console.log('║  Queue + DAPI solution eliminates WASM mutex conflicts!        ║');
    console.log('║  All 4 scenarios passed all success criteria.                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  } else {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    ❌ POC VALIDATION FAILED                     ║');
    console.log('║                                                                ║');
    console.log('║  Some scenarios did not meet success criteria.                ║');
    console.log('║  Review results in test-results/wasm-diagnostics/ for details.║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  }

  // Results location
  console.log('📂 Results Location:\n');
  console.log('   test-results/wasm-diagnostics/');
  console.log('   ├── results.json        (Detailed operation results)');
  console.log('   ├── summary.json        (Aggregate statistics)');
  console.log('   └── results.csv         (For spreadsheet analysis)\n');

  console.log('📖 Next Steps:\n');
  console.log('   Phase 4: Create diagnostic tools for detailed analysis');
  console.log('   Phase 5: Generate final POC validation report\n');

  process.exit(allPassed ? 0 : 1);
}

/**
 * Display formatted result for a scenario
 */
function displayScenarioResult(letter, result) {
  const passed = !result.lockError && result.successCount === result.operationCount;

  console.log(`  Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`    Success Rate: ${result.successCount}/${result.operationCount}`);
  console.log(`    Mutex Errors: ${result.lockError ? 'YES ❌' : 'NO ✅'}`);
  console.log(`    Timing: ${result.totalExecutionTime}ms`);

  if (result.operationDetails && result.operationDetails.length > 0) {
    const details = result.operationDetails;
    const avgTime = Math.round(
      details.reduce((sum, d) => sum + d.duration, 0) / details.length
    );
    console.log(`    Avg per Op: ${avgTime}ms`);
  }

  console.log('');
}

// ============================================================================
// RUN TESTS
// ============================================================================
runPOCTests().catch(error => {
  console.error(`\n❌ Unexpected error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
