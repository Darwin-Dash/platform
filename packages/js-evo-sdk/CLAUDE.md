# CLAUDE.md - js-evo-sdk

This file provides guidance to Claude Code when working with the js-evo-sdk package.

## Package Overview

The js-evo-sdk is a comprehensive JavaScript/TypeScript SDK for interacting with Dash Platform. It provides facades for identities, DPNS, documents, tokens, DashPay, and more.

## Commands

```bash
# Run all unit tests (Vitest)
yarn test:unit

# Run integration tests
yarn test:integration

# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run E2E tests (Playwright)
yarn test:e2e

# TypeScript type checking
yarn tsc -p tsconfig.json --noEmit

# Build the package
yarn build
```

## Architecture

### Facade Pattern

The SDK uses a facade pattern to provide clean APIs:

```
src/
├── identities/facade.ts    # Identity operations
├── dpns/facade.ts          # DPNS name registration/resolution
├── documents/facade.ts     # Document CRUD operations
├── tokens/facade.ts        # Token operations
├── dashpay/facade.ts       # DashPay profiles and contacts
├── addresses/facade.ts     # Address-based operations
├── protocol/facade.ts      # Protocol queries
├── epoch/facade.ts         # Epoch information
└── system/facade.ts        # System status
```

### Test Structure

```
tests/
├── unit/facades/           # Unit tests with mocked WASM (Vitest)
├── unit/errors/            # Error class tests
├── integration/            # Integration tests with real WASM (Vitest)
└── setup.ts                # Test setup and mock utilities
```

## Testing Framework

The SDK uses **Vitest** for all unit and integration tests:

### Vitest Patterns

**Mock Creation:**
```typescript
import { vi, Mock } from 'vitest';

// Create mocks in beforeEach to ensure fresh state
beforeEach(() => {
  mockWasmSdk = {
    getIdentity: vi.fn().mockResolvedValue(mockIdentity),
    // ...
  };
});
```

**Assertions:**
```typescript
expect(mock).toHaveBeenCalledOnce();
expect(mock).toHaveBeenCalledWith(arg1, arg2);
expect(result).toEqual(expected);
expect(result).toBeInstanceOf(Map);
```

**Error Testing:**
```typescript
await expect(someFunction()).rejects.toThrow('error message');
```

### Test Coverage Status

- 381 unit tests across 21 test files
- All facades have error scenario coverage
- Integration tests require WASM SDK

## Development Learnings

### Mock Patterns
- Create mocks inside `beforeEach()` to ensure fresh state each test
- Module-level mocks get cleared by `vi.clearAllMocks()` - use `beforeEach` to recreate
- When testing facades that use `sdk.getWasmSdkConnected()`, mock both the SDK and WASM SDK:
  ```typescript
  mockEvoSdk = {
    getWasmSdkConnected: vi.fn().mockResolvedValue(mockWasmSdk),
  };
  ```

### Error Testing
- CreditOperations wraps errors with prefix - use `.include()` not `.equal()` for messages
- Amount validation happens before WASM stub - use valid amounts when testing other error paths
- `getIdentityIds()` creates its own DAPIClient internally - needs integration testing, not unit testing

## Critical SDK Knowledge

### Asset Lock Confirmation Strategy

Asset lock transactions (for identity creation/topup) can be confirmed via **InstantLock OR ChainLock** - whichever comes first:

- **InstantLock** (fast path, ~2 seconds): LLMQ-based instant confirmation
- **ChainLock** (fallback, ~30-60 seconds): Block-based confirmation with LLMQ signature

The code polls for both and uses whichever confirms first. This is NOT a two-step process requiring both - **either proof type is sufficient** for creating identity/topup transactions.

See `src/identities/coordination/asset-lock-proof-manager.ts` for implementation.

### Transaction Detection Modes

The SDK uses `@dashevo/transaction-finder` with two modes:

- **Historic Mode** (`FinderMode.HISTORIC`): Scans blockchain for existing UTXOs
  - Used by `sdk.identities.findSpendableUTXO()`
  - For "Already sent" funding flow
  - Implemented in `src/identities/coordination/utxo-finder.ts`

- **On-Demand Mode** (`FinderMode.REALTIME`): Monitors for incoming transactions
  - Used by `AssetLockProofManager.waitForConfirmation()`
  - For "Sending now" funding flow
  - Emits events when InstantLock or ChainLock detected
  - Implemented in `src/identities/coordination/wallet-coordinator.ts`

### Demo App Real Mode

The demo app's `TransactionFinderService` (`demo/web/services/transaction-finder-service.js`) supports both mock and real modes:

- **Mock mode**: Simulates transaction detection for testing
- **Real mode**: Uses SDK's `findSpendableUTXO()` and REALTIME TransactionFinder

Real mode requires:
- SDK instance (`service.setSDK(sdk)`)
- Mnemonic (`service.setMnemonic(mnemonic)`)

### WASM Module Corruption: NEVER Import `@dashevo/dapi-client` Statically

**`@dashevo/dapi-client` loads `wasm-dpp` at import time. If `wasm-dpp` and `wasm-sdk` are both loaded in the same JS runtime, `wasm-sdk` state is corrupted and all proved WASM operations (getIdentity, getIdentityBalance, etc.) will hang indefinitely.**

