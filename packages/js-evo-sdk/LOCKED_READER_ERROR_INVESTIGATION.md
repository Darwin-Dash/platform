# "Already Locked to a Reader" Error - Investigation & Solutions

## Error Summary

**Error Message**: `Error: Batch worker failed: already locked to a reader`

**Severity**: High - Blocks batch identity discovery operations

**Affected Component**: IdentityDiscovery.discoverByHashBatch()

**Observed in**: Test output when running discovery batch operations

## Root Cause Analysis

### The Error Source

The error originates from the Rust WASM SDK's internal reader lock mechanism. The Dash Platform SDK uses a Rust-based architecture with thread-safe readers for accessing Platform data. When multiple operations attempt to access the same reader concurrently or in rapid succession, the Rust mutex lock fails with "already locked to a reader".

**Error Flow**:
1. `discoverByHashBatch()` is called with array of hashes (e.g., 50 hashes)
2. `runBatchWasmOperation()` spawns a child process worker
3. Worker receives batch request and attempts to execute all operations sequentially
4. During batch processing, WASM SDK's internal reader becomes locked
5. Subsequent operations in batch fail with "already locked to a reader"

### Current Implementation Issues

**File**: `workers/wasm-operations.js` (lines 64-75)

Current batch approach:
```javascript
// Create SDK instance ONCE
const sdk = new EvoSDK(sdkOptions);

// Process all operations sequentially with SHARED SDK instance
const results = [];
for (let i = 0; i < paramsArray.length; i++) {
  const operationParams = paramsArray[i];
  const result = await operationHandler(operationParams, sdk, wasmModule);
  results.push(result);
}

// Cleanup ONCE at end
await sdk.resetWasmSdk();
```

**Problem**: Using a single shared SDK instance across all batch operations causes the reader lock contention. Each operation holds a reader lock, and the next operation in the sequence tries to acquire the same lock.

### Why This Happens

1. **WASM SDK Design**: The underlying WASM SDK maintains internal reader locks for Platform access
2. **Shared State**: Reusing the same SDK instance across operations means shared reader state
3. **Sequential Processing**: Operations wait for previous reader to be released, but lock isn't released until operation completes
4. **No Reader Release**: Between operations, the reader isn't explicitly released, causing accumulation

### Why Simple Operations Don't Show This Error

Simple operations like `fetch()`, `getKeys()`, etc. that use direct WASM SDK calls (not via worker runner) work fine because:
- Each operation gets a fresh scope with automatic lock release
- No worker process overhead
- Direct call → execute → return pattern prevents lock accumulation

## Investigation Findings

### Test Results

**Batch Operations That Fail**:
- `discoverByHashBatch()` with 50 hashes - FAILS with "already locked to a reader"
- `discoverByHashBatch()` with 5-10 hashes - May succeed but unreliable
- Large batch queries - Problematic

**Simple Operations That Work**:
- `fetch()` - Always works
- `getKeys()` - Always works
- `fetchWithProof()` - Always works
- Single hash discovery - Works

### Configuration Found

**File**: `src/identities/config/operation-config.ts`

```typescript
export const WORKER_CONFIG = {
  DISCOVERY_TIMEOUT_MS: 30000,
  BATCH_DISCOVERY_TIMEOUT_MS: 180000,  // 3 minutes for batches
  // ... other timeouts
};
```

The timeout is already generous (3 minutes), but doesn't help with the lock contention issue.

## Solution Options

### Option 1: Sequential Workers (Recommended for Phase 4)

**Approach**: Instead of one worker processing all batch items, spawn a separate worker for each item or small sub-batch.

**Pros**:
- Each worker has isolated WASM memory and reader locks
- No lock contention across operations
- Highly parallel - multiple batches can run simultaneously
- Simple to implement

**Cons**:
- Higher overhead (process spawn per operation)
- More total wall-clock time initially (though parallelism recovers this)
- More memory usage

**Implementation**:
```javascript
// Instead of runBatchWasmOperation, use multiple runWasmOperation calls
async function discoverByHashBatch(publicKeyHashesHex: string[]) {
  const promises = publicKeyHashesHex.map(hash =>
    runWasmOperation('identity-discover', { publicKeyHashHex: hash }, {
      network: this.sdk.networkConfig.network,
      timeout: WORKER_CONFIG.DISCOVERY_TIMEOUT_MS,
    })
  );
  return Promise.all(promises);
}
```

**Phase 4 Plan**: Test this approach with real testnet to measure performance impact.

### Option 2: Sub-Batching with Fresh SDK Per Sub-Batch

**Approach**: Divide large batch into smaller sub-batches (e.g., 5 items per sub-batch), process each sub-batch with a fresh SDK instance.

**Pros**:
- Balances efficiency and isolation
- Fewer worker processes than Option 1
- Still prevents lock accumulation
- Configurable sub-batch size

**Cons**:
- Needs tuning to find optimal sub-batch size
- More complex implementation
- Still more overhead than single worker

**Implementation**:
```javascript
const SUB_BATCH_SIZE = 5;
for (let i = 0; i < paramsArray.length; i += SUB_BATCH_SIZE) {
  const subBatch = paramsArray.slice(i, i + SUB_BATCH_SIZE);
  // Process subBatch with fresh SDK instance
  // Then reset SDK before next sub-batch
}
```

