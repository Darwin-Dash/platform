# Phase 3 Quick Start Guide - Running POC Tests

**Objective**: Execute the 4 POC scenarios and validate the Queue + DAPI solution against success criteria.

**Time Estimate**: ~2 hours

**Status**: Ready to execute

---

## Prerequisites

### 1. Configuration
Before running tests, you **must** set a valid testnet mnemonic:

**File**: `tests/integration/wasm-concurrency-diagnostics/helpers/testnet-data.mjs`

**What to Change** (around line 22):
```javascript
// BEFORE:
export const TEST_MNEMONICS = {
  test_mnemonic_1: {
    mnemonic: null,  // ← This is null
    // ...
  }
};

// AFTER:
export const TEST_MNEMONICS = {
  test_mnemonic_1: {
    mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',  // ← Set to real testnet mnemonic
    // ...
  }
};
```

### 2. Verify Configuration
```javascript
import { hasConfiguredMnemonics, getConfiguredMnemonics } from './helpers/testnet-data.mjs';

if (!hasConfiguredMnemonics()) {
  throw new Error('No test mnemonics configured! Set mnemonic before running tests.');
}

console.log('Configured:', getConfiguredMnemonics());
```

---

## Test Execution

### Step 1: Import Required Modules
```typescript
import { EvoSDK } from './src/sdk.js';
import QueueDAPITestRunner from './tests/integration/wasm-concurrency-diagnostics/test-framework-queue-dapi.mjs';
import { POC_SCENARIOS } from './tests/integration/wasm-concurrency-diagnostics/scenarios-queue-dapi.mjs';
import { getTestMnemonic, getPOCTestParameters } from './tests/integration/wasm-concurrency-diagnostics/helpers/testnet-data.mjs';
```

### Step 2: Initialize Test Environment
```typescript
// Create SDK
const sdk = EvoSDK.testnet();
await sdk.connect();

// Initialize test runner
const testMnemonic = getTestMnemonic('test_mnemonic_1');
const testParams = getPOCTestParameters();
const runner = new QueueDAPITestRunner();
runner.initialize(testMnemonic, {
  createAmount: testParams.queueCreateAmount,
  topUpAmount: testParams.queueTopUpAmount,
  dapiTimeout: testParams.dapiQueryTimeout
});

console.log('✅ Test environment initialized');
```

### Step 3: Run Each Scenario

#### Scenario A: Queue Concurrent Creates
```typescript
console.log('\n📝 Running Scenario A: Queue Concurrent Creates');

const resultA = await runner.runScenario(
  POC_SCENARIOS.scenarioA_queue_concurrent_creates,
  sdk
);

console.log('Result:');
console.log(`  Success Rate: ${resultA.successCount}/${resultA.operationCount}`);
console.log(`  Mutex Errors: ${resultA.lockError ? 'YES ❌' : 'NO ✅'}`);
console.log(`  Timing: ${resultA.totalExecutionTime}ms`);
console.log(`  Expected: Sequential, 300-900ms ✅`);

if (!resultA.lockError && resultA.successCount === resultA.operationCount) {
  console.log('✅ SCENARIO A PASSED');
} else {
  console.log('❌ SCENARIO A FAILED');
}
```

#### Scenario B: Queue Concurrent TopUps
```typescript
console.log('\n📝 Running Scenario B: Queue Concurrent TopUps');

const resultB = await runner.runScenario(
  POC_SCENARIOS.scenarioB_queue_concurrent_topups,
  sdk
);

console.log('Result:');
console.log(`  Success Rate: ${resultB.successCount}/${resultB.operationCount}`);
console.log(`  Mutex Errors: ${resultB.lockError ? 'YES ❌' : 'NO ✅'}`);
console.log(`  Timing: ${resultB.totalExecutionTime}ms`);
console.log(`  Expected: Sequential, 300-900ms ✅`);

if (!resultB.lockError && resultB.successCount === resultB.operationCount) {
  console.log('✅ SCENARIO B PASSED');
} else {
  console.log('❌ SCENARIO B FAILED');
}
```

