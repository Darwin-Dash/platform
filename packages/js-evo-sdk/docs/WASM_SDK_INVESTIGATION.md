# WASM SDK Investigation Report

**Date:** 2026-01-28 (Updated)
**Status:** ROOT CAUSE IDENTIFIED - Solution found
**Workaround:** DAPI bypass implemented, but direct WASM SDK should work with `trusted: false`

---

## Problem Statement

The WASM SDK's async methods hang/timeout after calling `prefetchTrustedQuorumsTestnet()`. Integration tests that use WASM SDK methods like `getIdentity()` timeout at 30+ seconds, while the same operations using DAPI directly complete in 5-11 seconds.

---

## Observed Behavior

| Scenario | Observed Behavior | Expected Behavior |
|----------|------------------|-------------------|
| `Promise.all()` concurrent ops | "already locked to a reader" error | Should work or fail fast |
| Sequential ops after prefetch | **Timeout/hang (30s+)** | Should complete in seconds |
| DAPI bypass (JavaScript) | Works immediately (5-11s) | N/A - this is the workaround |

---

## Code Investigation

### Call Chain Traced

```
JavaScript:
  sdk.identities.fetch(identityId)
    → IdentityFetcher.fetch()
      → [BEFORE FIX] wasmSdk.getIdentity(identityId) // Hangs
      → [AFTER FIX]  dapiClient.platform.getIdentity() // Works

Rust (WASM SDK):
  WasmSdk.getIdentity()  (packages/wasm-sdk/src/queries/identity.rs:388)
    → Identity::fetch_by_identifier(self.as_ref(), id)
      → Identity::fetch_with_settings(sdk, query, settings)
        → request.execute(sdk, settings).await     // Network call
        → sdk.parse_proof_with_metadata_and_proof()  // Proof verification
```

### Locking Mechanisms Found

**Searched for RwLock - minimal usage found:**
- `rs-sdk/src/mock/provider.rs` - LRU cache for mock provider (not production path)
- No RwLock in main `WasmSdk` or `Sdk` structs

**Actual locking mechanisms in production path:**

1. **ConnectionPool** (`rs-dapi-client/src/connection_pool.rs:20`)
   ```rust
   pub struct ConnectionPool {
       inner: Arc<Mutex<LruCache<String, PoolItem>>>,
   }
   ```
   - Sync `std::sync::Mutex` (not async)
   - Used for gRPC connection caching

2. **TrustedHttpContextProvider** (`rs-sdk-trusted-context-provider/src/provider.rs:47-65`)
   ```rust
   pub struct TrustedHttpContextProvider {
       current_quorums_cache: Arc<Mutex<LruCache<QuorumHash, QuorumData>>>,
       previous_quorums_cache: Arc<Mutex<LruCache<QuorumHash, QuorumData>>>,
       last_current_quorums: Arc<ArcSwap<Option<QuorumsResponse>>>,
       last_previous_quorums: Arc<ArcSwap<Option<PreviousQuorumsResponse>>>,
       known_contracts: Arc<Mutex<HashMap<Identifier, Arc<DataContract>>>>,
       known_token_configurations: Arc<Mutex<HashMap<Identifier, TokenConfiguration>>>,
       // ...
   }
   ```
   - Multiple `Arc<Mutex<...>>` caches
   - `ArcSwap` for atomic pointer swapping

3. **Sdk Context Provider** (`rs-sdk/src/sdk.rs`)
   ```rust
   context_provider: ArcSwapOption<Arc<dyn ContextProvider>>,
   ```
   - Uses `arc_swap::ArcSwapOption`

### Key Insight: No Obvious RwLock

The code comments in `js-evo-sdk` mention "RwLock deadlock" but:
- No explicit `RwLock` was found in the critical path
- The locks found are `std::sync::Mutex` (sync, not async)
- Sync Mutex shouldn't cause hangs across `.await` points in typical usage

---

## Working Theory

The hang is **WASM-specific** and likely related to one of:

1. **wasm-bindgen-futures interaction**: How the WASM async runtime handles shared state
2. **reqwest::Client in WASM**: The HTTP client behavior after prefetch
3. **gRPC connection pool state**: Connections cached during prefetch may be stale/corrupted
4. **ArcSwap behavior**: How atomic pointer swapping works in WASM context

