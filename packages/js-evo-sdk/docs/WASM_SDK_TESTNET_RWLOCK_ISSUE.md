# WASM SDK RwLock Issue - Root Cause & Solution

**Status:** FIXED
**Date:** 2026-01-28

---

## Root Cause

The timeout/hang issue was caused by **conflicting WASM modules** - specifically `wasm-sdk` and `wasm-dpp`.

### The Conflict

When `@dashevo/dapi-client` is statically imported, it loads `@dashevo/wasm-dpp` at module init time. Both `wasm-sdk` and `wasm-dpp` share some JavaScript runtime state that gets corrupted due to RwLock contention in the single-threaded WASM environment.

### Symptoms

- `sdk.wasm.getIdentity()` hangs for 30+ seconds then throws "already locked to a reader"
- Prefetch completes successfully but subsequent network operations hang
- Works fine when `dapi-client` is not imported

### Affected Code Path

```
EvoSDK → IdentitiesFacade → WalletCoordinator → DAPIClient (static import)
                                              ↓
                                         wasm-dpp loaded
                                              ↓
                                    wasm-sdk state corrupted
```

---

## Solution: Dynamic DAPIClient Imports

Converted static `import DAPIClient from '@dashevo/dapi-client'` to dynamic imports in files that were causing the module load:

1. **wallet-coordinator.ts**
2. **utxo-finder.ts**
3. **identity-creator.ts**
4. **identity-updater.ts**

### Implementation Pattern

```typescript
// Before (BROKEN - causes wasm-dpp to load at module init)
import DAPIClient from '@dashevo/dapi-client';

// After (FIXED - loads wasm-dpp only when needed)
import type DAPIClientType from '@dashevo/dapi-client';

let DAPIClient: typeof DAPIClientType | null = null;
async function getDAPIClient(): Promise<typeof DAPIClientType> {
  if (!DAPIClient) {
    DAPIClient = (await import('@dashevo/dapi-client')).default;
  }
  return DAPIClient;
}

// Usage
const DAPIClientClass = await getDAPIClient();
const client = new DAPIClientClass({ network: 'testnet' });
```

---

## Verification

After the fix:

| Test | Result | Time |
|------|--------|------|
| EvoSDK.connect() | PASS | ~2s |
| sdk.wasm.getIdentity() | PASS | ~1s |
| sdk.identities.fetch() | PASS | ~1s |
| Unit tests (381) | PASS | 3s |
| Integration tests (54 pass) | PASS | 57s |

---

## Technical Details

### Why Prefetch Alone Didn't Fix It

The prefetch pattern (`WasmSdk.prefetchTrustedQuorumsTestnet()`) works correctly when ONLY `wasm-sdk` is loaded. However, once `wasm-dpp` is also loaded (via `dapi-client`), the shared WASM runtime state becomes corrupted.

### Why Non-Trusted Mode Didn't Help

The WASM SDK explicitly requires trusted mode:
```
Error: Non-trusted mode is not supported in WASM. Please use the trusted SDK builders instead.
```

So using `trusted: false` was never a valid workaround.

### Module Order Doesn't Matter

Testing showed that the order of imports (wasm-sdk first vs dapi-client first) doesn't matter - once both modules are loaded in the same process, the conflict occurs.

---

## Files Modified

- `src/identities/coordination/wallet-coordinator.ts`
- `src/identities/coordination/utxo-finder.ts`
- `src/identities/facades/identity-creator.ts`
- `src/identities/facades/identity-updater.ts`
- `src/identities/facade.ts` (fixed import of wasm module)

---

## Future Considerations

1. **Report to WASM SDK team**: The conflict between wasm-sdk and wasm-dpp should be investigated
2. **Consider consolidation**: Having two separate WASM modules (wasm-sdk and wasm-dpp) creates this conflict risk
3. **Dynamic import pattern**: Use this pattern for any future dapi-client imports

---

*Last Updated: 2026-01-28*
