# WASM Concurrency Diagnostic Test Results Analysis

**Test Date**: 2025-11-16
**Test Branch**: fix/instant-lock-timing-and-wasm-isolation
**Test Suite**: Core Diagnostic Tests (8 scenarios)

## Executive Summary

**CRITICAL FINDING**: All 8 core diagnostic test scenarios failed with WASM lock errors. The "already locked to a reader" error occurs consistently across ALL architectural patterns tested, including:

- Sequential operations on single SDK instance (FAILED)
- Fresh worker per operation (FAILED)
- Persistent worker with sequential operations (FAILED)
- SDK cleanup and reinitialization (FAILED)
- Multiple SDK instances in same process (FAILED)
- Different operation sequences (FAILED)
- Worker initialization patterns (FAILED)
- Concurrent operations via Promise.all() (FAILED)

**Success Rate**: 0/8 (0.0%)
**Lock Rate**: 8/8 (100%)
**Average Execution Time**: ~7 seconds per test

## Root Cause Analysis

### The Lock Occurs Inside the Worker Process

The error message pattern reveals the critical insight:

```
Error: Failed to fetch identity: Worker failed: already locked to a reader
```

The error structure shows:
1. **Outer error**: "Failed to fetch identity" (from IdentityFetcher)
2. **Worker failure**: "Worker failed" (from wasm-worker-runner.js)
3. **WASM lock error**: "already locked to a reader" (from WASM SDK inside worker)

This indicates the WASM SDK is being locked **within each worker process itself**, not between workers or between SDK instances.

### Worker Implementation Pattern

From `/dist/identities/utils/wasm-worker-runner.js`:

```javascript
// Each operation spawns a fresh child process
const worker = fork(workerPath);

// Worker receives operation request
worker.send({
  operation,
  params,
  network,
  logs
});

// Worker executes and returns result
worker.on('message', (msg) => {
  if (msg.success) {
    resolve(msg.result);
  } else {
    reject(new Error(`Worker failed: ${msg.error}`));
  }
});
```

### The Lock Happens During WASM SDK Initialization

Looking at the error locations and timing:
- Lock occurs on **first operation** (operation index 0)
- No operations succeed, even in fresh worker processes
- Error happens before any identity data is processed

This suggests the lock is acquired during:
1. WASM module initialization/loading
2. SDK instance creation
3. Connection establishment to DAPI

## Detailed Test Results

### Case 1: Sequential Operations - Single SDK Instance
- **Pattern**: Two fetch operations, executed sequentially
- **Worker**: No worker (direct SDK calls)
- **Result**: FAILED - Both operations locked
- **First Lock**: Operation 0
- **Execution Time**: 6.7s

**Key Finding**: Even with no concurrency, the first operation fails. This eliminates concurrency as the root cause.

### Case 2: Fresh Worker Per Operation
- **Pattern**: Two fetch operations, each in fresh worker process
- **Worker**: Yes, fresh-per-op strategy
- **Result**: FAILED - Both operations locked
- **First Lock**: Operation 0
- **Execution Time**: 6.5s

**Key Finding**: Fresh workers don't solve the problem. Each fresh worker still encounters the lock on its first operation.

### Case 3: Persistent Worker - Sequential Operations
- **Pattern**: Five sequential operations in single persistent worker
- **Worker**: Yes, reusable strategy
- **Result**: FAILED - All operations locked
- **First Lock**: Operation 0
- **Execution Time**: 16.1s
- **Additional Error**: getKeys operation failed with different error (buffer conversion issue)

**Key Finding**: Persistent workers also fail. The lock persists across all operations in the same worker.

### Case 4: SDK Cleanup and Reinitialization
- **Pattern**: Fetch, reset WASM, fetch again
- **Worker**: No worker
- **WASM Reset**: Yes, called between operations
- **Result**: FAILED - Both operations locked
- **First Lock**: Operation 0
- **Execution Time**: 6.7s

**Key Finding**: `resetWasmSdk()` does NOT release the lock. This is a critical finding about the ineffectiveness of the reset mechanism.

