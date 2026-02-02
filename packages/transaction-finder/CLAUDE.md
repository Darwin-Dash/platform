# CLAUDE.md - Transaction-Finder Testing Guide

This file documents how to work with tests in the Transaction-Finder package.

## Important: No Local Setup Required

**All integration tests connect to public Dash Platform testnet.**
You do NOT need to start any local services, Docker containers, or blockchain nodes.

Tests work immediately after `npm install`.

## Test Infrastructure

### What Tests Connect To

Tests use standard `DAPIClient` to connect to **public Dash testnet DAPI nodes**:

```typescript
import DAPIClient from '@dashevo/dapi-client';

const client = new DAPIClient({
  network: 'testnet',
  timeout: 30000,
  retries: 3,
});
```

## Test Files

### Test Organization
```
tests/
├── unit/                                   [Fast, no network required]
│   ├── core/
│   │   ├── BloomFilterBuilder.test.ts     [Bloom filter creation]
│   │   ├── StreamWrapper.test.ts          [Stream async iteration]
│   │   └── TransactionSyncer.test.ts      [Historic sync logic]
│   ├── finders/
│   │   └── RealtimeFinder.test.ts         [Realtime monitoring]
│   ├── monitoring/
│   │   └── TransactionTracker.test.ts     [TX state tracking]
│   ├── utils/
│   │   ├── utxo-selector.test.ts          [UTXO selection]
│   │   └── utxo-extractor.test.ts         [UTXO extraction]
│   └── TransactionFinder.test.ts          [Main facade]
├── integration/
│   ├── finders/
│   │   ├── HistoricFinder.integration.test.ts
│   │   ├── RealtimeFinder.integration.test.ts
│   │   └── TransactionFinder.integration.test.ts
│   ├── testnet-utxo.spec.ts               [Real testnet UTXO finding]
│   ├── testnet-realtime.spec.ts           [Real testnet IS/CL monitoring - manual]
│   └── testnet-realtime-automated.spec.ts [Real testnet IS/CL monitoring - automated]
└── helpers/
    ├── ControllableMockDAPIClient.ts      [Mock DAPI for tests]
    └── test-fixtures.ts                   [Test data]
```

## Running Tests

### Quick Start
```bash
# Install dependencies
npm install

# Run all tests (unit + integration with mocks)
npm test

# Run only unit tests (fast, no network)
npm run test:unit

# Run only integration tests
npm run test:integration

# Run with coverage report
npm run test:coverage
```

### Real Testnet Tests
```bash
# Run the real testnet UTXO finding test (takes ~2 minutes)
npm test tests/integration/testnet-utxo.spec.ts

# Run IS/CL monitoring test - manual (send DASH during test)
npm run test:realtime

# Run IS/CL monitoring test - automated (requires Dash Core RPC)
npm run test:realtime:auto
```

### Automated IS/CL Test Requirements
The automated realtime test (`test:realtime:auto`) requires a Dash Core node with RPC enabled:

```bash
# Required environment variables
export TESTNET_RPC_ENDPOINT=http://localhost:19998
export TESTNET_RPC_USERNAME=dashrpc
export TESTNET_RPC_PASSWORD=yourpassword

# Optional
export TESTNET_WALLET=test_wallet
export TESTNET_ADDRESS=yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy
```

## Environment Configuration

### What's Required
**Nothing.** Tests work with defaults.

### What's Optional
```bash
# Optional: Specify test address (defaults to known testnet address)
export TESTNET_ADDRESS="yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy"

# Optional: Specify block height to start scanning from
export START_HEIGHT=1363870

# Optional: Override network (defaults to testnet)
export NETWORK=testnet
```

## Test Patterns

### Pattern 1: Find UTXOs from History (HISTORIC mode)
```typescript
const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  network: 'testnet',
  addresses: ['yX3CJJ42...'],
  dapiClient: dapiClient,
  fromHeight: 1000000,
  toHeight: currentHeight,
});

const utxos = await finder.findUTXOs();
const latestUTXO = await finder.findLatestSpendableUTXO();
```

