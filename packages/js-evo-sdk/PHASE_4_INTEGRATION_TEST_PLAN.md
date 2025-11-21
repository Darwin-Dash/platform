# Phase 4: Integration Validation Testing Plan

## Objectives
- Validate all identity operations against real testnet
- Resolve "locked reader" error in batch operations
- Establish end-to-end workflow patterns
- Establish performance baseline metrics
- Document issues discovered and solutions

## Current Status
- Phase 3: ✅ Complete (209 unit tests passing)
- Phase 4: Starting
- Known Issue: "Batch worker failed: already locked to a reader" in batch discovery operations

## "Locked Reader" Error Investigation

### Error Details
- **Error Message**: "Batch worker failed: already locked to a reader"
- **Observed In**: IdentityDiscovery batch operations (`discoverByHashBatch`)
- **Stack Trace Location**: `wasm-worker-runner.js:220`
- **Root Cause**: Appears to be WASM SDK reader lock contention in worker process

### Affected Operations
- `IdentityDiscovery.discoverByHashBatch()` - Batch query of 50+ identity hashes
- `IdentityDiscovery.scanByIndex()` - Uses batch discovery internally

### Investigation Tasks
1. [ ] Determine if simple operations (fetch, getKeys) also trigger this error
2. [ ] Identify if error only occurs under concurrent load or always in batch
3. [ ] Test if serializing batch operations prevents lock contention
4. [ ] Evaluate if using worker runner for batch operations is viable vs. direct calls

## Phase 4 Test Scenarios

### Scenario 1: Basic Identity Creation & Fetch
**Objective**: Validate end-to-end identity creation and retrieval

```javascript
1. Create wallet with test funds
2. Create identity via sdk.identities.create()
3. Fetch identity by ID via sdk.identities.fetch()
4. Validate returned identity matches input data
5. Validate keys, balance, credit data correct
```

**Success Criteria**:
- Identity created successfully
- Fetch returns correct data
- No "locked reader" errors
- Response time < 5 seconds

**Location**: `tests/integration/identity-creation-fetch.test.ts`

### Scenario 2: Identity Update (Top Up)
**Objective**: Validate credit top-up operation

```javascript
1. Create identity with initial credits
2. Top up credits via sdk.identities.topUp()
3. Fetch updated identity
4. Validate credit balance increased
5. Validate update timestamp changed
```

**Success Criteria**:
- Top-up transaction created and broadcast
- Credit balance increased
- No "locked reader" errors
- Update reflected in subsequent fetch

**Location**: `tests/integration/identity-topup.test.ts`

### Scenario 3: Batch Identity Query
**Objective**: Test batch discovery and potential "locked reader" error

```javascript
1. Create multiple identities (5-10)
2. Query batch of identity hashes via discoverByHashBatch()
3. Validate all identities returned correctly
4. Test concurrent batch queries (5 parallel requests)
5. Test large batch (50+ hashes)
```

**Success Criteria**:
- Small batches (5-10) work reliably
- Large batches (50+) work or fail gracefully
- Concurrent batches don't cause cascading errors
- Document any concurrency limitations found

**Location**: `tests/integration/identity-batch-discovery.test.ts`

### Scenario 4: Error Handling & Edge Cases
**Objective**: Validate error handling and boundary conditions

```javascript
1. Fetch non-existent identity (should throw)
2. Query with invalid hash format (should throw)
3. Create identity without sufficient funds (should fail gracefully)
4. Update identity with invalid data (should validate)
5. Test network timeout handling
```

**Success Criteria**:
- Appropriate errors thrown with clear messages
- No silent failures or data corruption
- Graceful degradation on network issues
- Error recovery possible

**Location**: `tests/integration/identity-error-handling.test.ts`

### Scenario 5: Performance Baseline
**Objective**: Establish performance metrics

```javascript
Operations to measure:
- Create identity: goal < 10 seconds
- Fetch identity: goal < 2 seconds
- Top-up identity: goal < 10 seconds
- Batch query (10 identities): goal < 5 seconds
- Batch query (50 identities): goal < 15 seconds

Metrics to collect:
- Min/max/avg latency
- Memory usage before/after
- CPU utilization during operations
```

**Success Criteria**:
- All operations meet performance goals
- No memory leaks (stable memory after GC)
- Baseline established for regression testing

**Location**: `tests/integration/performance-baseline.test.ts`

## Test Environment Requirements

### Testnet Setup
```bash
# Required services:
- DAPI endpoint(s) available
- Testnet blockchain running
- Test wallet with Dash credits for identity creation

# Environment variables needed:
TESTNET_DAPI_ENDPOINT=<endpoint>
TESTNET_RPC_ENDPOINT=<rpc_endpoint>
TESTNET_RPC_USERNAME=<username>
TESTNET_RPC_PASSWORD=<password>
TESTNET_WALLET_ADDRESS=<funded_address>
```

### Test Wallet Configuration
- Wallet must have sufficient credits for tests (~1000 credits minimum)
- Must be able to create and manage UTXOs
- Consider using separate wallet per test suite run to avoid conflicts

## Implementation Plan

### Week 1: Investigation & Setup
- [x] Verify Phase 3 completion (209 tests passing)
- [ ] Investigate "locked reader" error in depth
- [ ] Set up testnet environment and configuration
- [ ] Create test infrastructure and helpers
- [ ] Implement Scenario 1 (basic creation/fetch)

### Week 2: Core Scenarios
- [ ] Implement Scenario 2 (identity update/topup)
- [ ] Implement Scenario 3 (batch discovery - investigate locked reader)
- [ ] Implement Scenario 4 (error handling)
- [ ] Document findings and decisions

### Week 3: Performance & Documentation
- [ ] Implement Scenario 5 (performance baseline)
- [ ] Run full test suite and collect metrics
- [ ] Write Phase 4 completion report
- [ ] Update architecture documentation

## Success Criteria for Phase 4

- [x] Phase 3 completion verified (209 tests passing)
- [ ] All 5 test scenarios implemented and passing
- [ ] "Locked reader" error either resolved or documented with workaround
- [ ] Performance baseline established
- [ ] No regressions from Phase 3
- [ ] Comprehensive integration test coverage

## Known Limitations & Assumptions

1. **Testnet Availability**: Assumes testnet is stable and accessible
2. **Worker Runner**: Current batch implementation uses worker processes; may need refactoring if "locked reader" is fundamental issue
3. **Direct WASM Calls**: Simple operations use direct WASM SDK calls; batch operations use worker runner
4. **Parameter Transformation**: Wrapper methods handle Uint32Array and JSON.stringify transformations

## Next Steps

1. Run "Locked Reader" investigation tasks
2. Set up testnet connection and configuration
3. Create test infrastructure in `tests/integration/`
4. Begin Scenario 1 implementation

---
**Phase Status**: Phase 4 - Starting
**Last Updated**: 2025-11-17
**Owner**: Claude Code Agent