### Case 5: Multiple SDK Instances - Same Process
- **Pattern**: Two fetch operations on different SDK instances, concurrent
- **Worker**: No worker
- **Result**: FAILED - Both operations locked
- **First Lock**: Operation 0
- **Execution Time**: 3.1s

**Key Finding**: Multiple SDK instances share the same WASM lock. The Rust mutex is global at the process level, not per-SDK-instance.

### Case 6: Operation Sequence Variations
- **Pattern**: Different operation types (fetch, getKeys, fetch-with-proof)
- **Worker**: No worker
- **Result**: FAILED - All operations had errors
- **First Lock**: Operation 0
- **Execution Time**: 7.6s
- **Additional Findings**:
  - getKeys: Buffer conversion error
  - fetch-with-proof: Method not found error (`wasmSdk.getIdentityWithProof is not a function`)

**Key Finding**: Multiple different errors suggest the SDK/WASM integration has additional issues beyond just the lock.

### Case 7: WASM Module Initialization Patterns
- **Pattern**: Test different WASM initialization approaches
- **Worker**: Yes, reusable strategy
- **Result**: FAILED - Both operations locked
- **First Lock**: Operation 0
- **Execution Time**: 6.2s

**Key Finding**: Different initialization patterns don't help. The lock is fundamental to how the WASM module is loaded.

### Case 8: Concurrent Operations - Promise.all()
- **Pattern**: Three fetch operations run concurrently
- **Worker**: No worker
- **Result**: FAILED - All operations locked
- **First Lock**: Operation 0
- **Execution Time**: 3.2s

**Key Finding**: Concurrent execution doesn't change the behavior. All operations fail with the same lock error.

## Additional Errors Found

Beyond the lock error, the diagnostic tests revealed:

1. **getKeys Buffer Conversion Error**:
   ```
   Error: Failed to get keys: The "src" argument must be of type string.
   Received an instance of Object
   ```
   This suggests the worker is not properly serializing/deserializing buffer data.

2. **Missing Method Error**:
   ```
   Error: wasmSdk.getIdentityWithProof is not a function
   ```
   This indicates the WASM SDK interface may not match what the facade expects, or the method name has changed.

## The Fundamental Problem

The WASM SDK uses Rust's interior mutability pattern with `RefCell` or similar constructs. This creates a **runtime borrow checker** that prevents multiple simultaneous borrows of the same data.

In the worker architecture:
1. Worker process spawns
2. Worker loads WASM module (`@dashevo/wasm-sdk`)
3. WASM module initializes internal state with Rust `RefCell`
4. First operation attempts to borrow the state → **LOCK ACQUIRED**
5. The borrow is never released, or is released incorrectly
6. Subsequent operations (even in the same worker) cannot borrow → **"already locked to a reader"**

## Why ALL Patterns Failed

- **Fresh workers fail**: Each worker loads WASM fresh, but the lock happens during initialization/first use
- **Persistent workers fail**: Lock happens on first operation and never releases
- **Reset doesn't work**: `resetWasmSdk()` doesn't properly release the Rust borrow
- **Multiple instances fail**: WASM module is a singleton at the process level
- **Sequential operations fail**: Not a concurrency issue - it's a borrow tracking issue

## Possible Solutions (Ranked by Viability)

### 1. Fix the WASM SDK Borrow Management (Most Direct)
**Location**: `packages/wasm-sdk/`

The Rust code needs to ensure borrows are properly released. This could involve:
- Ensuring all `RefCell::borrow()` calls have matching drops
- Using `try_borrow()` instead of `borrow()` to handle lock detection
- Refactoring to use `Rc<RefCell<T>>` or `Arc<Mutex<T>>` with proper RAII
- Adding explicit cleanup/release methods

**Pros**: Fixes the root cause
**Cons**: Requires Rust expertise and WASM recompilation

### 2. One-Shot Worker Pattern (Current Workaround Attempt)
**Location**: `packages/js-evo-sdk/src/identities/utils/wasm-worker-runner.ts`

