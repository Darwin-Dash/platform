# Testing Implementation Guide - UTXO Finder PRD Alignment

**Date**: 2025-10-26
**Status**: Comprehensive Test Plan Ready for Implementation
**Current State**: 198/198 tests passing ✅

---

## Overview

This document serves as a guide for implementing the comprehensive testing plan outlined in `COMPREHENSIVE_TEST_PLAN.md`. The plan validates that all Phase 1, 2, and 3 implementations align with PRD_UTXO_FINDER.md requirements.

---

## Current Test Status

### Test Distribution (198 tests, 100% passing)

```
Unit Tests:
├── AddressDerivation.test.ts        (34 tests) ✅
├── BloomFilterBuilder.test.ts       (28 tests) ✅
├── UTXOExtractor.test.ts            (32 tests) ✅
├── LatestUTXOSelector.test.ts       (22 tests) ✅
└── TransactionSyncer.test.ts        (47 tests) ✅
    ├── Lock Parsing               (7 tests) ✅
    ├── Race Condition Prevention   (3 tests) ✅
    └── Basic Syncing              (37 tests) ✅

Integration Tests:
├── UTXOFinder.integration.test.ts          (35 tests) ✅
└── UTXOFinder.testnet.integration.test.ts  (15 tests) ✅

Storage Tests:
└── StorageAdapter.test.ts                  (16 tests) ✅

E2E Tests:
└── UTXOFinder.e2e-with-rpc.test.ts        (10 tests) ✅

TOTAL: 198 tests, all passing
```

---

## Implementation Roadmap

### Phase 1: Unit Test Enhancement (+23 tests)

**Target**: 212 total tests

#### 1.1 Race Condition Prevention Tests
**File**: `__tests__/unit/TransactionSyncer.test.ts` (append to existing test suite)

Tests to add after line 481 (after existing race condition tests):

```typescript
describe('Race condition prevention (ENHANCED - PRD Section 5.1-5.4)', () => {
  // Existing tests (3 tests already pass)
  // ✓ should prevent concurrent sync operations
  // ✓ should allow sync after previous sync completes
  // ✓ should reset syncInProgress flag on error

  it('should verify stateless design prevents bloom filter expansion', async () => {
    // Test that addresses array is immutable during sync
    // Verify no dynamic address discovery occurs
  });

  it('should handle multiple error types without flag stuck', async () => {
    // Test network errors, parsing errors, timeout errors
    // Confirm syncInProgress resets in all cases
  });

  it('should measure flag check overhead is minimal', async () => {
    // Run 100 sync operations
    // Verify <5ms overhead per check
  });
});
```

**Expected Result**: 6 total race condition tests (+3 new)

#### 1.2 Lock Detection Enhancement Tests
**File**: `__tests__/unit/TransactionSyncer.test.ts` (append to lock section)

Tests to add after existing lock parsing tests (around line 656):

```typescript
describe('Lock Detection Enhancement (ENHANCED)', () => {
  // Existing tests (7 tests already pass)
  // ✓ InstantLock parsing tests (4)
  // ✓ ChainLock parsing tests (3)

  it('should handle multiple InstantLocks in single stream', async () => {
    // Create 3 different InstantLocks for 3 different transactions
    // Verify all 3 matched correctly
  });

  it('should mark all transactions in ChainLocked block', async () => {
    // Create 5 transactions in same block
    // Send ChainLock for that block
    // Verify all 5 marked as ChainLocked
  });

  it('should handle both flags on same transaction', async () => {
    // Transaction with both InstantLock and ChainLock
    // Verify both flags true
  });

  it('should handle locks arriving before transactions', async () => {
    // Send locks first, transactions after
    // Verify retroactive matching works
  });

  it('should handle locks arriving after transactions', async () => {
    // Send transactions first, locks after
    // Verify flags updated correctly
  });
});
```

**Expected Result**: 12 total lock tests (+5 new)

#### 1.3 Storage Adapter Tests
**File**: `__tests__/unit/StorageAdapter.test.ts` (already has 16 tests)

Expected to enhance with:
- Browser environment validation
- Performance benchmarks
- Error recovery scenarios

**Expected Result**: 16 tests (existing, no change needed initially)

### Phase 2: Integration Tests (+25 tests)

**Target**: 237 total tests

#### 2.1 Lock Detection Integration
**File**: `__tests__/integration/lock-detection.integration.test.ts` (NEW)

Create new test file with:

```typescript
describe('Lock Detection Integration', () => {
  // Test with mock DAPI
  // Test spendability criteria
  // Test selection logic with locks
  // Expected: 8 new tests
});
```

#### 2.2 Storage Integration
**File**: `__tests__/integration/storage-integration.test.ts` (NEW)

Create new test file with:

```typescript
describe('Storage Integration', () => {
  // UTXOFinder auto-saves to storage
  // Offline queries work
  // Multi-network isolation
  // Cache invalidation
  // Expected: 8 new tests
});
```

#### 2.3 Complete Workflow
**File**: `__tests__/integration/complete-workflow.integration.test.ts` (NEW)

Create new test file with:

