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
┌──────────────────────────────────────────────────────────────────┐
│                     TRANSACTION FLOW                              │
├──────────────────────────────────────────────────────────────────┤
│  1. Core RPC sends DASH to derived address                        │
│              ↓                                                    │
│  2. TransactionFinder (HISTORIC) detects via DAPI                 │
│     - findUTXOs() / findLatestSpendableUTXO()                    │
│              ↓                                                    │
│  3. SDK creates asset lock tx using UTXO                          │
│              ↓                                                    │
│  4. SDK calls preRegisterTransaction(assetLockTxid)               │
│     → Immediate reconnect + HUNT mode (reconnection continues)    │
│              ↓                                                    │
│  5. SDK broadcasts asset lock via DAPI                            │
│              ↓                                                    │
│  6. TransactionFinder (REALTIME) confirms:                        │
│     a. HUNT: reconnections continue until mempool scan finds tx   │
│     b. WAIT: grace period starts, stream stays alive              │
│     c. IS proof bytes arrive via stream (~1-2s)                   │
│     d. onInstantLock fires with instantLockHex                    │
│              ↓                                                    │
│  7. waitForConfirmation() returns { instantLockHex, ... }         │
│              ↓                                                    │
│  8. SDK creates InstantAssetLockProof with raw bytes              │
│     (or falls back to ChainAssetLockProof if no hex available)    │
│              ↓                                                    │
│  9. SDK creates identity on Platform                              │
└──────────────────────────────────────────────────────────────────┘
```

### Key Integration Points

#### 1. UTXO Discovery (After RPC Funding)
```typescript
const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  network: 'testnet',
  addresses: [derivedAddress],
  dapiClient: dapiClient,
  fromHeight: startHeight,
});

const utxos = await finder.findUTXOs();
// Use utxos[0] for asset lock creation
```

#### 2. Asset Lock Confirmation (Realtime)
```typescript
const finder = new TransactionFinder({
  mode: FinderMode.REALTIME,
  network: 'testnet',
  addresses: [derivedAddress],
  dapiClient: dapiClient,
});

await finder.monitorAddresses([derivedAddress], {
  onInstantLock: (lock) => {
    // lock.instantLockHex — raw bytes for InstantAssetLockProof (from stream)
    // lock.instantLockHex is undefined when detected by poller (boolean only)
  },
  onChainLock: (cl) => {
    // cl.chainLockedHeight — height for ChainAssetLockProof (fallback)
  }
});

// Pre-register BEFORE broadcasting to enable grace period
finder.preRegisterTransaction(assetLockTxid);

// Wait for confirmation
const confirmation = await finder.waitForConfirmation(assetLockTxid, {
  timeout: 60000,
});

// confirmation.instantLockHex — present if IS proof arrived via stream
// confirmation.method — 'instantlock' | 'chainlock' | 'timeout'
```

### Two Proof Paths (Critical Knowledge)

**InstantAssetLockProof (fast, ~2s):**
- Needs `instantLockHex` (raw LLMQ signature bytes) + `transactionHex`
- `instantLockHex` is the LLMQ quorum's cryptographic signature on a SPECIFIC TRANSACTION
- Only delivered via DAPI stream (polling gives boolean only)
- The stream must stay alive after detecting the tx so the IS message arrives

**ChainAssetLockProof (slow fallback, ~30-60s):**
- Needs `coreChainLockedHeight` (just a NUMBER) + `outPoint` (txid + output index)
- No "chain lock hex proof" exists — ChainLocks are on BLOCKS
- Platform already knows its own CL height; it just verifies tx's block height <= CL height
- Slow because: block mining + CL signing + Platform sync all must happen

**Why IS without hex falls back to CL:**
Without `instantLockHex` there is NO way to create an `InstantAssetLockProof`, period. The IS
boolean from the poller is informational only — it confirms the tx is IS-locked but provides none
of the raw LLMQ signature bytes needed for the proof. ChainLock is the only option when
`instantLockHex` is unavailable. ChainLock must always work — it's the safety net.

### DAPI Stream Behavior (Architectural Context)

`subscribeToTransactionsWithProofs` only bloom-filter-tests block transactions on the **first block**
after connection. For subsequent blocks, it relies on internal ZMQ `rawtx` events which can miss
transactions if the event was dropped.

**Why reconnection exists:** Forces DAPI to re-run its historical + mempool scan, catching missed txs.

**Why two-phase grace period exists:** A single reconnect after `preRegisterTransaction()` may miss
the tx due to P2P propagation delay. HUNT phase keeps reconnecting until the tx is found. Once found,
WAIT phase pauses reconnection so the stream stays alive for IS proof byte delivery (~1-2s after
detection). Without WAIT, the periodic reconnect would kill the stream before the IS message arrives.

### Critical Notes

- **TransactionFinder uses DAPI exclusively** — it never uses Core RPC
- **RPC is only for funding** — sending DASH to addresses during testing
- **All SDK operations (asset lock, identity) broadcast via DAPI**
- The `instantLockHex` from confirmation is required for InstantAssetLockProof creation
- **Duplicate prevention:** `onTransaction` fires exactly once per unique txid (reconnections skip known txids)

## Stream Reconnection Architecture (CRITICAL KNOWLEDGE)

### The Problem

The DAPI bloom filter stream (`subscribeToTransactionsWithProofs`) only tests transactions against
the bloom filter on the first block after connection. Subsequent blocks rely on ZMQ events that can
be missed. To catch missed transactions, the stream reconnects periodically (every 10s by default).

However, periodic reconnection **conflicts with IS proof delivery**: when the stream has found
an asset lock transaction, the SDK needs the raw InstantLock proof bytes that arrive ~1-2s later.
If the periodic reconnect kills the stream before those bytes arrive, the SDK falls back to the
slow ChainLock path (~30-60s instead of ~2s).

### The Fix: Two-Phase Grace Period

**Phase 1 — HUNT:** After `preRegisterTransaction()`, reconnection **continues normally** (every
10s). Each reconnect forces DAPI to re-scan mempool. This is necessary because a single reconnect
may miss the tx due to P2P propagation delay.

**Phase 2 — WAIT:** When the stream detects a pre-registered txid, the grace period **starts now**
(default 15s). Reconnection pauses. IS proof bytes arrive ~1-2s later. Grace clears when all
pre-registered txids have IS proof, or on expiry.

After `preRegisterTransaction()`:
1. Immediate reconnect triggers (DAPI mempool scan tries to pick up the tx)
2. HUNT: periodic reconnection **continues** — each reconnect re-scans mempool
3. Stream finds the pre-registered tx → WAIT phase starts
4. Reconnection **paused** for `reconnectGracePeriod` (default 15s)
5. IS proof bytes arrive → `onInstantLock` fires with `instantLockHex`
6. Grace period ends early when all pre-registered txids have IS proof
7. Periodic reconnection resumes

### Duplicate Prevention

Each reconnection re-delivers transactions from mempool. The `processStream()` method checks
`tracker.getTransaction(txid)` before firing `onTransaction` — if the tracker already knows the
txid, the callback is skipped. This ensures `onTransaction` fires exactly once per unique txid.

### Key Files

- `src/finders/RealtimeFinder.ts` — Grace period logic, duplicate prevention, reconnection
- `src/types/finder-types.ts` — `reconnectGracePeriod` config field
- `src/monitoring/TransactionTracker.ts` — Transaction state tracking and deduplication

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
