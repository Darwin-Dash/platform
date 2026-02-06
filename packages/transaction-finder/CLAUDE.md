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

### Environment File Location

**The RPC credentials are stored in the js-evo-sdk package's `.env` file:**

```
../js-evo-sdk/.env
```

The test file automatically loads this via dotenv:
```typescript
import { config } from 'dotenv';
config({ path: '../js-evo-sdk/.env' });
```

The shell script (`scripts/test-reliability.sh`) also sources this file.

**No manual `export` commands needed** - just run the test directly.

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
│                     ON-DEMAND TRANSACTION FLOW                    │
├──────────────────────────────────────────────────────────────────┤
│  1. Start monitoring BEFORE transactions are sent                 │
│     → Parallel streams opened to multiple DAPI nodes             │
│              ↓                                                    │
│  2. Someone sends DASH to monitored address                       │
│     (we don't know the txid beforehand)                          │
│              ↓                                                    │
│  3. TransactionFinder (REALTIME) detects via parallel streams:    │
│     a. onTransaction fires with txid and transaction data         │
│     b. Multi-node IS hunting finds node with rawtxlocksig enabled │
│     c. onInstantLock fires with instantLockHex                    │
│              ↓                                                    │
│  4. waitForConfirmation() returns { instantLockHex, ... }         │
│              ↓                                                    │
│  5. SDK creates InstantAssetLockProof with raw bytes              │
│     (or falls back to ChainAssetLockProof if no hex available)    │
│              ↓                                                    │
│  6. SDK creates identity on Platform                              │
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

#### 2. On-Demand Transaction Monitoring (Realtime)
```typescript
const finder = new TransactionFinder({
  mode: FinderMode.REALTIME,
  network: 'testnet',
  addresses: [derivedAddress],
  dapiClient: dapiClient,
  multiNodeIsHunting: true,  // Parallel streams for IS hex capture
  isHuntingNodes: 3,         // Number of parallel streams
});

// Start monitoring BEFORE transactions are sent
await finder.monitorAddresses([derivedAddress], {
  onTransaction: (tx) => {
    // Transaction detected - txid comes from callback
    console.log('Detected:', tx.txid);
  },
  onInstantLock: (lock) => {
    // lock.instantLockHex — raw bytes for InstantAssetLockProof
    // Captured from parallel streams to multiple DAPI nodes
  },
  onChainLock: (cl) => {
    // cl.chainLockedHeight — height for ChainAssetLockProof (fallback)
  }
});

// Transaction is sent to the address by user/wallet (we don't know txid)
// Callbacks fire with all the data we need

// Wait for confirmation using txid from callback
const confirmation = await finder.waitForConfirmation(detectedTxid, {
  timeout: 60000,
});

// confirmation.instantLockHex — present if IS proof arrived via parallel streams
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
after connection. For subsequent blocks, DAPI internally relies on ZMQ `rawtx` events from its
local Dash Core node, which can miss transactions if the event was dropped. (Note: our code talks
to DAPI via gRPC only — ZMQ is DAPI's internal implementation detail, not something we control.)

**Why reconnection exists:** Forces DAPI to re-run its historical + mempool scan, catching missed txs.

**Why preRegisterTransaction reconnects immediately:** DAPI streams stall after the initial
historical + mempool scan — no new ZMQ events are delivered (empirically confirmed: 30+ seconds
of silence). When `preRegisterTransaction()` is called, it reconnects immediately (0ms delay)
for a fresh stream. The new stream registers a bloom filter emitter on the DAPI server BEFORE
historical blocks are sent, so IS events arriving during the scan are cached and flushed after
MEMPOOL_DATA_SENT. The caller should invoke preRegister BEFORE broadcasting to maximize the
IS capture window. A grace period prevents periodic reconnects from interfering.

**DAPI IS Byte Delivery Constraint:**
DAPI only delivers IS bytes for ZMQ events received AFTER the stream opens.
Reconnecting after a tx is IS-locked will NOT deliver IS bytes on the new stream.
Our code ──gRPC──→ DAPI ──(internal ZMQ)──→ Dash Core.

### Critical Notes

- **TransactionFinder uses DAPI exclusively** — it never uses Core RPC
- **RPC is only for funding** — sending DASH to addresses during testing
- **All SDK operations (asset lock, identity) broadcast via DAPI**
- The `instantLockHex` from confirmation is required for InstantAssetLockProof creation
- **Duplicate prevention:** `onTransaction` fires exactly once per unique txid (reconnections skip known txids)
- **On-demand detection:** All transaction data comes from callbacks - no need to know txid beforehand

## Stream Reconnection Architecture (CRITICAL KNOWLEDGE)

### The Problem

The DAPI gRPC stream (`subscribeToTransactionsWithProofs`) may miss transactions between
reconnections. DAPI internally uses ZMQ events from its local Dash Core node to detect new
transactions — if a ZMQ event is dropped, the transaction is silently missed. (Note: our code
communicates with DAPI via gRPC only; ZMQ is DAPI's internal implementation detail.)

To catch missed transactions, the stream reconnects periodically (every 60s by default).

### The Solution: Parallel Multi-Node Streams

When `monitorAddresses()` is called with multi-node IS hunting enabled (default):
1. **Primary stream**: Handles all callbacks (onTransaction, onInstantLock, etc.)
2. **Parallel streams**: Additional streams to other DAPI nodes for IS hex capture

This approach maximizes the chance of connecting to a DAPI node that has `rawtxlocksig` ZMQ
enabled, which is required for IS hex delivery.

### Duplicate Prevention

Each reconnection re-delivers transactions from mempool. The `processStream()` method checks
`tracker.getTransaction(txid)` before firing `onTransaction` — if the tracker already knows the
txid, the callback is skipped. This ensures `onTransaction` fires exactly once per unique txid.

### Key Files

- `src/finders/RealtimeFinder.ts` — Parallel streams, duplicate prevention, reconnection
- `src/types/finder-types.ts` — `instantLockHexWaitMs` config field
- `src/monitoring/TransactionTracker.ts` — Transaction state tracking and deduplication

## Multi-Node IS Hex Hunting

This section documents the multi-node InstantSend hex hunting system that increases the odds of receiving IS proof bytes from DAPI nodes.

### The Problem

Most DAPI testnet nodes don't have ZMQ `rawtxlocksig` enabled in their Dash Core configuration. When connected to a node WITHOUT this enabled, IS hex is never delivered — even though the transaction is InstantSend-locked. The poller detects `isInstantLocked: true` but without raw proof bytes, the SDK must fall back to the slow ChainLock path.

### The Solution: Multi-Node IS Hunting

When `preRegisterTransaction()` is called, the system:
1. Opens parallel gRPC streams to multiple DAPI nodes (default: 3)
2. Races all streams for IS hex delivery (first valid hex wins)
3. Tracks node health — blacklists nodes that fail IS hex delivery
4. Falls back to ChainLock after timeout (default: 3 seconds)

### How It Works

```
monitorAddresses(['yAddr...'], callbacks)
    │
    ├─► Open primary stream + parallel streams to DAPI nodes
    │   Each stream: subscribeToTransactionsWithProofs(bloomFilter, fromHeight)
    │
    ├─► Wait for transaction to be sent to the monitored address
    │
    ├─► Transaction detected:
    │   ├─ onTransaction fires with txid and transaction data
    │   ├─ Auto-trigger multi-node IS hunt for the detected txid
    │   └─ Race: wait for IS hex from ANY stream
    │       ├─ Node A delivers IS hex ─► onInstantLock fires with hex
    │       ├─ Node B delivers IS hex ─► onInstantLock fires with hex
    │       ├─ Node C delivers IS hex ─► onInstantLock fires with hex
    │       └─ Timeout, no hex ─► fall back to ChainLock
    │
    └─► Track node health:
        - Node delivered IS hex ─► mark as "good" (success)
        - Node in race but didn't win ─► increment failure count
```

### Configuration Options

```typescript
const finder = new TransactionFinder({
  mode: FinderMode.REALTIME,
  network: 'testnet',
  addresses: [myAddress],
  dapiClient: dapiClient,

  // Multi-node IS hunting (all enabled by default)
  multiNodeIsHunting: true,           // Enable parallel IS hunting
  isHuntingNodes: 3,                  // Number of nodes to connect to
  isHuntingTimeoutMs: 3000,           // Timeout before ChainLock fallback
  isHuntingBlacklistThreshold: 1,     // Blacklist after N consecutive failures
});
```

### Node Health API

```typescript
// Get node health statistics
const health = finder.getNodeHealth();

console.log('Total tracked:', health.totalTracked);
console.log('Healthy nodes:', health.healthy);
console.log('Blacklisted:', health.blacklisted);

// Per-node statistics
for (const [addr, stats] of health.nodeStats) {
  console.log(`${addr}: ${stats.successes} successes, ${stats.failures} failures`);
}
```

### Why This Design?

**Why 3 nodes?**
- Provides redundancy without excessive resource usage
- If 1 in 3 testnet nodes has rawtxlocksig enabled, we have good odds
- Parallel connections are cheap (just gRPC streams)

**Why first-wins (no consensus)?**
- IS hex is cryptographically signed by LLMQ — can't be faked
- All nodes should return the same hex for a given txid
- Speed matters more than consensus for this use case

**Why immediate blacklist?**
- Nodes without rawtxlocksig are deterministically broken
- No point retrying — they will never deliver IS hex
- Fast learning = better experience for subsequent transactions

**Why in-memory only?**
- Session-scoped blacklist resets on restart
- Node configuration may change between sessions
- Simple, no persistence complexity

### Parallel Streams Architecture

When `monitorAddresses()` is called with `multiNodeIsHunting` enabled (default), parallel streams
are opened automatically:

```
monitorAddresses(['yAddr...'], callbacks)
    │
    ├─► Primary stream (handles all callbacks: onTransaction, onInstantLock, etc.)
    │
    ├─► Parallel stream 1 (IS hex capture only)
    │
    └─► Parallel stream 2 (IS hex capture only)
        │
        └─► When ANY stream captures IS hex → onInstantLock fires with hex
```

**Parallel streams only process InstantLock messages** to avoid duplicate `onTransaction` callbacks.
When any parallel stream captures IS hex for a monitored transaction, it records the hex and fires
`onInstantLock` if the callback is defined.

### Key Files

- `src/monitoring/NodeHealthTracker.ts` — Tracks node health/blacklist
- `src/monitoring/MultiNodeIsHunter.ts` — Parallel stream management (for preRegisterTransaction)
- `src/finders/RealtimeFinder.ts` — Integration with main finder, parallel streams for on-demand
- `src/types/finder-types.ts` — Configuration options

## InstantLock Hex Race Condition (CRITICAL KNOWLEDGE)

### The Problem

The poller (`TransactionStatusPoller`) and the DAPI stream race to detect InstantSend. The poller
calls `getTransaction()` which returns a boolean `isInstantLocked` (no raw proof bytes). The stream
delivers raw IS proof bytes (`instantLockHex`) needed for `InstantAssetLockProof`.

When the poller wins the race (~5s vs stream's ~5-10s), two bugs prevented hex delivery:

**Bug 1 — Tracker rejected hex:** `recordInstantLock()` had a guard `if (!tx.instantLockTime)` that
rejected the stream's hex delivery because the poller had already set `instantLockTime`.

**Bug 2 — waitForConfirmation resolved without hex:** Once the poller set status to `instantlocked`,
`waitForConfirmation()` resolved immediately with `instantLockHex: null`. Even if the stream
delivered hex 1-2s later, the SDK had already received a result without hex.

### The Fix (Three Parts)

**1. TransactionTracker always accepts hex:** `recordInstantLock()` now stores `instantLockHex`
whenever provided, even if `instantLockTime` was already set by the poller. The hex is stored
independently of whether this is a "new" IS detection.

**2. Stream IS handler fires callback on hex delivery:** The `processStream()` IS handler now fires
`onInstantLock` when hex is newly delivered (even if `wasNew` is false because the poller already
recorded IS). Pre-registered txid cleanup also triggers on hex delivery.

**3. waitForConfirmation hex wait:** When IS is detected without hex for pre-registered txids,
`waitForConfirmation()` waits up to `instantLockHexWaitMs` (default 5s) for the stream to deliver
hex. Non-pre-registered txids resolve immediately (no hex wait). Config: `instantLockHexWaitMs`.

### Race Condition Timeline (Fixed)

```
t=0.0s  preRegisterTransaction() → reconnect (HUNT phase)
t=0.5s  Stream reconnects, doesn't find tx in mempool yet
t=4.8s  Poller: getTransaction() → isInstantLocked=true
        → tracker.recordInstantLock(txid, timestamp)  [no hex]
        → tx.instantLockTime SET, tx.instantLockHex = null
        → waitForConfirmation(): IS detected without hex, starts hex wait
t=5.5s  Stream delivers IS proof bytes
        → tracker.recordInstantLock(txid, ts, hexBytes)
        → hex ACCEPTED (Bug 1 fixed: always stores hex)
        → onInstantLock fires with hex (Bug 2a fixed: fires on hex delivery)
        → waitForConfirmation() re-checks: hex now available, resolves with hex
t=5.5s  SDK proof manager: hex available → creates InstantAssetLockProof (fast path!)
```

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
*Last Updated: 2026-02-05*
