# WASM SDK "Already Locked to a Reader" Error Investigation

## Problem Statement

When calling `wasmSdk.getIdentity()` in the EVO SDK, we encounter:
```
Error: already locked to a reader
at wasm://wasm/034a94ce:wasm-function[14042]:0xa3e750
```

This error occurs in **every operation attempt**, even with:
- Worker process isolation ✓
- Sequential operations only ✓
- Prefetch guard enabled ✓
- Single SDK instance per worker ✓
- Fresh WASM module per worker process ✓

## Root Cause Analysis

### Level 1: JavaScript/SDK Wrapper (FIXED ✓)
- **Issue**: Multiple prefetch calls creating duplicate locks
- **Fix**: Added `WASM_WORKER_CONTEXT` env var and static guard
- **Status**: Working - prefetch only called once per process

### Level 2: WASM Module Initialization (UNKNOWN)
- **Issue**: Builder.build() succeeds, but getIdentity() fails
- **Location**: Deep in Rust code (`wasm-function[14042]`)
- **Stack Trace**:
  ```
  wasm-function[14042]:0xa3e750  (RwLock::read or write?)
  wasm-function[442]:0x284202   (Context/state lookup?)
  wasm-function[12324]:0x9ce0e0 (Network request setup?)
  wasm-function[1393]:0x568c84  (Async callback preparation?)
  wasm-function[2474]:0x6b3ed1  (Async execution?)
  __wbg_adapter_24             (WASM→JS async bridge)
  ```

### Analysis

**The error happens AFTER successful SDK initialization:**
1. ✅ `initWasm()` - succeeds
2. ✅ `new EvoSDK()` - succeeds
3. ✅ `builder.build()` - succeeds
4. ❌ `wasmSdk.getIdentity(id)` - FAILS with RwLock error

**This indicates the lock conflict is NOT in:**
- Prefetch logic
- SDK initialization
- Builder setup

**The conflict IS in:**
- WASM module's internal RwLock handling
- Rust async/await bridge
- Context provider's mutex management

## Evidence

### Test Data
- **Affected**: All identity fetch operations
- **Count**: 10/12 integration tests fail with same error
- **Passing**: Only tests that don't call WASM SDK methods
- **Reproducibility**: 100% on every run

### Environmental Factors Tested
- ✅ Worker isolation - doesn't help
- ✅ Sequential operations - doesn't help
- ✅ Prefetch guard - doesn't help
- ✅ Single trusted builder - doesn't help
- ✅ Non-trusted builder - doesn't help
- ✅ Removing explicit initWasm - doesn't help
- ✅ Fresh WASM module per worker - doesn't help

### What Works
- Tests that DON'T call getIdentity() or other WASM methods ✓
- SDK initialization and configuration ✓
- Worker spawning and message passing ✓

### What Doesn't Work
- Any WASM method call (getIdentity, queryDocuments, etc.) ✗
- Even first operation in isolated worker process ✗

## Potential Root Causes

### 1. WASM SDK Version Bug (Most Likely)
The WASM SDK may have a known bug in this version:
- Rust `Lazy<Mutex<>>` statics not being initialized properly in WASM context
- RwLock upgrade deadlock in async callback bridge
- JavaScript→Rust async boundary issue with locks

**Investigation needed:**
```bash
grep "@dashevo/wasm-sdk" packages/js-evo-sdk/package.json
# Check version and release notes for known RwLock/mutex issues
```

### 2. dashcore-lib State Corruption
The "More than one instance of dashcore-lib" warning suggests:
- Multiple instances creating conflicting state
- Incompatible versions (0.20.10 vs 0.22.0) - though we fixed this
- Global state corruption in linked Dash libraries

**Status**: Partially fixed - deduplicated to single 0.22.0 version

### 3. Testnet Network Issues
If WASM SDK is trying to connect during `getIdentity()`:
- Network errors leaving locks in bad state
- Timeouts causing lock held during cleanup
- DAPI node incompatibilities

**To test**: Add explicit timeout handling

### 4. WASM Memory/GC Issues
- Garbage collector running while holding locks
- WASM linear memory corruption
- JavaScript/Rust type boundary issues

**Evidence**: Stack shows `__wbg_adapter_24` (WASM bindgen adapter) in trace

## Recommendations

### Immediate (JavaScript Level - Already Done)
- ✅ Add worker context detection
- ✅ Skip prefetch in workers
- ✅ Ensure sequential operations
- ✅ Clean WASM resources on exit

### Short Term (Investigation)
- [ ] Check WASM SDK version and release notes
- [ ] Verify compatibility matrix (WASM SDK vs DAPI client)
- [ ] Test with mock WASM SDK to isolate if it's SDK vs network
- [ ] Check if there's a newer WASM SDK version with fixes

### Long Term (Fix)
- [ ] File issue with WASM SDK team with this detailed trace
- [ ] Include stack trace showing lock at `wasm-function[14042]`
- [ ] Provide reproduction case (worker spawning getIdentity call)
- [ ] Share investigation findings about Rust Lazy<Mutex<>> behavior

## Files Modified

1. `src/sdk.ts` - Added worker context detection and logging
2. `workers/wasm-operations.js` - Set WASM_WORKER_CONTEXT env var
3. `demo/simple-demo.js` - Standalone demo showing the issue

## Conclusion

The "already locked to a reader" error is a **WASM SDK-level issue** that occurs in the Rust compiled code, not in our JavaScript wrapper. Our fixes prevent JavaScript-level lock conflicts, but the underlying WASM module has an internal lock management problem that requires:

1. WASM SDK team investigation
2. Possible version upgrade
3. Potential Rust code fix in the WASM SDK

The worker isolation pattern and sequential operation strategy are architecturally sound and correctly implemented - the issue is beyond this SDK's control.