**Status**: Worth testing as middle ground between Options 1 and 2.

### Option 3: Implement Reader Lock Release in Worker

**Approach**: Explicitly release reader locks between operations

**Pros**:
- Minimal performance overhead
- Could still use single worker

**Cons**:
- Requires understanding WASM SDK's internal reader API
- Likely not exposed in public API
- May not work (reader lock may not be releasable mid-batch)
- High implementation risk

**Status**: Not recommended - too risky, likely not feasible.

### Option 4: Use Direct WASM SDK Without Worker

**Approach**: Call WASM SDK directly for batch operations instead of via worker process

**Pros**:
- Simplest approach
- No worker overhead
- Works for simple operations

**Cons**:
- Reader lock issue may still manifest in main thread
- Could block other SDK operations
- May not scale to large batches

**Status**: Not recommended - doesn't solve root cause.

## Recommended Action Plan for Phase 4

### Phase 4A: Investigation & Testing (Week 1)

1. **Verify Error Scope** (1-2 hours)
   - [ ] Create test that reproduces error reliably with different batch sizes
   - [ ] Test: What's the largest batch size that works? (binary search)
   - [ ] Test: Does error happen with concurrent small batches?
   - [ ] Document exact conditions that trigger error

2. **Performance Baseline - Single Operations** (30 min)
   - [ ] Measure time for 50 individual `runWasmOperation()` calls (Option 1 approach)
   - [ ] Compare to single `runBatchWasmOperation()` (current approach)
   - [ ] Calculate overhead ratio

3. **Implement & Test Option 1 (Sequential Workers)** (2-3 hours)
   - [ ] Modify batch discovery to use parallel `runWasmOperation()` calls
   - [ ] Test with 50, 100, 500 identity hashes
   - [ ] Measure performance and reliability
   - [ ] Compare to current batch approach
   - [ ] Document trade-offs

4. **Implement & Test Option 2 (Sub-Batching)** (1-2 hours)
   - [ ] Implement sub-batch approach with configurable size
   - [ ] Test different sub-batch sizes: 5, 10, 20
   - [ ] Find optimal size for performance/reliability
   - [ ] Benchmark against Option 1

### Phase 4B: Decision & Implementation (Week 2)

5. **Compare Results**
   - [ ] Create comparison table: Option 1 vs 2 vs current
   - [ ] Metrics: Latency, memory, reliability, wall-clock time
   - [ ] Choose recommended approach

6. **Implement Final Solution**
   - [ ] Update batch discovery with chosen approach
   - [ ] Update other batch operations (if any)
   - [ ] Add configuration options
   - [ ] Add logging for monitoring

7. **Test with Real Testnet**
   - [ ] Run batch discovery against real testnet
   - [ ] Test with production data volumes
   - [ ] Verify "locked reader" error is resolved
   - [ ] Validate performance is acceptable

### Phase 4C: Documentation & Completion (Week 3)

8. **Document Solution**
   - [ ] Write architecture decision record (ADR)
   - [ ] Document reader lock issue and solution
   - [ ] Update API documentation
   - [ ] Add performance notes to batch operation docs

9. **Update Tests**
   - [ ] Create batch discovery integration tests
   - [ ] Add performance tests
   - [ ] Test edge cases (empty batch, single item, large batch)
   - [ ] Verify no regressions

## Monitoring & Prevention

### Logging to Add

In `wasm-worker-runner.ts` and worker implementation, add:
```javascript
if (process.env.LOG_LEVEL === 'debug') {
  console.log(`[Batch] Processing item ${i}/${total}...`);
  console.log(`[Batch] Reader state before operation`);
  // After operation
  console.log(`[Batch] Operation completed, releasing reader...`);
}
```

### Alerts to Monitor

After Phase 4 implementation, monitor:
- Batch operation success rate (should be 100%)
- Reader lock error frequency (should be 0)
- Batch operation latency
- Memory usage during batch operations

## References

### Related Code Files

- `src/identities/facades/identity-discovery.ts` - Main entry point
- `src/identities/utils/wasm-worker-runner.ts` - Worker spawn logic
- `workers/wasm-operations.js` - Worker process implementation
- `src/identities/config/operation-config.ts` - Configuration

### WASM SDK Lock Behavior

The error "already locked to a reader" originates from the Rust WASM SDK's internal reader-writer lock implementation. This is a fundamental part of the Dash Platform SDK's concurrency model and cannot be worked around by JavaScript code alone.

**Solution must be architectural**: Ensure readers are isolated per operation or per small batch, not shared across large batches.

## Acceptance Criteria

Phase 4 is complete when:

- [ ] "Already locked to a reader" error is eliminated for batch operations
- [ ] Batch discovery works reliably with up to 1000 hashes
- [ ] Performance is acceptable (< 30 seconds for 100-hash batch)
- [ ] All tests pass (209+ tests passing)
- [ ] No regressions in simple operations
- [ ] Integration testing with real testnet passes
- [ ] Solution is documented

## Next Steps

1. Start Phase 4A Investigation tasks
2. Run test to reproduce error reliably
3. Benchmark Option 1 (parallel workers)
4. Make recommendation and proceed with implementation

---

**Document Status**: Investigation Complete - Ready for Phase 4 Implementation
**Last Updated**: 2025-11-17
**Owner**: Claude Code Agent
