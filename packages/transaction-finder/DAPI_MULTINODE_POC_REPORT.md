# DAPI-Only Multi-Node POC Report

## Overview

A new proof-of-concept script (`scripts/dapi-multinode-poc.ts`) that tests multi-node InstantSend hex detection **without requiring a local Dash Core RPC node**. Everything runs through DAPI (Decentralized API).

This replaces the RPC dependency in the original `simplified-multinode-poc.ts` with a fully self-contained DAPI workflow.

## Problem

The existing `simplified-multinode-poc.ts` requires `--auto-send` with a local `dashd` RPC node to automate test runs. This means:
- A full Dash Core node must be running locally
- RPC credentials must be configured
- The `dash-rpc-client` package is a hard dependency for automated testing

This limits where and how the POC can be run.

## Solution

Replace the entire RPC-based broadcast flow with DAPI-only operations:

| Step | Before (RPC) | After (DAPI) |
|------|-------------|--------------|
| Find UTXOs | `rpcClient.listUnspent()` | `TransactionFinder` historic scan via `subscribeToTransactionsWithProofs()` |
| Build TX | `rpcClient.createRawTransaction()` + `signTransaction()` | `dashcore-lib` Transaction builder + HD key signing |
| Broadcast | `rpcClient.sendRawTransaction()` | `dapiClient.core.broadcastTransaction()` |
| Monitor IS | Same (parallel streams) | Same (parallel streams) |

## Architecture

### Key Derivation (No WASM Required)

The original `js-evo-sdk` uses the WASM SDK for HD key derivation, which is a heavy dependency. This POC uses **pure dashcore-lib** instead:

```typescript
const mnemonic = new Mnemonic('lamp truck drip ...');
const hdKey = mnemonic.toHDPrivateKey('', 'testnet');
// BIP44: m/44'/1'/0'/0/0
const privateKey = hdKey.deriveChild("m/44'/1'/0'/0/0").privateKey;
```

Verified: derives to the exact same address (`yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy`) as the WASM SDK path.

### UTXO Discovery via DAPI

Uses the existing `TransactionFinder` in `HISTORIC` mode:

```typescript
const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  network: 'testnet',
  addresses: [address],
  dapiClient,
  fromHeight: startHeight,
});
const utxos = await finder.findUTXOs();
```

This scans the blockchain from `START_HEIGHT` using bloom filter streams, extracts UTXOs via the two-pass algorithm in `UTXOExtractor`, and returns spendable outputs.

### Self-Send Transaction

Each run creates a simple self-send transaction:

```typescript
const tx = new Transaction()
  .from(unspentOutput)     // Previous UTXO
  .to(sameAddress, amount - 500)  // Self-send minus 500 duff fee
  .sign(privateKey);       // Sign with mnemonic-derived key
```

- Fee: 500 duffs (~0.000005 DASH) per transaction
- Output goes back to the same address
- Transaction is a standard P2PKH type 0

### DAPI Broadcast

```typescript
const txid = await dapiClient.core.broadcastTransaction(
  Buffer.from(txHex, 'hex')
);
```

Uses the DAPI client's built-in retry and failover logic.

### UTXO Chaining Across Runs

This is the key innovation for multi-run testing without RPC:

```
Run 1: Historic scan -> confirmed UTXO -> self-send -> broadcast -> monitor IS
Run 2: Use Run 1's output (IS-locked) -> self-send -> broadcast -> monitor IS
Run 3: Use Run 2's output (IS-locked) -> self-send -> broadcast -> monitor IS
...
Run N: Use Run N-1's output -> self-send -> broadcast -> monitor IS
```

**Why this works:**
- Dash allows spending unconfirmed UTXOs that are InstantSend-locked
- We know the exact output UTXO because we built the transaction (same address, known amount, vout=0)
- Between runs, we poll `core.getTransaction(txid)` to verify `isInstantLocked === true`
- If IS confirmation times out, we still proceed (Dash mempool accepts chained unconfirmed spends)

**Between-run flow:**
1. Run completes, we have `nextUTXO = { txId, vout: 0, satoshis: prevAmount - 500 }`
2. Poll `getTransaction(txid)` every 2s for up to 30s waiting for `isInstantLocked`
3. If confirmed: use as input for next run
4. If timeout: wait 15s for mempool propagation, then use anyway
5. Wait configurable delay (default 15s) before next run