#### Scenario C: DAPI Concurrent Reads
```typescript
console.log('\n📝 Running Scenario C: DAPI Concurrent Reads');

const resultC = await runner.runScenario(
  POC_SCENARIOS.scenarioC_dapi_concurrent_reads,
  sdk
);

console.log('Result:');
console.log(`  Success Rate: ${resultC.successCount}/${resultC.operationCount}`);
console.log(`  Mutex Errors: ${resultC.lockError ? 'YES ❌' : 'NO ✅'}`);
console.log(`  Timing: ${resultC.totalExecutionTime}ms`);
console.log(`  Expected: Parallel, 100-200ms ✅`);

if (!resultC.lockError && resultC.successCount === resultC.operationCount && resultC.totalExecutionTime < 500) {
  console.log('✅ SCENARIO C PASSED');
} else {
  console.log('❌ SCENARIO C FAILED');
}
```

#### Scenario D: Mixed Queue + DAPI
```typescript
console.log('\n📝 Running Scenario D: Mixed Queue + DAPI');

const resultD = await runner.runScenario(
  POC_SCENARIOS.scenarioD_mixed_queue_and_dapi,
  sdk
);

console.log('Result:');
console.log(`  Success Rate: ${resultD.successCount}/${resultD.operationCount}`);
console.log(`  Mutex Errors: ${resultD.lockError ? 'YES ❌' : 'NO ✅'}`);
console.log(`  Timing: ${resultD.totalExecutionTime}ms`);
console.log(`  Expected: Independent streams, 300-600ms ✅`);

if (!resultD.lockError && resultD.successCount === resultD.operationCount) {
  console.log('✅ SCENARIO D PASSED');
} else {
  console.log('❌ SCENARIO D FAILED');
}
```

### Step 4: Aggregate Results
```typescript
const allResults = [resultA, resultB, resultC, resultD];
const passedCount = allResults.filter(r => !r.lockError && r.successCount === r.operationCount).length;
const totalScenarios = allResults.length;

console.log('\n' + '='.repeat(60));
console.log(`📊 OVERALL RESULTS: ${passedCount}/${totalScenarios} scenarios passed`);
console.log('='.repeat(60));

if (passedCount === totalScenarios) {
  console.log('✅ ALL SCENARIOS PASSED - POC VALIDATED!');
} else {
  console.log('❌ Some scenarios failed - Review results for details');
}

// Check for key success metrics
const zeroMutexErrors = allResults.every(r => !r.lockError);
const queueSerializes = resultA.totalExecutionTime > 300 && resultB.totalExecutionTime > 300;
const dapiParallel = resultC.totalExecutionTime < 500;
const mixedIndependent = resultD.totalExecutionTime < 700;

console.log('\n📋 Success Criteria:');
console.log(`  Queue prevents mutex:    ${zeroMutexErrors ? '✅' : '❌'}`);
console.log(`  Queue serializes:        ${queueSerializes ? '✅' : '❌'}`);
console.log(`  DAPI is parallel:        ${dapiParallel ? '✅' : '❌'}`);
console.log(`  Mixed is independent:    ${mixedIndependent ? '✅' : '❌'}`);
```

---

## Results Location

All results are automatically logged to:
```
test-results/wasm-diagnostics/
├── results.json        # Detailed operation results
├── summary.json        # Aggregate statistics
└── results.csv         # Comma-separated values for analysis
```

### Analyzing Results

**Check JSON Results**:
```bash
cat test-results/wasm-diagnostics/results.json | jq '.[] | select(.testCase | contains("Queue")) | {testCase, lockError, successCount}'
```

**Check Summary Statistics**:
```bash
cat test-results/wasm-diagnostics/summary.json | jq '.{totalTests, totalWithLocks, lockRate, averageExecutionTime}'
```