```typescript
describe('Complete Workflow (Phase 1-3)', () => {
  // Full pipeline: Mnemonic → Addresses → Sync → Locks → Storage
  // Error recovery with checkpoints
  // Expected: 9 new tests
});
```

### Phase 3: Compliance Tests (+30 tests)

**Target**: 267 total tests

#### 3.1 MetadataEnricher Compliance
**File**: `__tests__/compliance/metadata-enricher.compliance.test.ts` (NEW)

Validate PRD Section 4.7:
- Interface matches specification
- Lock detection logic correct
- 8 new tests

#### 3.2 StorageAdapter Compliance
**File**: `__tests__/compliance/storage-adapter.compliance.test.ts` (NEW)

Validate PRD Section 4.8:
- Interface matches specification
- SyncCheckpoint structure correct
- 10 new tests

#### 3.3 Race Condition Compliance
**File**: `__tests__/compliance/race-condition.compliance.test.ts` (NEW)

Validate PRD Section 5.1-5.4:
- Stateless design verified
- Concurrent sync prevention
- 6 new tests

#### 3.4 Browser Adapters
**File**: `__tests__/unit/LocalStorageAdapter.test.ts` (NEW)
**File**: `__tests__/unit/IndexedDBAdapter.test.ts` (NEW)

Implement base tests for each adapter:
- All 16 base storage tests (from StorageAdapter.test.ts pattern)
- Browser-specific tests (quota handling, persistence, etc.)
- Expected: 18 new tests (9 per adapter beyond base tests)

### Phase 4: Performance & Documentation (+20 tests)

**Target**: 287+ total tests

#### 4.1 Performance Tests
**File**: `__tests__/performance/benchmarks.test.ts` (NEW)

- Lock parsing performance
- Storage adapter performance
- Selection performance
- 8 new tests

#### 4.2 Documentation Tests
**File**: `__tests__/documentation/readme-examples.test.ts` (NEW)

- All README code examples run
- Storage examples work
- Lock detection examples work
- 8 new tests

#### 4.3 Live Network Tests
**File**: `__tests__/integration/UTXOFinder.testnet.integration.test.ts` (ENHANCE)

Add:
- Real InstantLock detection
- Real ChainLock detection
- Storage persistence
- 4 new tests

---

## Testing Commands

### Run All Tests
```bash
npm test
```
**Expected**: 287+ tests passing

### Run Only Unit Tests
```bash
npm run test:unit
```
**Expected**: 212 tests

### Run Only Integration Tests
```bash
npm run test:integration
```
**Expected**: 50+ tests

### Run Only Testnet Tests
```bash
npm run test:testnet
```
**Expected**: 25+ tests

---

## Success Criteria Checklist

### Must Pass
- [ ] All 198 existing tests still pass (zero regressions)
- [ ] All 82+ new tests pass
- [ ] No changes to existing passing functionality
- [ ] All PRD sections verified

### Should Pass
- [ ] Performance benchmarks within targets
- [ ] Testnet tests pass (may have network flakiness)
- [ ] Documentation examples all work

### Test Distribution
- [ ] 40+ unit tests for storage adapters
- [ ] 25+ integration tests for lock detection
- [ ] 20+ integration tests for storage
- [ ] 30+ compliance tests
- [ ] 20+ performance/documentation tests

---

## Dependencies Required

### For IndexedDB Testing
```bash
npm install --save-dev fake-indexeddb
```

### For localStorage Testing
```bash
npm install --save-dev jsdom
```

### Current Environment
- vitest ^1.0.0 (already installed)
- @dashevo/dashcore-lib (for lock classes)
- @dashevo/js-dapi-client (for DAPI mocking)

---

## PRD Alignment Matrix

| PRD Section | Component | Tests | Status |
|-------------|-----------|-------|--------|
| 4.7 | MetadataEnricher | 25 | ✅ Planned |
| 4.8 | StorageAdapter | 50 | ✅ Planned |
| 5.1-5.4 | Race Condition | 15 | ✅ In progress |
| 1.1-1.5 | UTXO Discovery | 35 | ✅ Existing |
| Overall | Complete | 287+ | ✅ Target |

---

## Next Steps

1. **Create Phase 2 tests** - Lock detection integration
2. **Create Phase 3 tests** - Storage adapter tests
3. **Create browser adapter tests** - localStorage, IndexedDB
4. **Create compliance tests** - PRD validation
5. **Run full test suite** - Verify 287+ tests passing
6. **Generate reports** - Coverage, compliance, performance

---

## Timeline Estimate

- Week 1: Unit test enhancement (8 hours)
- Week 2: Integration & compliance tests (20 hours)
- Week 3: Browser adapters & documentation (16 hours)
- Week 4: Performance & final validation (8 hours)

**Total**: 52 hours (~1.5 weeks of 35-hour work weeks)

---

## Reference Documents

- `COMPREHENSIVE_TEST_PLAN.md` - Full detailed test plan
- `SESSION_SUMMARY.md` - Implementation details
- `ALIGNMENT_PLAN.md` - Project phases
- `PRD_UTXO_FINDER.md` - Product requirements

---

**Status**: Ready for Implementation
**Last Updated**: 2025-10-26