**Fee budget:**
- 10 runs consume 5,000 duffs (0.00005 DASH) in fees
- Starting UTXO of 100,000 duffs can support ~199 chained runs

## DAPI Methods Used

| Method | Purpose |
|--------|---------|
| `core.getBestBlockHeight()` | Get current blockchain height |
| `core.subscribeToTransactionsWithProofs()` | Historic scan + realtime stream monitoring |
| `core.subscribeToBlockHeadersWithChainLocks()` | Header pre-sync for historic scan (via TransactionFinder) |
| `core.broadcastTransaction()` | Broadcast self-send transaction |
| `core.getTransaction()` | Poll for IS/CL confirmation, TX detection backup |

## Features Retained from Original POC

All IS detection features from `simplified-multinode-poc.ts` are preserved:

- **N parallel streams** with deduplication tracker
- **3 reconnection strategies**: stale-detection, aggressive-single, staggered-multi
- **TX detection poller** as backup for stream detection
- **ChainLock fallback** with multi-node polling
- **Healthy node tracking** with promote/demote logic
- **IS-only mode** for faster testing (skips CL fallback)
- **Per-run and aggregate statistics**

## CLI Usage

```bash
# Single run (all defaults from .env)
yarn poc:dapi

# 10 IS-only runs with healthy node tracking
yarn poc:dapi -- --runs 10 --is-only --use-healthy-nodes

# Custom strategy and timeout
yarn poc:dapi -- --runs 5 --strategy staggered-multi --is-timeout 15000

# Override .env settings
yarn poc:dapi -- --address yXxx... --mnemonic "word1 word2 ..." --start-height 1380190
```

### All Options

```
--runs N              Number of test runs (default: 1)
--nodes N             Number of parallel streams (default: 3)
--delay MS            Delay between runs in ms (default: 15000)
--network NET         Network: testnet or mainnet (default: from .env)
--is-timeout MS       IS hex timeout in ms (default: 10000)
--cl-timeout MS       ChainLock timeout in ms (default: 180000)
--strategy STRAT      Reconnection strategy (default: stale-detection)
--is-only             Skip ChainLock fallback, IS hex only (faster)
--use-healthy-nodes   Use known healthy nodes from is-node-health.json
--address ADDR        Override testnet address (default: from .env)
--mnemonic PHRASE     Override mnemonic (default: from .env)
--start-height N      Override start height (default: from .env)
```

### Environment Variables (from `../js-evo-sdk/.env`)

```
MNEMONIC              BIP39 mnemonic for key derivation
TESTNET_ADDRESS       Address to monitor (BIP44 m/44'/1'/0'/0/0)
START_HEIGHT          Block height to start historic scan from
NETWORK               Network (testnet/mainnet)
```

## Dependencies

| Dependency | Purpose | Notes |
|-----------|---------|-------|
| `@dashevo/dapi-client` | DAPI communication | Already a devDependency |
| `@dashevo/dashcore-lib` | TX building, key derivation, bloom filters | Already a peerDependency |
| `@dashevo/transaction-finder` | Historic UTXO scan | The package itself |
| `dotenv` | .env loading | Already a devDependency |

**Removed dependency:** `@dashevo/dash-rpc-client` is NOT required by this script.

## Files Changed

| File | Change |
|------|--------|
| `scripts/dapi-multinode-poc.ts` | New script (656 lines) |
| `package.json` | Added `poc:dapi` yarn script |

## Verification

The following were verified in the sandbox environment before network access was needed:

1. **Key derivation**: Mnemonic derives to correct address `yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy` using pure dashcore-lib (no WASM)
2. **Transaction building**: Self-send TX builds, signs, and serializes correctly (192 bytes, valid hash)
3. **Script startup**: Parses args, loads .env, derives key, starts historic scan
4. **Network blocked**: DAPI connections blocked by sandbox proxy (403 `host_not_allowed`) - must run on local machine with testnet access

## Expected Results

Based on the original `simplified-multinode-poc.ts` findings:
- **TX detection rate**: ~100% (stream + poller backup)
- **IS hex capture rate**: ~60% (DAPI limitation - IS hex only delivered during active scan phase)
- **CL fallback**: Catches remaining ~40% when IS hex is missed (unless `--is-only` mode)

The DAPI-only broadcast should not affect these rates since the IS hex delivery depends on DAPI node ZMQ configuration, not on how the transaction was broadcast.