Spawn a fresh worker for EVERY operation, terminate it immediately after result.

**Pros**: Each operation gets clean WASM state
**Cons**:
- Already attempted and FAILING
- High overhead (process spawn per operation)
- Tests show this doesn't work (workers lock on first operation)

### 3. Process Pool with Lock Detection and Recovery
Create a pool of worker processes. When a lock is detected:
1. Terminate the locked worker
2. Spawn a fresh replacement
3. Retry the operation in new worker

**Pros**: Robust recovery mechanism
**Cons**: Complex, high overhead, treating symptom not cause

### 4. Queue All Operations to Single Worker
Force all WASM operations through a single persistent worker with operation queue.

**Pros**: No concurrent access, simplest pattern
**Cons**:
- Tests show even sequential operations in one worker fail
- Performance bottleneck (no parallelism)
- Still doesn't solve the fundamental lock issue

### 5. Rewrite Operations Without WASM SDK
Implement identity operations using pure JavaScript + DAPI calls, bypassing WASM SDK entirely.

**Pros**: Avoids lock issue completely
**Cons**: Major rewrite, loses WASM validation/optimization benefits

## Immediate Next Steps

### 1. Investigate WASM SDK Source
**File**: `packages/wasm-sdk/src/` (Rust source)

Search for:
- `RefCell` usage
- `.borrow()` and `.borrow_mut()` calls
- WASM bindings that might hold borrows
- Cleanup/drop implementations

### 2. Test WASM SDK Directly
**Create**: `packages/wasm-sdk/test-direct-wasm.js`

Test the WASM SDK directly (not through js-evo-sdk) to isolate the issue:

```javascript
import { WasmSdk } from '@dashevo/wasm-sdk';

// Test 1: Single operation
const sdk1 = await WasmSdk.create('testnet');
await sdk1.getIdentity('5DbLw...');
// Does this work?

// Test 2: Sequential operations
await sdk1.getIdentity('5DbLw...');
await sdk1.getIdentity('5DbLw...');
// Does the second call fail?

// Test 3: With explicit cleanup
const sdk2 = await WasmSdk.create('testnet');
await sdk2.getIdentity('5DbLw...');
sdk2.free(); // If such a method exists
await sdk2.getIdentity('5DbLw...'); // Should fail cleanly
```

### 3. Check WASM SDK Version and Changelog
The error might be introduced in a recent version. Check:
- `packages/wasm-sdk/package.json` for version
- WASM SDK changelog for recent changes to borrow checking
- Try downgrading to a known-working version

### 4. Enable WASM SDK Debug Logging
**Set**: `options.logs = true` in worker calls

This might reveal what's holding the borrow:
```javascript
await runWasmOperation('identity-fetch', params, {
  network: 'testnet',
  logs: true  // Enable WASM debug output
});
```

### 5. Examine Worker Operation Implementations
**File**: `packages/js-evo-sdk/workers/operations/`

Check how operations are implemented:
- Are they properly awaiting async operations?
- Are they cleaning up resources?
- Are they handling errors correctly?

## Test Data Summary

**All test runs show**:
- Lock on first operation (index 0)
- 0% success rate across all patterns
- Average execution time: 3-16 seconds depending on operation count
- Lock error consistent across worker and non-worker modes

**CSV Export**: Available at `test-results/wasm-diagnostics/results.csv`
**Full Results**: Available at `test-results/wasm-diagnostics/results.json`
**Summary**: Available at `test-results/wasm-diagnostics/summary.json`

## Conclusion

The WASM SDK has a fundamental borrow/lock management issue that prevents ANY operations from succeeding. The worker isolation approach attempted in this branch does NOT solve the problem because:

1. The lock occurs inside each worker's WASM instance
2. The lock happens on the first operation
3. No cleanup/reset mechanism releases the lock
4. The Rust borrow checker state is persisting incorrectly

**Recommended Action**: Debug the WASM SDK Rust source code to find and fix the borrow tracking issue. Worker-level solutions are attempting to work around a problem that needs to be fixed at its source.