### Pattern 2: Monitor for New Transactions (REALTIME mode)
```typescript
const finder = new TransactionFinder({
  mode: FinderMode.REALTIME,
  network: 'testnet',
  addresses: ['yX3CJJ42...'],
  dapiClient: dapiClient,
});

const cleanup = await finder.monitorAddresses(['yX3CJJ42...'], {
  onTransaction: (tx) => console.log('New TX:', tx.txid),
  onInstantLock: (lock) => console.log('InstantLocked!'),
  onChainLock: (lock) => console.log('ChainLocked!'),
});

// Later...
cleanup();
```

### Pattern 3: Wait for Confirmation (REALTIME mode)
```typescript
const result = await finder.waitForConfirmation(txid, {
  requireChainLock: false,
  timeout: 30000,
  onProgress: (status) => console.log(status),
});

console.log('Confirmed:', result.instantLockHex);
```

## Coverage

Current coverage: ~79% statements, ~82% branches, ~87% functions

Coverage thresholds enforced in vitest.config.ts:
- Lines: 75%
- Functions: 80%
- Branches: 75%
- Statements: 75%

Run `npm run test:coverage` to generate coverage report in `coverage/` directory.

## Common Troubleshooting

### "No UTXOs found for address"
**Cause**: Test address has no transaction history
**Solution**: Use address with known transactions or fund via testnet faucet

### "Cannot connect to DAPI"
**Cause**: Network unreachable
**Solution**: Check internet connection, DAPI nodes may be temporarily down

### "Timeout after 30000ms"
**Cause**: Network slow or nodes unresponsive
**Solution**: Increase timeout in test or wait for network to stabilize

## Related Documentation

- **README.md**: Package overview and quick start
- **API.md**: Complete API reference
- **EXAMPLES.md**: Detailed usage examples
- **MIGRATION.md**: Migration from legacy packages

## Role in SDK Transaction Flow

### Bridge Between RPC Funding and DAPI Operations

TransactionFinder serves as the critical bridge that connects:
- **RPC-funded payments** (from pre-funded wallet during testing)
- **SDK operations** (identity creation, topup) which ALWAYS use DAPI

```
┌─────────────────────────────────────────────────────────────┐
│                     TRANSACTION FLOW                         │
├─────────────────────────────────────────────────────────────┤
│  1. Core RPC sends DASH to derived address                   │
│              ↓                                               │
│  2. TransactionFinder detects via DAPI                       │
│     - Historic: findUTXOs() scans blockchain                 │
│     - Realtime: monitorAddresses() via IS/CL streams         │
│              ↓                                               │
│  3. SDK uses detected UTXOs for asset lock (DAPI)            │
│              ↓                                               │
│  4. TransactionFinder confirms asset lock (DAPI)             │
│     - waitForConfirmation() returns instantLockHex           │
│              ↓                                               │
│  5. SDK creates identity with proof (DAPI)                   │
└─────────────────────────────────────────────────────────────┘
```

### Key Integration Points

#### 1. UTXO Discovery (After RPC Funding)
```typescript
const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,  // For already-confirmed funding
  network: 'testnet',
  addresses: [derivedAddress],
  dapiClient: dapiClient,
  fromHeight: startHeight,
});

const utxos = await finder.findUTXOs();
// Use utxos[0] for asset lock creation
```

#### 2. Realtime Funding Detection
```typescript
const finder = new TransactionFinder({
  mode: FinderMode.REALTIME,
  network: 'testnet',
  addresses: [derivedAddress],
  dapiClient: dapiClient,
});

await finder.monitorAddresses([derivedAddress], {
  onInstantLock: (lock) => {
    // Funding detected via InstantLock - proceed with identity creation
  },
  onChainLock: (lock) => {
    // Additional confirmation
  }
});
```

#### 3. Asset Lock Confirmation
```typescript
// After broadcasting asset lock via DAPI
const confirmation = await finder.waitForConfirmation(assetLockTxid, {
  timeout: 60000,
});

// confirmation.instantLockHex is used for proof in identity creation
```

### Critical Notes

- **TransactionFinder uses DAPI exclusively** - it never uses Core RPC
- **RPC is only for funding** - sending DASH to addresses during testing
- **All SDK operations (asset lock, identity) broadcast via DAPI**
- The `instantLockHex` from confirmation is required for identity proof creation

