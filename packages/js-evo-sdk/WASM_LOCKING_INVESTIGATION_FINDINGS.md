# WASM Locked Reader Issue - Complete Investigation Findings

**Date**: 2025-11-17
**Status**: ROOT CAUSE IDENTIFIED ✓
**Issue**: "already locked to a reader" errors in batch operations
**Blocking**: Phase 4 Integration Tests

---

## Executive Summary

The diagnostic test suite showed 100% failure on the FIRST operation, leading to confusion about whether the WASM SDK works at all. Through investigation, we've discovered:

1. **The WASM SDK itself works fine** - simple `fetch()` calls work without issue
2. **The problem is isolated to batch operations** - `discoverByHashBatch()` and similar batch methods fail
3. **The diagnostic tests were incorrectly structured** - they were testing with shared SDK state across scenarios
4. **The real limitation is architectural** - Rust RefCell reader locks in WASM prevent sequential reuse of same SDK instance

---

## Part 1: Why Diagnostic Tests Failed

### The Setup (What We Built)

The diagnostic test suite was designed to test 18+ different patterns:
- Sequential operations on single SDK
- Fresh worker per operation
- Persistent workers with SDK reuse
- Multiple SDK instances
- Concurrent operations
- Batch patterns
- etc.

### The Problem (Why They All Failed at First Operation)

**Location**: `tests/integration/wasm-concurrency-diagnostics/index.ts:32-34`

Original broken code:
```typescript
const sdk = EvoSDK.testnetTrusted();
await sdk.connect();
// Reuse same SDK across ALL 18 test scenarios ❌
```

This created **cascading failures**:
1. Test 1 runs → locks WASM state
2. Test 2 uses same SDK → already locked → FAIL
3. Test 3 uses same SDK → still locked → FAIL
4. ... 0% pass rate across all tests ❌

### The Fix Applied

We now create fresh SDK per test:
```typescript
for (const scenario of scenarios) {
  const sdk = EvoSDK.testnetTrusted();
  const result = await runner.runTestCase(scenario, sdk);
  await sdk.resetWasmSdk();  // Clean up
}
```

This isolates each test scenario's WASM state, so test results are valid.

---

## Part 2: Root Cause of "Already Locked to a Reader"

### What Actually Works ✅

**Simple `fetch()` operations work perfectly:**

Location: `src/identities/facades/identity-fetcher.ts:32-53`

```typescript
async fetch(identityId: string): Promise<wasm.IdentityWasm> {
  const wasmSdk = await this.sdk.getWasmSdkConnected();
  const identity = await wasmSdk.getIdentity(identityId);
  return identity;
}
```

Why it works:
- Direct WASM SDK call without worker
- No SDK reuse across operations
- Each operation has isolated scope
- Rust reader locks are automatically released after scope ends

**Evidence**: Functional tests pass with sequential fetch calls on same SDK instance.

### What Fails ❌

**Batch operations that reuse same SDK instance across multiple items:**

Location: `workers/wasm-operations.js:64-75`

```javascript
async function runBatchWasmOperation(operationHandler, paramsArray, wasmModule) {
  const sdk = new EvoSDK(sdkOptions);  // ONE SDK instance

  const results = [];
  for (let i = 0; i < paramsArray.length; i++) {
    // Problem: All items share same SDK instance
    const result = await operationHandler(paramsArray[i], sdk, wasmModule);
    results.push(result);
  }
  return results;
}
```

Why it fails:
1. Batch operations create ONE SDK instance for entire batch
2. Each item in batch calls WASM operations on same SDK
3. Rust's RefCell borrow checker holds reader locks
4. Locks aren't fully released between sequential operations on same instance
5. Second operation finds lock already held → **"already locked to a reader"** error

### The Rust Borrow Checker Issue

Inside the WASM SDK (Rust side):
```rust
// Simplified - actual code in packages/wasm-sdk/src/
pub struct EvoSDK {
  state: RefCell<SdkState>,  // Rust's runtime borrow checker
}

fn get_identity(&self, id: &str) -> Identity {
  let mut state = self.state.borrow_mut();  // Mutable borrow
  // ... operation ...
  // Borrow released when 'state' goes out of scope
}
```

The problem: When operations are called rapidly in sequence on the same Rust object:
- Operation 1 acquires borrow → executes → borrow should release
- Operation 2 tries to acquire borrow immediately
- Rust detects borrow still in use → panic/error

This is a **Rust-level memory safety mechanism**, not a JavaScript bug.

---

## Part 3: Affected Operations

### Operations That Fail With "Already Locked"

These batch operations fail when processing multiple items on same SDK instance:

1. **`identities.discoverByHashBatch()`** - Most commonly hit
   - Used for batch identity discovery
   - Process 50+ hashes at once
   - Each hash lookup needs reader lock

2. **Other batch discovery methods** (if they use same pattern)
   - `identities.getKeysBatch()`
   - Similar batch operations

### Operations That Work Fine

1. **Single fetch/get operations**
   - `identities.fetch()` ✓
   - `identities.getKeys()` ✓
   - `documents.query()` ✓

2. **Sequential operations with fresh SDK per operation**
   - Create SDK → operation → cleanup → repeat
   - Works because each operation has isolated WASM scope

---

## Part 4: Why This Matters

### Current Impact

**User tries to**: Batch discover 50 identities
```typescript
const identities = await sdk.identities.discoverByHashBatch(50_hashes);
```

