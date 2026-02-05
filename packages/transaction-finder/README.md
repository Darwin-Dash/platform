# @dashevo/transaction-finder

[![Tests](https://img.shields.io/badge/tests-259%20passing-brightgreen)](#running-tests)
[![Coverage](https://img.shields.io/badge/coverage-79%25-yellow)](#running-tests)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](./tsconfig.json)
[![License](https://img.shields.io/badge/license-MIT-green)](./package.json)

Bridge between Dash Core funding transactions and DAPI Platform operations. Discovers spendable UTXOs via blockchain scanning (Historic mode) and monitors asset lock confirmations via InstantSend and ChainLock (Realtime mode) so the SDK can create identity proofs.

## Use Cases

### 1. Historic UTXO Discovery

Scan the blockchain for spendable UTXOs to fund identity creation and top-up. Uses a bloom filter stream to find transactions at monitored addresses, extracts UTXOs, and selects the best spendable output.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  network: 'testnet',
  addresses: ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
  dapiClient: myDapiClient,
  fromHeight: 1,
});

const utxo = await finder.findLatestSpendableUTXO();
// Use utxo for asset lock creation
```

### 2. Realtime Confirmation Monitoring

Monitor asset lock transactions for InstantSend and ChainLock confirmation. The SDK needs raw InstantLock proof bytes (fast path, ~2s) or ChainLock height (slow fallback, ~30-60s) to create identity proofs on Platform.

```typescript
const finder = new TransactionFinder({
  mode: FinderMode.REALTIME,
  network: 'testnet',
  addresses: ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
  dapiClient: myDapiClient,
});

const stop = await finder.monitorAddresses(['yX3CJJ42...'], {
  onTransaction: (tx) => console.log('TX detected:', tx.txid),
  onInstantLock: (lock) => {
    console.log('IS proof:', lock.instantLockHex);  // Raw bytes for InstantAssetLockProof
  },
  onChainLock: (cl) => console.log('CL at height:', cl.chainLockedHeight),
});

// Pre-register a txid BEFORE broadcasting to ensure IS proof bytes arrive
finder.preRegisterTransaction(assetLockTxid);

// Wait for confirmation
const result = await finder.waitForConfirmation(assetLockTxid);
// result.instantLockHex — raw proof bytes if IS path succeeded
// result.method — 'instantlock' | 'chainlock' | 'timeout'
```

### 3. Address Monitoring

General-purpose payment detection for any address with real-time InstantSend and ChainLock callbacks.

```typescript
const stop = await finder.monitorAddresses(['yPaymentAddr...'], {
  onTransaction: (tx) => console.log('Payment received:', tx.txid),
  onInstantLock: (lock) => console.log('Confirmed in', lock.latency, 'ms'),
  onChainLock: (cl) => console.log('Final at height', cl.chainLockedHeight),
});
```

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       RealtimeFinder                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────┐  ┌──────────────────────────┐ │
│  │  DAPI Bloom Filter Stream        │  │  TransactionStatusPoller │ │
│  │  subscribeToTransactionsWithProofs│  │  polls getTransaction()  │ │
│  │                                  │  │  for IS/CL booleans      │ │
│  │  Delivers:                       │  │                          │ │
│  │  - Raw transactions              │  │  Detects:                │ │
│  │  - MerkleBlocks (block inclusion)│  │  - IS boolean (no bytes) │ │
│  │  - InstantLock proof bytes       │  │  - CL boolean            │ │
│  │                                  │  │                          │ │
│  │  Reconnection:                   │  └──────────────────────────┘ │
│  │  - Periodic (every 60s)          │                                │
│  │  - Paused on preRegister() so    │  ┌──────────────────────────┐ │
│  │    stream stays alive for IS      │  │  ChainLockHeightMonitor  │ │
│  │    proof byte delivery            │  │  polls getEpochsInfo()   │ │
│  │                                   │  │  for CL height           │ │
│  └──────────────────────────────────┘  │                          │ │
│                                         │  High-water mark:        │ │
│  ┌──────────────────────────────────┐  │  monotonic, never drops  │ │
│  │  TransactionTracker              │  │  (stale node protection) │ │
│  │  Tracks tx state through stages: │  └──────────────────────────┘ │
│  │  pending → instantlocked →       │                                │
│  │  chainlocked                     │                                │
│  └──────────────────────────────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
```

### DAPI Stream Behavior

`subscribeToTransactionsWithProofs` only bloom-filter-tests block transactions on the **first block** after connection. For subsequent blocks, DAPI internally relies on ZMQ events from its local Dash Core node, which can miss transactions if the event was dropped. (Our code talks to DAPI via gRPC only — ZMQ is DAPI's internal implementation detail.) Periodic reconnection forces the server to re-run its historical data + mempool scan, catching anything missed.

**DAPI IS Byte Delivery Constraint:**
DAPI only delivers IS bytes for ZMQ events received AFTER the stream opens.
Reconnecting after a tx is IS-locked will NOT deliver IS bytes on the new stream.
Our code ──gRPC──→ DAPI ──(internal ZMQ)──→ Dash Core.

### Two Proof Paths

The SDK creates asset lock proofs via two paths:

**InstantAssetLockProof (fast path, ~2s):**
- Needs `instantLockHex` (raw LLMQ signature bytes) + `transactionHex`
- Created via `AssetLockProof.createInstantAssetLockProof(instantLockBuffer, transactionBuffer, outputIndex)`
- The `instantLockHex` is the LLMQ quorum's cryptographic signature on a SPECIFIC TRANSACTION — only delivered via DAPI stream

**ChainAssetLockProof (slow fallback, ~30-60s):**
- Needs `coreChainLockedHeight` (a number) + `outPoint` (txid + output index)
- Created via `AssetLockProof.createChainAssetLockProof(height, outPoint)`
- No "chain lock hex proof" exists — ChainLocks are on BLOCKS, and Platform already knows its own ChainLock height, so it verifies the tx's block height <= CL height
- Slow because it must wait for block mining + CL + Platform sync

**Fallback behavior:** If `instantLockHex` is available, the SDK creates an InstantAssetLockProof (fast). If not — for any reason (IS failed, stream missed it, poller detected IS boolean only) — there is no way to create an InstantAssetLockProof, and ChainAssetLockProof is the only option. The IS boolean from the poller is informational only; it cannot produce the raw proof bytes needed.

### Grace Period

After `preRegisterTransaction()`:

Periodic reconnection is **paused** (default 15s grace period). The existing gRPC stream stays alive and naturally receives the transaction and IS proof bytes after broadcast. The grace period is extended each time the stream detects a pre-registered tx.

If the poller detects IS without hex bytes, the hex wait in `waitForConfirmation()` gives the live stream time to deliver the proof bytes (no reconnect — DAPI cannot replay historical IS).

Periodic reconnection resumes after:
- All pre-registered txids have received IS proof, OR
- The grace period expires

## SDK Integration

### How `js-evo-sdk` Uses Both Modes

**Historic (UTXO discovery):**
```
findSpendableUTXO() → scans blockchain → returns UTXO for asset lock
```

**Realtime (confirmation monitoring):**
```
preRegisterTransaction(txid) → reconnection PAUSED (stream stays alive)
  → stream receives tx via gRPC subscription
  → IS proof bytes arrive via stream (~1-2s)
  → onInstantLock fires with instantLockHex
  → SDK creates InstantAssetLockProof

  If poller detects IS before stream delivers hex:
  → waitForConfirmation() waits up to instantLockHexWaitMs (8s)
  → hex wait: live stream given time to deliver proof bytes
  → If stream delivers hex during wait → resolves with hex
  → If hex wait expires → resolves without hex → SDK falls back

  If IS proof bytes NOT available:
  → ChainLockHeightMonitor detects CL height >= tx block height
  → SDK creates ChainAssetLockProof (fallback, always works)

waitForConfirmation(txid) → returns { method, instantLockHex, ... }
```

## Configuration Reference

### HistoricFinderConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `FinderMode.HISTORIC` | required | Operating mode |
| `network` | `string` | required | `'mainnet'` / `'testnet'` / `'regtest'` |
| `addresses` | `string[]` | required | Addresses to scan |
| `dapiClient` | `DAPIClientLike` | required | DAPI client instance |
| `fromHeight` | `number` | required | Starting block height |
| `toHeight` | `number` | current tip | Ending block height |
| `requiredAmount` | `number` | — | Minimum satoshis needed |
| `timeout` | `number` | — | Stream timeout (ms) |
| `retries` | `number` | — | Retry attempts |
| `bloomFalsePositiveRate` | `number` | — | Bloom filter FP rate |
| `logLevel` | `string` | — | Log level |
| `onProgress` | `function` | — | Progress callback |

### RealtimeFinderConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `FinderMode.REALTIME` | required | Operating mode |
| `network` | `string` | required | `'mainnet'` / `'testnet'` / `'regtest'` |
| `addresses` | `string[]` | required | Addresses to monitor |
| `dapiClient` | `DAPIClientLike` | required | DAPI client instance |
| `enableDAPIFailover` | `boolean` | — | Enable node failover |
| `dapiNodeRetryDelay` | `number` | — | Min delay before retrying failed node |
| `autoPruneOnConfirmation` | `boolean` | `false` | Auto-remove confirmed txs |
| `maxTrackedTransactions` | `number` | `1000` | Max tracked txs |
| `adaptivePolling` | `boolean` | — | Adaptive CL polling |
| `basePollInterval` | `number` | — | Base CL poll interval (ms) |
| `maxPollInterval` | `number` | — | Max CL poll interval (ms) |
| `minPollInterval` | `number` | — | Min CL poll interval (ms) |
| `enableTransactionPolling` | `boolean` | `true` | Enable IS/CL polling via `getTransaction()` |
| `transactionPollInterval` | `number` | `2000` | TX poll interval (ms, min 1000) |
| `streamReconnectInterval` | `number` | `60000` | Periodic stream reconnect interval (ms). Set to 0 to disable. |
| `reconnectOnPreRegister` | `boolean` | `true` | When true (default), reconnects immediately (0ms delay) for a fresh stream. DAPI streams stall after initial scan — a fresh stream registers a new bloom filter emitter that captures IS events during its scan phase. Call preRegister BEFORE broadcast. When false, only sets grace period. Either way, periodic reconnection is paused for `reconnectGracePeriod` ms. |
| `preRegisterReconnectDelay` | `number` | `0` | Delay (ms) before reconnecting the stream after `preRegisterTransaction()`. Default 0 (immediate) — caller should call preRegister BEFORE broadcast so emitter is registered before IS fires. |
| `reconnectGracePeriod` | `number` | `15000` | Grace period (ms) for IS proof delivery. Reconnection is paused when `preRegisterTransaction()` is called, extended when stream detects the tx. |
| `instantLockHexWaitMs` | `number` | `8000` | How long `waitForConfirmation()` waits for stream to deliver IS proof bytes after poller detects IS (boolean only). No reconnect is triggered — the live stream is given time to deliver. Only applies to pre-registered txids. Set to 0 to disable. |

## Running Tests

### Unit Tests (No Network Required)

```bash
npm run test:unit
npm test                    # unit + integration with mocks
npm run test:coverage       # with coverage report
```

### Real Testnet Tests

#### Historic Mode (UTXO Finding)

```bash
npm test tests/integration/testnet-utxo.spec.ts
```

#### Realtime Mode (InstantSend/ChainLock)

**Manual test** — monitors address, requires you to send DASH during test:

```bash
npm run test:realtime
TESTNET_ADDRESS=yYourAddress TEST_DURATION=300 npm run test:realtime
```

**Automated test** — broadcasts transaction via Dash Core RPC:

```bash
TESTNET_RPC_ENDPOINT=http://localhost:19998 \
TESTNET_RPC_USERNAME=dashrpc \
TESTNET_RPC_PASSWORD=yourpassword \
npm run test:realtime:auto
```

## Installation

```bash
npm install @dashevo/transaction-finder
# or
yarn add @dashevo/transaction-finder
```

## License

MIT

## Support

- Documentation: [Dash Platform Docs](https://docs.dash.org/projects/platform/)
- Issues: [GitHub Issues](https://github.com/dashevo/platform/issues)
- Discord: [Dash Platform Discord](https://discord.gg/dash)
