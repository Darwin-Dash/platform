# WASM SDK Mutex Lock Investigation Summary

**Date**: November 21, 2025
**Status**: Root cause NOT fully resolved, but working patterns identified
**Tests**: 10 failed, 2 passed (no improvement from fix)

---

## What We Discovered

### ✅ The Working Pattern (From MIGRATE)

The MIGRATE folder contains proven, working WASM SDK code using this exact pattern:

1. **Worker-based isolation**: Each operation runs in separate Node.js process
2. **Single WASM prefetch**: Call `prefetchTrustedQuorumsTestnet()` ONCE per process (guarded by static flag)
3. **Fresh SDK per operation**: Create new EvoSDK instance per operation
4. **Sequential operations**: Never call operations concurrently

**Key files proving this works:**
- `/Users/user/Sync/Code/Dash/platform-feat-js-evo-sdk-identities/MIGRATE/packages/js-evo-sdk/workers/wasm-operations.js` (lines 42-48, 109-119)
- `/Users/user/Sync/Code/Dash/platform-feat-js-evo-sdk-identities/MIGRATE/packages/js-evo-sdk/src/sdk.ts` (lines 154-179)

### ❌ Why The Fix Didn't Work

The prefetch guard (`EvoSDK.prefetchDone`) only works **within a single process**. Since each worker is a separate child process:
- Parent process: `EvoSDK.prefetchDone = false`
- Child 1: `EvoSDK.prefetchDone = false` (new instance)
- Child 2: `EvoSDK.prefetchDone = false` (new instance)
- ...

The guard doesn't prevent prefetch in each worker because each worker gets a fresh copy of the flag.

### 🔍 Deeper Root Cause Identified

The test output shows:
```
More than one instance of dashcore-lib found. Please make sure that you are not mixing instances of classes of the different versions of dashcore.
```

This suggests:
1. **dashcore-lib version mismatch** in dependencies
2. **Multiple loading paths** creating duplicate instances
3. **WASM SDK expecting one instance** but finding multiple

The mutex lock might not be from WASM SDK prefetch itself, but from conflicting dashcore-lib instances creating state corruption in WASM module initialization.

---

## Code Changes Made

### 1. Added Static Prefetch Guard
**File**: `packages/js-evo-sdk/src/sdk.ts` (lines 43-45)
```typescript
// Guard to prevent multiple prefetchTrustedQuorums calls which create conflicting WASM locks
// This is a process-level flag because prefetch creates global Rust mutex locks
public static prefetchDone = false;
```

### 2. Protected Prefetch Calls
**File**: `packages/js-evo-sdk/src/sdk.ts` (lines 100-128)

Changed from calling prefetch unconditionally to guarding with the static flag:
```typescript
// BEFORE (always prefetch)
await wasm.WasmSdk.prefetchTrustedQuorumsTestnet();
builder = wasm.WasmSdkBuilder.testnetTrusted();

// AFTER (prefetch only once per process)
if (!EvoSDK.prefetchDone) {
  await wasm.WasmSdk.prefetchTrustedQuorumsTestnet();
  EvoSDK.prefetchDone = true;
}
builder = wasm.WasmSdkBuilder.testnetTrusted();
```

This matches the MIGRATE pattern exactly (lines 154-179 of MIGRATE/src/sdk.ts).

---

## Test Results

**Before Fix**: 10 failed, 2 passed
**After Fix**: 10 failed, 2 passed (no change)

The fix didn't improve results because the lock issue happens at the WASM layer, not the prefetch guard layer.

---

## Next Steps for Root Cause Analysis

### Priority 1: Investigate dashcore-lib duplication

```bash
cd packages/js-evo-sdk
npm list dashcore-lib
npm ls | grep dashcore
```

Check if there are multiple versions or paths to dashcore-lib causing conflicts.

### Priority 2: Verify WASM SDK version compatibility

```bash
grep "@dashevo/wasm-sdk" package.json
npm info @dashevo/wasm-sdk
```

Check if current WASM SDK version is known to have mutex issues with testnet.

### Priority 3: Test with mock SDK

Create a mock WASM SDK that returns dummy data to see if:
- Real SDK is broken
- Testnet connectivity is the issue
- Just this WASM SDK version is problematic

---

## Files Modified

1. `packages/js-evo-sdk/src/sdk.ts` - Added prefetch guard and static flag
2. This summary document (new)

---

## Key Insights

### The Fix Was Correct But Incomplete

The MIGRATE pattern uses the prefetch guard, but it's **not the complete solution**. The guard prevents duplicate prefetch calls _within a single process_, but it doesn't solve:
- Each worker being a separate process (guard doesn't cross process boundaries)
- The underlying "already locked to a reader" error happening at the WASM/Rust level
- Version conflicts or state corruption

###  The Pattern Is Still Valid

Even though the prefetch guard alone doesn't fix tests, the working pattern from MIGRATE is still architecturally correct:
- Worker isolation ✓
- Sequential operations ✓
- Fresh SDK instances ✓
- Single prefetch (guarded) per process ✓

These practices are still the best way to use WASM SDK, they just don't fix the deeper issue.

### The Real Problem Likely Is

1. **dashcore-lib duplication** - Multiple instances corrupting state
2. **WASM SDK version issue** - Known bug in specific version + testnet combo
3. **Testnet connectivity** - Network errors causing SDK initialization to fail leaving locks
4. **OS/environment issue** - Specific to this system's Rust/WASM runtime

---

## Recommendations

1. ✅ Keep the prefetch guard (good practice, matches MIGRATE)
2. ⚠️ Don't expect it alone to fix the tests
3. 🔍 Investigate dashcore-lib duplication first (easiest to fix)
4. 🤝 Contact WASM SDK team with version numbers and dashcore-lib findings
5. 🧪 Create minimal test with mock SDK to isolate the cause

---

## References

- MIGRATE working pattern: `MIGRATE/packages/js-evo-sdk/workers/wasm-operations.js`
- MIGRATE SDK: `MIGRATE/packages/js-evo-sdk/src/sdk.ts`
- WASM SDK issue tracking needed: Check for known mutex bugs in current version