Symptoms:
- `getIdentity()` hangs forever for real identities but works for non-existent ones
- `getIdentityBalance()` hangs forever
- Any proved fetch operation never returns

Rules:
1. **NEVER** use `import DAPIClient from '@dashevo/dapi-client'` (static runtime import)
2. **ALWAYS** use `import type DAPIClientType from '@dashevo/dapi-client'` for type annotations
3. **ALWAYS** use `const { default: DAPIClient } = await import('@dashevo/dapi-client')` when you actually need an instance
4. **DEFER** the dynamic import as late as possible — ideally only in the code path that needs it, not in `beforeAll` or module scope
5. This applies to ALL files: source code, tests, scripts

The source files (`wallet-coordinator.ts`, `utxo-finder.ts`, `identity-creator.ts`, `identity-updater.ts`) already follow this pattern. Test files must too.

See `docs/WASM_SDK_TESTNET_RWLOCK_ISSUE.md` for full investigation details.

### WASM Concurrency: All Lock Sources Are Fixed

Two fixes resolved all WASM lock issues:
1. **Cache `RwLock` → `Mutex`** (`rs-sdk/src/mock/provider.rs`) — prevents LRU cache deadlocks in single-threaded WASM async.
2. **ArcSwap lock-free caches** (`rs-dapi-client` address list) — eliminates lock contention on reads.

The `WASM_REQUEST_SERIALIZER` was **removed** — it forced all gRPC calls to execute sequentially, but analysis of `tonic-web-wasm-client` v0.8.0 confirmed each `fetch()` creates an independent `Response` with its own `ReadableStream`. The "already locked to a reader" errors were caused by the cache `RwLock` and context provider `Mutex` (fixed above), not by concurrent gRPC calls. gRPC requests now run concurrently in WASM.

Other `RwLock` usage in the codebase is safe for WASM:
- `CURRENT_PLATFORM_VERSION` (`rs-dpp/src/version/mod.rs`) — all call sites are synchronous, no lock held across `.await`.
- `DriveCache` (`rs-drive/src/cache/mod.rs`) — uses `parking_lot::RwLock` but only compiles under the "server" feature, not the "verify" feature used by WASM.

The worker process (`workers/wasm-operations.js`) provides additional isolation by running WASM in a child process with sequential sub-batch processing and `resetWasmSdk()` between batches.

If "already locked to a reader" errors reappear, check:
1. The WASM binary has been rebuilt (`cd packages/wasm-sdk && ./build.sh`)
2. `max_decoding_message_size` is set for large gRPC responses (exists on `feat-wasm-sdk-rwlock-fix` branch)

### Asset Lock Transactions: Change MUST Go to Source Address

When creating asset lock transactions (identity creation or top-up), change **must always** be routed back to the source address — the address that owns the input UTXO. This is the default (`useSourceAsChangeAddress = true`) in both `identity-creator.ts` and `identity-updater.ts`.

**Do not change this default.** Routing change to a different address (e.g., an internal HD wallet change address) would make the funds invisible to `findSpendableUTXO()` and TransactionFinder, which only scan known external addresses.

## RPC Client for Testing

For E2E tests that need to send real transactions (e.g., funding wallet addresses), use the `@dashevo/dash-rpc-client` package:

```typescript
import { DashRpcClient } from '@dashevo/dash-rpc-client';

const rpcClient = new DashRpcClient({
  network: 'testnet',
  url: process.env.TESTNET_RPC_ENDPOINT,
  user: process.env.TESTNET_RPC_USERNAME,
  pass: process.env.TESTNET_RPC_PASSWORD,
  wallet: process.env.TESTNET_WALLET,  // Pre-funded wallet
});

// Send DASH to derived address (for funding)
const txid = await rpcClient.sendToAddress(address, 0.001);

// List UTXOs
const utxos = await rpcClient.listUnspent(0, 9999999, [address]);

// Get new address
const newAddress = await rpcClient.getNewAddress();
```

**CRITICAL: RPC is for FUNDING only, not SDK operations.**
SDK operations (identity creation, topup, etc.) ALWAYS use DAPI. The RPC client is only used to fund addresses during E2E tests when a pre-funded wallet is available.

### Environment Variables for RPC

RPC credentials are stored in `.env` in this package:

```bash
# Required for real blockchain E2E tests
TESTNET_RPC_ENDPOINT=http://localhost:19998
TESTNET_RPC_USERNAME=dash
TESTNET_RPC_PASSWORD=dash
TESTNET_WALLET=platformcli  # Pre-funded wallet with testnet DASH
```

### Running Real Blockchain Tests

With RPC configured, run real transaction tests:

```bash
# On-demand transaction detection (realtime mode)
yarn test:e2e demo/tests/e2e/real-mode-funding.spec.js --project=chromium --grep "detects real InstantLock transaction"

# Historic UTXO scan
yarn test:e2e demo/tests/e2e/real-mode-funding.spec.js --project=chromium --grep "finds existing UTXO in historic scan"
```

These tests:
- Connect to local dashd via RPC at localhost:19998
- Send real DASH on testnet from the platformcli wallet
- Verify InstantLock/ChainLock detection works end-to-end

## Related Files

- `package.json` - Dependencies and scripts
- `vitest.config.ts` - Vitest configuration (unit + integration tests)
- `tests/setup.ts` - Test setup with createMockWasmSdk helper
- `playwright.config.ts` - E2E test configuration (Playwright)
