# Comprehensive Testing Plan for UTXO Finder PRD Alignment

**Date Created:** 2025-10-26
**Status:** Ready for Implementation
**Current Test Count:** 198 (all passing)
**Target Test Count:** 280+
**Expected Coverage:** >90% line coverage

---

## 🎯 Objective

Validate that all Phase 1, 2, and 3 implementations are fully aligned with PRD_UTXO_FINDER.md requirements through comprehensive testing at unit, integration, and e2e levels.

---

## 📋 Testing Strategy Overview

### Test Hierarchy

1. **Unit Tests** - Isolated component testing (mock dependencies)
2. **Integration Tests** - Component interaction testing (mock DAPI)
3. **E2E Tests** - Real network testing (Regtest with RPC)
4. **Testnet Tests** - Live network validation
5. **Compliance Tests** - PRD requirement verification
6. **Performance Tests** - Performance benchmarks

---

## Phase 1: Race Condition Prevention Tests

### ✅ Current Status (Per Session Summary)

- 3 tests added to TransactionSyncer.test.ts (all passing)
- Tests concurrent sync prevention
- Tests sequential syncs work
- Tests flag cleanup on error

### 🔍 Additional Tests Needed

#### 1.1 Unit Test Enhancements

**File**: `__tests__/unit/TransactionSyncer.test.ts`

**New Tests to Add**:
- [ ] **Verify stateless design prevents bloom filter expansion**
  - Ensure addresses array is immutable during sync
  - Verify no dynamic address discovery occurs
  - Test that trying to modify addresses throws error or is ignored

- [ ] **Test error propagation doesn't leave flag stuck**
  - Force various error types (network, parsing, timeout)
  - Confirm syncInProgress always resets
  - Test that third sync after error succeeds

- [ ] **Performance test for flag check overhead**
  - Measure sync time with vs without guard
  - Ensure <5ms overhead per check
  - Run 100 sync operations

#### 1.2 Integration Test

**New File**: `__tests__/integration/race-condition.integration.test.ts`

**Scenarios**:
- [ ] **Multiple finder instances don't interfere**
  - Create 2 UTXOFinder instances
  - Run concurrent syncs on different address sets
  - Verify both complete successfully
  - No cross-contamination between instances

---

## Phase 2: Lock Detection (InstantLock & ChainLock) Tests

### ✅ Current Status (Per Session Summary)

- 7 tests added (4 InstantLock + 3 ChainLock, all passing)
- Tests lock parsing with dashcore-lib
- Tests transaction matching

### 🔍 Additional Tests Needed

#### 2.1 Unit Test Enhancements

**File**: `__tests__/unit/TransactionSyncer.test.ts`

**New Tests to Add**:
- [ ] **InstantLock: Test multiple locks in single stream message**
  - Create stream with 3 InstantLocks for 3 different transactions
  - Verify all 3 transactions matched correctly
  - Verify only those 3 have isInstantLocked=true

- [ ] **ChainLock: Test all transactions in block get marked**
  - Create 5 transactions in same block (same blockHash)
  - Send ChainLock for that blockHash
  - Verify all 5 have isChainLocked=true
  - Other transactions in different blocks unaffected

- [ ] **Lock precedence: Both InstantLock AND ChainLock**
  - Transaction that's both instant and chain locked
  - Verify both flags set to true
  - Test selection logic respects both flags

- [ ] **Lock timing: Locks arrive before transactions**
  - Send locks first, transactions second
  - Verify retroactive matching works
  - Verify isInstantLocked/isChainLocked set correctly

- [ ] **Lock timing: Transactions arrive before locks**
  - Send transactions first, locks second
  - Verify forward-looking matching works
  - Verify flags updated correctly

#### 2.2 Integration Tests

**New File**: `__tests__/integration/lock-detection.integration.test.ts`

**Scenarios**:
- [ ] **End-to-end lock detection with mock DAPI**
  - Mock DAPI returns transactions + locks
  - Verify UTXOs have correct lock status
  - Test with testnet-realistic lock data
  - 100+ transactions with mixed lock status

- [ ] **Spendability criteria validation** (PRD Section 4.7)
  - Unconfirmed (height=0) + InstantLocked → Spendable
  - Unconfirmed (height=0) + No locks → Not spendable
  - Confirmed (height>0) + ChainLocked → Spendable
  - Test LatestUTXOSelector respects these rules
  - Verify correct UTXO selected

#### 2.3 E2E Tests (If possible with Regtest)

**New File**: `__tests__/integration/lock-detection.e2e-with-rpc.test.ts`

**Scenarios**:
- [ ] **Real InstantLock detection** (if Regtest supports)
  - Send transaction with InstantSend
  - Wait for lock message
  - Verify UTXO has isInstantLocked=true