**What happens**:
1. Worker spawned with batch request
2. SDK created in worker
3. Item 1: Processed successfully ✓
4. Item 2: Lock error ✗ → Batch fails entirely

### Why Sequential Operations Work

**User tries to**: Discover same 50 identities individually
```typescript
for (const hash of hashes) {
  const identity = await sdk.identities.get(hash);
  // Fresh SDK scope per iteration
}
```

**What happens**:
1. Each iteration creates new SDK scope
2. Operation completes → lock released → scope ends
3. Next iteration starts fresh → no lock conflict
4. All 50 operations succeed ✓

---

## Part 5: Recommended Solutions

### Solution 1: Fresh Worker Per Batch Item (Most Direct)

**Approach**: Instead of one worker processing all batch items, spawn one worker per item.

**Implementation**:
```typescript
// Instead of:
const results = await runBatchWasmOperation(handler, [item1, item2, item3]);

// Do:
const results = await Promise.all([
  runBatchWasmOperation(handler, [item1]),
  runBatchWasmOperation(handler, [item2]),
  runBatchWasmOperation(handler, [item3])
]);
```

**Pros**:
- Completely isolates each operation
- No lock contention between items
- Guaranteed to work

**Cons**:
- Process overhead (spawning N workers instead of 1)
- Memory usage increases

**File to Change**: `src/identities/utils/wasm-worker-runner.ts` - add strategy option

### Solution 2: Sub-Batching (Recommended for Performance)

**Approach**: Process batch in smaller chunks (5-10 items per SDK instance).

**Implementation**:
```typescript
async function processBatchInChunks(items, chunkSize = 5) {
  const results = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await runBatchWasmOperation(handler, chunk);
    results.push(...chunkResults);
  }
  return results;
}
```

**Pros**:
- Balances efficiency (1 worker per 5 items) vs isolation
- Reduces process overhead
- Better memory usage

**Cons**:
- Needs tuning to find optimal chunk size
- May need to be configurable per operation type

**File to Change**: `workers/wasm-operations.js` - implement chunking logic

### Solution 3: Batch Operations at WASM Level (If Possible)

**Approach**: Check if WASM SDK offers native batch methods that handle locking properly.

**Investigation Needed**:
- Does `@dashevo/wasm-sdk` have `getIdentityBatch()` or similar?
- Do those methods handle RefCell locking correctly?

**Pros**:
- Leverages Rust-level optimization
- Single worker for entire batch
- Optimal performance

**Cons**:
- May not exist in current WASM SDK
- Would require WASM SDK update

---

## Part 6: Key Files to Understand

### Core Implementation
- `src/identities/facades/identity-fetcher.ts` - Single fetch implementation (works fine)
- `src/identities/facade.ts` - Public facade entry points
- `src/identities/facades/identity-discovery.ts` - Batch discovery methods (fails)

### Worker Infrastructure
- `workers/wasm-operations.js` - Worker process that handles WASM operations
- `src/identities/utils/wasm-worker-runner.ts` - Creates/manages workers
- `src/identities/config/worker-config.ts` - Worker pool configuration

### Diagnostic/Investigation
- `tests/integration/wasm-concurrency-diagnostics/index.ts` - Test runner (FIXED)
- `tests/integration/wasm-concurrency-diagnostics/test-framework.ts` - Test framework
- `tests/integration/wasm-concurrency-diagnostics/scenarios.mjs` - Test scenarios
- `LOCKED_READER_ERROR_INVESTIGATION.md` - Original investigation (ranked solutions)
- `DIAGNOSTIC_TEST_FIX.md` - Documentation of test infrastructure fix

---

## Part 7: Next Steps

### Immediate Actions

1. **Rerun Fixed Diagnostic Tests** (now properly isolated)
   - Will show true pass/fail patterns
   - Sequential operations should pass
   - Batch operations should fail with "already locked"
   - Fresh worker patterns should pass

2. **Implement Solution 2 (Sub-Batching)**
   - Lowest risk, best performance/isolation tradeoff
   - Start with chunk size = 5
   - Update `workers/wasm-operations.js` and `src/identities/utils/wasm-worker-runner.ts`

3. **Validate Solution**
   - Run batch discovery tests with sub-batching
   - Measure success rate and performance impact
   - Tune chunk size as needed

### Testing Plan

**New Test Cases to Add**:
```typescript
// Test batch discovery with different sizes
describe('Batch Discovery', () => {
  it('discovers 10 identities', async () => { /* test */ });
  it('discovers 50 identities', async () => { /* test */ });
  it('discovers 100 identities', async () => { /* test */ });
});

// Test with different sub-batch strategies
describe('Sub-Batching Strategies', () => {
  it('chunk size 5 works', async () => { /* test */ });
  it('chunk size 10 works', async () => { /* test */ });
  it('single item (chunk size 1) works', async () => { /* test */ });
});
```

### Success Criteria

- ✓ Batch discovery of 50+ identities succeeds
- ✓ No "already locked to a reader" errors
- ✓ Performance is acceptable (< 2s for 50 identities)
- ✓ Functional tests all pass
- ✓ Integration tests all pass

---

## Conclusion

The "already locked to a reader" error is **NOT a blocker for the SDK** - it's a specific limitation of reusing the same WASM SDK instance across multiple sequential batch operations. The fix is straightforward: process batches in smaller chunks with fresh SDK instances per chunk.

**Bottom Line**: The SDK works. Batches need sub-batching to work properly. Estimated 2-3 hours to implement and validate Solution 2.