---

## Expected Output

### Success Case
```
✅ SCENARIO A PASSED
✅ SCENARIO B PASSED
✅ SCENARIO C PASSED
✅ SCENARIO D PASSED

📊 OVERALL RESULTS: 4/4 scenarios passed
✅ ALL SCENARIOS PASSED - POC VALIDATED!

📋 Success Criteria:
  Queue prevents mutex:    ✅
  Queue serializes:        ✅
  DAPI is parallel:        ✅
  Mixed is independent:    ✅
```

### Failure Case (Examples)
```
❌ SCENARIO A FAILED - Mutex errors detected
  - Solution: Ensure SDK facade methods (identityCreate) are being called, not direct identities

❌ SCENARIO C FAILED - Timing exceeds 200ms
  - Solution: Check network connectivity to DAPI, increase timeout

❌ SCENARIO D FAILED - Operations not independent
  - Solution: Verify both queue and DAPI layers are being used
```

---

## Common Issues

### Issue: "Test mnemonic not configured"
**Cause**: TEST_MNEMONICS has `mnemonic: null`
**Fix**: Set valid testnet mnemonic in `helpers/testnet-data.mjs`

### Issue: "Cannot connect to DAPI"
**Cause**: Network connectivity or DAPI not running
**Fix**: Verify testnet DAPI is accessible, check network

### Issue: "Operation timeout"
**Cause**: Network slow or operations taking too long
**Fix**: Increase `dapiTimeout` and operation timeouts in test parameters

### Issue: "All operations fail with error"
**Cause**: Invalid mnemonic or testnet configuration
**Fix**: Verify mnemonic is valid for testnet, check SDK network setting

---

## Timing Expectations

**Queue Operations** (A, B):
- Per operation: ~100-300ms
- 3 operations sequential: ~300-900ms

**DAPI Operations** (C):
- Per operation: ~25-50ms (concurrent)
- 4 operations parallel: ~100-200ms

**Mixed Operations** (D):
- Writes: ~300-600ms
- Reads: ~100-200ms
- Total: ~300-600ms (parallel, not additive)

---

## Success Criteria Checklist

### Scenario A: Queue Creates
- [ ] All 3 operations succeed
- [ ] `lockError === false`
- [ ] No "already locked" errors
- [ ] Timing 300-900ms
- [ ] Sequential execution pattern

### Scenario B: Queue TopUps
- [ ] All 3 operations succeed
- [ ] `lockError === false`
- [ ] No "already locked" errors
- [ ] Timing 300-900ms
- [ ] Sequential execution pattern

### Scenario C: DAPI Reads
- [ ] All 4 operations succeed
- [ ] `lockError === false`
- [ ] Timing < 500ms
- [ ] Parallel execution pattern
- [ ] No WASM involvement

### Scenario D: Mixed
- [ ] All 5 operations succeed
- [ ] `lockError === false`
- [ ] Reads complete before writes
- [ ] Independent execution streams
- [ ] Timing 300-600ms total

---

## Next Steps After Phase 3

### If All Tests Pass ✅
1. Proceed to Phase 4: Create diagnostic validation tools
2. Generate comparison reports (before/after)
3. Document findings in POC_VALIDATION_RESULTS.md

### If Some Tests Fail ❌
1. Review error details in results.json
2. Check test data (mnemonic, connectivity)
3. Examine operation details for specific failures
4. Adjust timing/parameters if needed
5. Retry with corrected configuration

---

## Summary

**This is Phase 3** of the POC implementation:
- Execute 4 focused test scenarios
- Validate against success criteria
- Generate results for analysis

**Time Required**: ~2 hours
**Next Phase**: Phase 4 - Create diagnostic tools

**Key Point**: All infrastructure is ready. Just need to configure mnemonic and run!

Good luck! 🚀