- [ ] **Real ChainLock detection** (if Regtest supports)
  - Mine block with transaction
  - Wait for ChainLock
  - Verify UTXO has isChainLocked=true

---

## Phase 3: Storage Adapter Tests

### ✅ Current Status (Per Session Summary)

- 16 tests for InMemoryStorage (all passing)
- LocalStorageAdapter and IndexedDBAdapter implemented
- No tests for browser adapters yet

### 🔍 Additional Tests Needed

#### 3.1 LocalStorageAdapter Tests

**New File**: `__tests__/unit/LocalStorageAdapter.test.ts`

**Tests to Add** (run same suite as InMemoryStorage plus):
- [ ] **All 16 base storage tests** (same as InMemoryStorage)
  - saveUTXOs, getUTXOs, saveSyncCheckpoint, getSyncCheckpoint
  - Multiple addresses, multiple networks
  - Proper isolation and clearing

- [ ] **Quota exceeded handling**
  - Fill localStorage to quota
  - Try to save additional UTXOs
  - Verify error message includes "IndexedDB" suggestion
  - Verify data not corrupted

- [ ] **Invalid JSON recovery**
  - Corrupt cached data in localStorage
  - Call getUTXOs for corrupted data
  - Verify returns [] instead of crashing
  - Logs warning to console

- [ ] **Persistence across "page reload"**
  - Save UTXOs with instance A
  - Create new adapter instance B (simulates reload)
  - Verify data retrieved from localStorage

- [ ] **Environment check**
  - Mock `localStorage` as undefined
  - Verify constructor throws with clear message
  - Message suggests using InMemoryStorage or IndexedDB

#### 3.2 IndexedDBAdapter Tests

**New File**: `__tests__/unit/IndexedDBAdapter.test.ts`

**Tests to Add** (run same suite as InMemoryStorage plus):
- [ ] **All 16 base storage tests** (same as InMemoryStorage)
  - saveUTXOs, getUTXOs, saveSyncCheckpoint, getSyncCheckpoint
  - Multiple addresses, multiple networks
  - Proper isolation and clearing

- [ ] **Database initialization**
  - First usage creates schema correctly
  - Indexes created on network and address
  - Verify database version correct

- [ ] **Upgrade handling**
  - Simulate schema version change
  - Verify onupgradeneeded works
  - Data persists through upgrade

- [ ] **Large dataset performance**
  - Store 1000 UTXOs
  - Verify retrieval <100ms
  - Verify storage doesn't slow down subsequent operations

- [ ] **Concurrent operations**
  - 5+ simultaneous saveUTXOs calls
  - Verify all complete successfully
  - No data corruption or race conditions

- [ ] **close() cleanup**
  - Call close()
  - Verify subsequent operations reinitialize
  - No resource leaks

- [ ] **Environment check**
  - Mock `indexedDB` as undefined
  - Verify constructor throws with clear message

#### 3.3 Storage Integration Tests

**New File**: `__tests__/integration/storage-integration.test.ts`

**Scenarios**:
- [ ] **UTXOFinder auto-saves to storage**
  - Run findLatestSpendableUTXO with storage adapter
  - Verify getCachedUTXOs returns results
  - Verify checkpoint saved with correct metadata

- [ ] **Offline query with cached data**
  - Sync and cache UTXOs
  - Disconnect from DAPI (mock)
  - Verify getCachedUTXOs still works
  - Returns same data as was cached

- [ ] **Multi-network isolation**
  - Save testnet UTXOs to storage
  - Save mainnet UTXOs to storage (different addresses)
  - Verify no cross-contamination
  - Each network has separate cache

- [ ] **Cache invalidation on clear**
  - Cache UTXOs for 3 addresses
  - Clear specific address
  - Verify only that address cleared
  - Other addresses still in cache

- [ ] **Checkpoint resumption path**
  - Save checkpoint with UTXOs
  - Retrieve checkpoint
  - Verify all checkpoint data intact
  - Network, lastBlockHeight, transactionIds all present

---

## Cross-Cutting Integration Tests

### 4.1 Complete Workflow Tests

**New File**: `__tests__/integration/complete-workflow.integration.test.ts`

**Scenarios**:
- [ ] **Mnemonic → Addresses → Sync → Lock Detection → Storage**
  - Full pipeline with all Phase 1-3 features
  - Verify end-to-end data flow
  - Check all metadata (locks, height, time) correct
  - Storage captures everything

- [ ] **Error recovery with storage checkpoint**
  - Start sync, save checkpoint
  - Simulate interruption
  - Verify checkpoint saved
  - Note: Resume logic not yet implemented

---

## PRD Compliance Verification Tests