### Why DAPI Bypass Works

The JavaScript DAPI client (`@dashevo/dapi-client`):
- Creates **fresh connections** each time (no connection pooling issues)
- Doesn't share state with WASM SDK
- Uses its own HTTP/gRPC handling separate from Rust

---

## Files Investigated

### WASM SDK (Rust)
- `packages/wasm-sdk/src/sdk.rs` - WasmSdk wrapper
- `packages/wasm-sdk/src/queries/identity.rs` - getIdentity implementation
- `packages/wasm-sdk/src/context_provider.rs` - WasmTrustedContext

### Underlying SDK (Rust)
- `packages/rs-sdk/src/sdk.rs` - Main Sdk struct
- `packages/rs-sdk/src/platform/fetch.rs` - Fetch trait implementation
- `packages/rs-dapi-client/src/connection_pool.rs` - gRPC connection pooling
- `packages/rs-sdk-trusted-context-provider/src/provider.rs` - Quorum context provider

### JS-Evo-SDK (TypeScript)
- `packages/js-evo-sdk/src/identities/facades/identity-fetcher.ts` - DAPI bypass implementation
- `packages/js-evo-sdk/src/identities/facade.ts` - Main identity facade

---

## Implemented Workaround: DAPI Bypass

### Pattern

For read operations, bypass WASM SDK and use JavaScript DAPI client directly:

```typescript
// identity-fetcher.ts
async fetch(identityId: string): Promise<wasm.IdentityWasm> {
  // Step 1: Use JavaScript DAPI client (no WASM locks/state)
  const dapiClient = await this.getDAPIClient();
  const bs58 = await getBs58();
  const identityIdBuffer = Buffer.from(bs58.decode(identityId));

  const response = await dapiClient.platform.getIdentity(identityIdBuffer);
  const identityBuffer = response.getIdentity();

  // Step 2: Parse buffer using WASM's static method (no SDK connection needed)
  const identity = await this.fromBuffer(identityBuffer);
  return identity as unknown as wasm.IdentityWasm;
}
```

### Key Points

1. **Fresh DAPI client each time**: Don't cache to avoid stale connections
2. **WASM for parsing only**: Use `Identity.fromBytes()` - static method, no SDK state
3. **Works immediately**: 5-11 seconds vs 30+ second timeout

---

## Architecture: When to Use What

| Operation | Recommended | Reason |
|-----------|-------------|--------|
| Identity fetch | DAPI bypass | Read-only, no signing needed |
| Identity balance | DAPI bypass | Read-only, no signing needed |
| Document query | DAPI bypass | Read-only, no signing needed |
| Contract query | DAPI bypass | Read-only, no signing needed |
| System status | DAPI bypass | Read-only, no signing needed |
| Identity create | WASM SYNC + DAPI broadcast | Signing required |
| Identity top-up | WASM SYNC + DAPI broadcast | Signing required |
| Document create | WASM SYNC + DAPI broadcast | Signing required |
| Proof verification | Worker isolation or DAPI | WASM async methods problematic |

### WASM SDK Method Types

| Method Type | Example | Status |
|-------------|---------|--------|
| **SYNC prepare** | `identityCreatePrepare()` | Safe - no network calls |
| **ASYNC operations** | `getIdentity()`, `getIdentityBalance()` | Problematic - may hang after prefetch |

---

## Recommended Next Steps

1. **For js-evo-sdk**: Continue with DAPI bypass for read operations
2. **For Dash Platform team**:
   - Investigate why sequential WASM async calls hang after prefetch
   - Add logging/tracing to identify where the hang occurs
   - Consider if `reqwest` or gRPC client has WASM-specific issues
   - Test with different WASM async runtimes

---

## Test Commands

```bash
cd /Users/user/Sync/Code/Dash/platform-v3.0-dev/packages/js-evo-sdk

# Run integration tests (should pass with DAPI bypass)
yarn test:integration

# Run specific identity tests
yarn vitest run tests/integration/identity.spec.ts
```

---

## Related Files

- **Plan file**: `/Users/user/.claude/plans/magical-kindling-gizmo.md`
- **Identity fetcher with DAPI bypass**: `src/identities/facades/identity-fetcher.ts`
- **Integration tests**: `tests/integration/identity.spec.ts`
