#!/usr/bin/env node

/**
 * Master Validator Runner - Phase 4
 *
 * Orchestrates all diagnostic validators:
 * 1. Queue Validator - Verifies WASM operation queue
 * 2. DAPI Validator - Verifies DAPI client functionality
 * 3. Comparison Report - Generates before/after analysis
 *
 * Usage:
 *   node validators/run-all-validators.mjs
 */

import QueueValidator from './queue-validator.mjs';
import DAPIValidator from './dapi-validator.mjs';
import ComparisonReportGenerator from './comparison-report.mjs';

/**
 * Master Validator Runner
 */
class ValidatorRunner {
  async run() {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║         Queue + DAPI POC - Diagnostic Validation - Phase 4     ║');
    console.log('║                                                                ║');
    console.log('║  Running comprehensive validation of Queue and DAPI layers    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    const results = {
      queue: null,
      dapi: null,
      comparison: null,
      summary: {}
    };

    // Step 1: Queue Validator
    console.log('\n📋 STEP 1: Queue Validator');
    console.log('────────────────────────────────────────────────────────────────');
    try {
      const queueValidator = new QueueValidator();
      results.queue = await queueValidator.validate();
    } catch (error) {
      console.error(`\n❌ Queue Validator failed: ${error.message}`);
      results.queue = { passed: false, error: error.message };
    }

    // Step 2: DAPI Validator
    console.log('\n📋 STEP 2: DAPI Validator');
    console.log('────────────────────────────────────────────────────────────────');
    try {
      const dapiValidator = new DAPIValidator();
      results.dapi = await dapiValidator.validate();
    } catch (error) {
      console.error(`\n❌ DAPI Validator failed: ${error.message}`);
      results.dapi = { passed: false, error: error.message };
    }

    // Step 3: Comparison Report
    console.log('\n📋 STEP 3: Comparison Report Generator');
    console.log('────────────────────────────────────────────────────────────────');
    try {
      const reportGenerator = new ComparisonReportGenerator('./test-results/wasm-diagnostics');
      results.comparison = await reportGenerator.generate();
    } catch (error) {
      console.error(`\n❌ Comparison Report failed: ${error.message}`);
      results.comparison = { generated: false, error: error.message };
    }

    // Final Summary
    this.displayFinalSummary(results);

    return results;
  }

  /**
   * Display final validation summary
   */
  displayFinalSummary(results) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('\n📊 FINAL VALIDATION SUMMARY\n');

    const queueStatus = results.queue?.passed ? '✅ PASSED' : '❌ FAILED';
    const dapiStatus = results.dapi?.passed ? '✅ PASSED' : '❌ FAILED';
    const comparisonStatus = results.comparison?.generated ? '✅ GENERATED' : '⚠️ NEEDS RESULTS';

    console.log(`  Queue Validator:         ${queueStatus}`);
    console.log(`  DAPI Validator:          ${dapiStatus}`);
    console.log(`  Comparison Report:       ${comparisonStatus}`);

    const allValidatorsPass = results.queue?.passed && results.dapi?.passed;

    console.log('\n═══════════════════════════════════════════════════════════════\n');

    if (allValidatorsPass) {
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║           ✅ PHASE 4 DIAGNOSTIC VALIDATION PASSED               ║');
      console.log('║                                                                ║');
      console.log('║  All diagnostic validators confirm:                           ║');
      console.log('║  • Queue correctly serializes operations                      ║');
      console.log('║  • DAPI correctly enables concurrent reads                    ║');
      console.log('║  • Solution eliminates WASM mutex conflicts                   ║');
      console.log('║                                                                ║');
      console.log('║  Ready for Phase 5: Final POC Report Generation               ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
    } else {
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║        ⚠️  PHASE 4 VALIDATION INCOMPLETE                        ║');
      console.log('║                                                                ║');
      console.log('║  Some validators did not pass. Review details above and       ║');
      console.log('║  investigate failures before proceeding to Phase 5.           ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
    }

    // Next steps
    console.log('📋 Next Steps:\n');
    console.log('   Phase 5: Generate final POC validation report');
    console.log('   - Document all findings');
    console.log('   - Create implementation checklist');
    console.log('   - Generate recommendations\n');
    console.log('   To run Phase 5:');
    console.log('   node run-final-poc-report.mjs\n');

    // Output location
    console.log('📂 Diagnostic Output:');
    console.log('   test-results/wasm-diagnostics/');
    console.log('   ├── results.json                (POC test results)');
    console.log('   ├── summary.json                (POC summary)');
    console.log('   ├── results.csv                 (POC data export)');
    console.log('   └── comparison-report.json      (Phase 4 analysis)\n');
  }
}

// Run validators if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new ValidatorRunner();
  runner.run().catch(error => {
    console.error(`\n❌ Unexpected error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  });
}

export default ValidatorRunner;
