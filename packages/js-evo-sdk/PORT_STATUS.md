# js-evo-sdk Port Status

**Date**: 2026-01-22
**Branch**: `feat/js-evo-sdk-v3.0-dev` (on `platform-v3.0-dev`)

## Completed Tasks

### Phase A: File Copies (DONE)
All source files have been copied from feature branch to v3.0-dev:
- `src/identities/` - 16 files (complete identity system)
- `src/utils/` - 3 files (logger, dapi-wrapper, wasm-queue)
- `src/types/` - 1 file (type definitions)
- `src/errors.ts` - Base error classes
- `src/util.ts` - Utility functions
- `workers/` - 11 files (WASM worker operations)
- `tests/unit/coordination/` - Identity unit tests

### Phase B: Build Configuration (DONE)
- Updated `package.json` with required dependencies:
  - `@dashevo/dapi-client`: workspace:*
  - `@dashevo/dashcore-lib`: ~0.22.0
  - `@dashevo/transaction-finder`: workspace:*
  - `@types/node`: ^20.0.0
  - `typescript`: ^5.3.0
- Added `transaction-finder` to root workspace configuration
- Built `transaction-finder` package successfully
- Created type declarations for `@dashevo/dashcore-lib` in transaction-finder
- Removed `@dashevo/resilient-dapi-client` dependency (refactored to use standard `@dashevo/dapi-client`)
- Added `networkConfig` getter to EvoSDK for identity module compatibility
- Added `resetWasmSdk()` method to EvoSDK
- Created stub type declarations for `@dashevo/wasm-sdk`
- Updated tsconfig.json:
  - Target: ES2022
  - Added lib: ["ES2022", "DOM"]
  - Relaxed strict type checking for initial port

## Remaining Issues

### 1. API Signature Mismatches
The identity code from feature branch uses different wallet function signatures than v3.0-dev:

**Feature Branch (expected)**:
```typescript
walletFunctions.deriveKeyFromSeedWithPath(mnemonic, null, path, network)
```

**v3.0-dev (actual)**:
```typescript
walletFunctions.deriveKeyFromSeedWithPath({
  mnemonic: string,
  passphrase?: string | null,
  path: string,
  network: string
})
```

**Affected Files**:
- `src/identities/coordination/utxo-finder.ts` (lines 440, 470)
- `src/identities/coordination/wallet-coordinator.ts` (lines 227, 247, 279)
- `src/identities/coordination/identity-key-generator.ts` (line 97)
- `src/identities/facade.ts` (line 933)
- `src/identities/facades/identity-creator.ts` (line 983)

**Fix Required**: Refactor all calls to use params object format.

### 2. Network Type Mismatch
The identity code supports `'local'` network, but some types only allow `'testnet' | 'mainnet'`:

**Affected Files**:
- `src/identities/facades/identity-creator.ts` (lines 399, 819)
- `src/identities/facades/identity-discovery.ts` (lines 96, 167)
- `src/identities/facades/identity-updater.ts` (lines 322, 672)

**Fix Required**: Update type definitions to include 'local' or handle the type coercion.

### 3. IdentityWasm Type Usage
Files use `wasm.IdentityWasm` as both a type and a value (class constructor):

**Affected Files**:
- `src/identities/facade.ts` (lines 104, 113, 142)
- `src/identities/facades/identity-fetcher.ts` (lines 38, 86, 144)

**Fix Required**: Properly export IdentityWasm as both a type and a class from wasm-sdk stub.

### 4. Missing wasm-sdk Types
Many more types need to be added to `src/types/wasm-sdk.d.ts`:
- Token-related types (TokenMintResult, TokenBurnResult, etc.)
- System types (StatusResponse, CurrentQuorumsInfo, etc.)
- Voting types (ContestedResourceVoteStateQuery, etc.)
- Wallet static methods (xprvToXpub, generateKeyPair, etc.)

### 5. wasm-sdk Not Built
The actual wasm-sdk package needs to be built (requires Rust toolchain) to get real type definitions. Currently using stub types.

## Next Steps

1. **Refactor wallet function calls** to use params object format
2. **Update network type handling** to support 'local'
3. **Complete wasm-sdk stub types** or build actual wasm-sdk
4. **Run unit tests** to verify functionality
5. **Test on testnet** to verify end-to-end identity operations

## Dependencies

- `@dashevo/wasm-sdk` - Must be built for full functionality
- `@dashevo/dapi-client` - Working via workspace link
- `@dashevo/transaction-finder` - Built and working
- `@dashevo/dashcore-lib` - External npm package, working

## Files Changed

### Root
- `package.json` - Added `packages/transaction-finder` to workspaces

### packages/js-evo-sdk
- `package.json` - Added dependencies, updated TypeScript
- `tsconfig.json` - Updated target, lib, paths
- `src/sdk.ts` - Added `networkConfig` getter and `resetWasmSdk()` method
- `src/types/wasm-sdk.d.ts` - Created stub type declarations
- `src/identities/coordination/transaction-builder.ts` - Refactored from resilient-dapi-client to dapi-client

### packages/transaction-finder
- `src/types/dashcore-lib.d.ts` - Created type declarations for dashcore-lib