### 5.1 PRD Section 4.7 (MetadataEnricher) Validation

**New File**: `__tests__/compliance/metadata-enricher.compliance.test.ts`

**Tests**:
- [ ] **EnrichedMetadata interface matches PRD**
  ```typescript
  // Verify UTXO has all required fields:
  ✓ blockHeight: number
  ✓ blockTime: number
  ✓ blockHash: string
  ✓ isInstantLocked: boolean
  ✓ isChainLocked: boolean
  ```

- [ ] **Lock detection logic matches PRD Section 4.7**
  - InstantLock: txId exact match
  - ChainLock: blockHash match for all txs in block
  - No false positives for unrelated txs

### 5.2 PRD Section 4.8 (StorageAdapter) Validation

**New File**: `__tests__/compliance/storage-adapter.compliance.test.ts`

**Tests**:
- [ ] **StorageAdapter interface matches PRD**
  ```typescript
  ✓ saveUTXOs(network: string, address: string, utxos: UTXO[]): Promise<void>
  ✓ getUTXOs(network: string, address: string): Promise<UTXO[]>
  ✓ saveSyncCheckpoint(network: string, checkpoint: SyncCheckpoint): Promise<void>
  ✓ getSyncCheckpoint(network: string): Promise<SyncCheckpoint | null>
  ✓ clear(network: string, address?: string): Promise<void>
  ```

- [ ] **SyncCheckpoint interface matches PRD**
  ```typescript
  ✓ lastBlockHeight: number
  ✓ lastBlockHash: string
  ✓ transactionIds: string[]
  ✓ timestamp: number
  ✓ network: string (added in implementation)
  ```

### 5.3 PRD Section 5.1-5.4 (Race Condition) Validation

**New File**: `__tests__/compliance/race-condition.compliance.test.ts`

**Tests**:
- [ ] **Stateless design verified**
  - All addresses provided upfront
  - No address expansion during sync
  - Bloom filter built once
  - Demonstrates PRD compliance

- [ ] **Concurrent sync prevention**
  - As already tested, but framed as PRD compliance
  - Matches PRD Section 5.3-5.4

---

## Testnet Live Validation

### 6.1 Real Testnet Tests

**File**: `__tests__/integration/UTXOFinder.testnet.integration.test.ts` (EXISTING - enhance)

**Additional Scenarios**:
- [ ] **Verify real InstantLocks on testnet**
  - Use known testnet address with InstantSend tx
  - Verify isInstantLocked detected
  - Verify lock signature valid

- [ ] **Verify real ChainLocks on testnet**
  - Use recent testnet block (all have ChainLock)
  - Verify isChainLocked detected
  - Verify lock signature valid

- [ ] **Storage persistence on testnet**
  - Run with LocalStorage or IndexedDB adapter
  - Verify caching works with real data
  - Offline query works after sync

---

## Performance & Stress Tests

### 7.1 Performance Benchmarks

**New File**: `__tests__/performance/benchmarks.test.ts`

**Tests**:
- [ ] **Lock parsing performance**
  - Parse 100 InstantLock messages
  - Verify <10ms total
  - Parse 100 ChainLock messages
  - Verify <10ms total

- [ ] **Storage adapter performance**
  - Save 1000 UTXOs (InMemory) - target <100ms
  - Save 1000 UTXOs (localStorage) - target <500ms
  - Save 1000 UTXOs (IndexedDB) - target <2000ms
  - Compare times and log results

- [ ] **Selection with locks**
  - 1000 UTXOs, mixed lock status
  - Select latest spendable
  - Verify <50ms

- [ ] **Storage retrieval performance**
  - 1000 cached UTXOs
  - Retrieve all - target <100ms
  - Retrieve specific address - target <10ms

---

## Documentation Verification Tests

### 8.1 README Examples Validation

**New File**: `__tests__/documentation/readme-examples.test.ts`

**Tests**:
- [ ] **All README code examples run**
  - Extract code blocks from README
  - Run as actual tests
  - Verify they work as documented

- [ ] **Storage examples**
  - Test InMemory example
  - Test localStorage example
  - Test IndexedDB example
  - Test custom backend example

- [ ] **Lock detection examples**
  - Test lock status checking example
  - Test spendability criteria example

---

## Test Execution Plan

### Phase 1: Unit Tests

```bash
npm run test:unit
```

**Expected Results**:
- Current: 175 unit tests
- Added: +37 unit tests
- Target: 212 unit tests
- Time: ~5 seconds
- Status: ✅ Should all pass

### Phase 2: Integration Tests (Mock)

```bash
npm run test:integration
```

**Expected Results**:
- Added: 15+ integration tests
- Time: ~30 seconds
- Status: ✅ Should all pass
- Tests use mock DAPI, no network dependency