## ChainLock Architecture (CRITICAL KNOWLEDGE)

This section documents the ChainLock confirmation system and a critical bug fix that prevents missed confirmations due to stale DAPI nodes.

### 1. How ChainLocks Work

ChainLocks provide instant transaction finality on Dash by having Long-Living Masternode Quorums (LLMQs) sign blocks.

**The monitoring flow:**
1. `ChainLockHeightMonitor.poll()` calls DAPI `getEpochsInfo()`
2. Response includes `coreChainLockedHeight` - highest block confirmed by LLMQ
3. Monitor polls every 5 seconds (configurable)
4. `TransactionTracker.recordChainLock()` confirms all transactions at or below this height

### 2. The Stale Node Problem (THE BUG WE FIXED)

**Problem:** DAPI rotates between multiple Platform nodes. Some nodes may be behind in sync by thousands of blocks.

**Symptom:** ChainLock height "jumps backwards" when hitting a stale node, potentially missing confirmations for transactions that were already ChainLocked.

**Real-world example observed during testing:**
```
Poll 1: height = 1413589 (from synced node)
Poll 2: height = 1410263 (from stale node - 3326 blocks behind!)
Poll 3: height = 1413589 (from synced node again)
```

**Impact:** A transaction in block 1411000 would:
- Be confirmed at Poll 1 ✓
- Appear "unconfirmed" at Poll 2 ✗ (height dropped below its block!)
- This caused race conditions and missed confirmations

### 3. The High-Water Mark Solution

**Fix:** Implement a monotonic `highWaterMark` property that NEVER decreases.

```typescript
// In ChainLockHeightMonitor.poll()
if (coreChainLockedHeight > this.highWaterMark) {
  this.highWaterMark = coreChainLockedHeight;
} else if (coreChainLockedHeight < this.highWaterMark) {
  this.logger.debug(
    `Stale node detected: ${coreChainLockedHeight} (using high-water mark: ${this.highWaterMark})`
  );
}

// All confirmation logic uses highWaterMark, not raw response
this.tracker.recordChainLock(this.highWaterMark, timestamp);
```

**Result:**
```
Poll 1: height = 1413589, highWaterMark = 1413589 ✓
Poll 2: height = 1410263, highWaterMark = 1413589 ✓ (kept!)
Poll 3: height = 1413589, highWaterMark = 1413589 ✓
```

### 4. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ChainLock Confirmation Flow                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Platform DAPI (rotates between nodes)                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                         │
│  │ Node A  │  │ Node B  │  │ Node C  │                         │
│  │ (synced)│  │ (stale) │  │ (synced)│                         │
│  │ h=1413k │  │ h=1410k │  │ h=1413k │                         │
│  └────┬────┘  └────┬────┘  └────┬────┘                         │
│       │            │            │                               │
│       └────────────┼────────────┘                               │
│                    ▼                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            ChainLockHeightMonitor.poll()                 │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │ if (height > highWaterMark) highWaterMark = h   │    │   │
│  │  │ else: log "stale node", keep highWaterMark      │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                         │                                │   │
│  │                         ▼                                │   │
│  │  tracker.recordChainLock(highWaterMark, timestamp)       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               TransactionTracker                         │   │
│  │  Confirms all txs where: blockHeight <= highWaterMark    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Test Coverage

The high-water mark implementation is thoroughly tested:

**Unit tests** (`tests/unit/finders/RealtimeFinder.test.ts`):
- 42 tests covering transaction tracking, InstantSend, ChainLock flows

**Integration tests** (`tests/integration/chainlock-only.integration.test.ts`):
- 10 tests specifically for ChainLock confirmation behavior
- Verifies monotonic height behavior with stale node simulation

### 6. Key Files

- `src/monitoring/ChainLockHeightMonitor.ts` - The monitor with high-water mark fix
- `src/monitoring/TransactionTracker.ts` - Records ChainLock confirmations
- `src/finders/RealtimeFinder.ts` - Uses monitor for realtime confirmation tracking

---
*Last Updated: 2026-02-02*