### Phase 3: E2E Tests (Regtest)

```bash
npm run test:integration  # Includes e2e-with-rpc
```

**Expected Results**:
- Added: 5+ e2e tests
- Time: ~2 minutes (with Dashmate running)
- Requires: Local Dashmate node
- Status: May timeout if node not available

### Phase 4: Testnet Validation

```bash
npm run test:testnet
```

**Expected Results**:
- Added: 3+ testnet tests
- Time: ~1-2 minutes (network dependent)
- Requires: Internet + Dash Testnet connection
- Status: May be flaky due to network

### Phase 5: Performance Tests

```bash
npm run test:performance  # New script
```

**Expected Results**:
- 10 benchmark tests
- Time: ~10 seconds
- Output: Performance report

---

## Success Criteria

### Must Pass (100%)
- ✅ All existing 198 tests still pass (no regressions)
- ✅ All new Phase 2 lock detection tests pass
- ✅ All new Phase 3 storage tests pass
- ✅ All PRD compliance tests pass
- ✅ Target: 280+ total tests

### Should Pass (95%+)
- ✅ Testnet live tests (may have network flakiness)
- ✅ Performance benchmarks within targets

### Documentation
- ✅ README examples all run successfully
- ✅ No broken code examples
- ✅ All code snippets match actual implementation

---

## Test Coverage Targets

| Component | Current | Target | Gap |
|-----------|---------|--------|-----|
| TransactionSyncer | 47 tests | 70 tests | +23 |
| StorageAdapter | 16 tests | 50 tests | +34 |
| Lock Detection | 7 tests | 25 tests | +18 |
| Integration | 15 tests | 50 tests | +35 |
| Compliance | 0 tests | 40 tests | +40 |
| **TOTAL** | **198** | **280+** | **+82** |

---

## Implementation Order

### Week 1: Unit Test Completion

1. Add missing InstantLock/ChainLock unit tests (2 hours)
2. Add LocalStorageAdapter unit tests (3 hours)
3. Add IndexedDBAdapter unit tests (3 hours)
4. Add performance tests (2 hours)

**Expected**: 220 total tests passing

### Week 2: Integration & E2E Tests

1. Add lock detection integration tests (4 hours)
2. Add storage integration tests (4 hours)
3. Add complete workflow tests (4 hours)
4. Add PRD compliance tests (4 hours)

**Expected**: 260 total tests passing

### Week 3: Live Network & Documentation

1. Add testnet live validation (2 hours)
2. Add README example tests (2 hours)
3. Run full test suite and fix issues (4 hours)
4. Create test report document (2 hours)

**Expected**: 280+ total tests passing

---

## Deliverables

### 1. Test Coverage Report
- Current test count: 198
- Final test count: 280+
- Line coverage: >90%
- Branch coverage: >85%

### 2. PRD Compliance Matrix

| PRD Section | Component | Status | Tests |
|-------------|-----------|--------|-------|
| 4.7 | MetadataEnricher | ✅ Complete | 25 |
| 4.8 | StorageAdapter | ✅ Complete | 50 |
| 5.1-5.4 | Race Condition Fix | ✅ Complete | 15 |

### 3. Test Documentation
- This COMPREHENSIVE_TEST_PLAN.md
- TESTING_REPORT.md (to be created)
- PRD_COMPLIANCE_MATRIX.md (to be created)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| localStorage unavailable in test env | High | Use jsdom or similar to mock |
| IndexedDB complex to test | Medium | Use fake-indexeddb package |
| Testnet network unreliable | Low | Allow retries, mark as flaky |
| Lock messages hard to mock | Medium | Use real dashcore-lib fixtures |
| Performance targets too strict | Low | Adjust based on actual results |

---

## Tools & Setup Required

### 1. Test Dependencies

Check if needed and install:
- `fake-indexeddb` - For IndexedDB testing in Node.js
- `jsdom` - For localStorage/DOM testing

```bash
npm install --save-dev fake-indexeddb jsdom
```

### 2. Test Environment

- Regtest Dashmate node (for e2e tests)
- Testnet connection (for live tests)
- Performance measurement utilities

### 3. CI/CD Integration

```yaml
# Suggested GitHub Actions workflow
- Run unit + integration tests on every commit
- Run e2e tests on PR reviews
- Run testnet tests nightly
- Generate coverage reports
```

---

## References

- **PRD**: `/PRD_UTXO_FINDER.md`
- **Session Summary**: `/SESSION_SUMMARY.md`
- **Alignment Plan**: `/ALIGNMENT_PLAN.md`
- **Current Package**: `/packages/dash-utxo-finder/`

---

**Document Version**: 1.0
**Last Updated**: 2025-10-26
**Status**: Ready for Implementation
