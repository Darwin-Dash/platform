# WASM SDK Simple Demo

This demo shows the **correct and only working pattern** for using the WASM SDK.

## What This Demonstrates

The simplest operation: fetch an identity from testnet using the worker pattern.

```bash
node demo/simple-demo.js
```

## Why Workers Are Required ⚠️

The WASM SDK creates **Rust mutex locks** during initialization and operation. These locks are:

- **Process-level**: Each process has its own lock instance
- **Global**: Created during `WasmSdk::build()` and `prefetchTrustedQuorums()`
- **Persistent**: Not released until process exit
- **Exclusive**: Only one operation can hold the lock at a time

### What Happens Without Workers

```javascript
// ❌ THIS WILL FAIL - Direct SDK usage
const sdk = new EvoSDK();
await sdk.getWasmSdkConnected();

// Even a single operation will eventually fail with:
// Error: "already locked to a reader"
// (or similar WASM/Rust concurrency errors)
```

### What Happens With Workers (Correct Pattern)

```javascript
// ✅ THIS WORKS - Worker pattern
await runWasmOperation('identity-fetch', { identityId }, options);

// Flow:
// 1. Main process spawns isolated worker (child_process.fork)
// 2. Worker imports fresh EvoSDK (new WASM memory space)
// 3. Worker calls operation
// 4. Worker exits, WASM memory and locks are released
// 5. Main process receives result
```

## Architecture

### File: `demo/simple-demo.js`
The demo script - shows minimal usage pattern.

### File: `src/identities/utils/wasm-worker-runner.ts`
Entry point that spawns workers:
- Detects environment (Node.js vs browser)
- Spawns appropriate worker type
- Manages timeout and cleanup

### File: `workers/wasm-operations.js`
The actual worker process:
- Receives operation and params from parent
- Imports fresh EvoSDK and WASM module
- Calls the operation handler
- Exits cleanly, releasing resources

### File: `workers/operations/identity-fetch.js`
The actual operation implementation:
- Takes identity ID parameter
- Calls `wasmSdk.getIdentity()`
- Returns result

## Running the Demo

### Prerequisites

1. **Build the project**
   ```bash
   cd packages/js-evo-sdk
   npm run build
   ```

2. **Verify testnet is accessible**
   ```bash
   # Should respond (may take 5-10 seconds)
   curl -s https://testnet-dapi-seed-1.dashevo.io/ | head -c 100
   ```

### Run the Demo

```bash
cd packages/js-evo-sdk
node demo/simple-demo.js
```

### Expected Output

```
============================================================
WASM SDK Demo: Fetch Identity Using Worker Pattern
============================================================

📋 What this demo does:
  1. Spawns an isolated worker process
  2. Initializes WASM SDK in that process
  3. Fetches identity from testnet
  4. Returns result to main process
  5. Worker exits, releasing WASM resources

🔄 Fetching identity: 5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk

✅ Success! Identity fetched:

{
  "id": "5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk",
  "protocolVersion": 1,
  ...
}

============================================================
```

## More Complex Examples

See `/packages/js-evo-sdk/tests/integration/` for more examples:

- **identity-operations.spec.ts** - Fetch identities, get keys
- **document-operations.spec.ts** - Query and create documents
- **state-transitions.spec.ts** - Complex multi-step operations

All follow the same pattern: use `runWasmOperation()` for any WASM SDK access.

## Troubleshooting

### Error: "Cannot find module"
```bash
# Ensure you built the project
npm run build
```

### Error: "already locked to a reader"
This means the WASM mutex is locked. Causes:
- Running operations concurrently
- Not using worker pattern
- Previous process didn't exit cleanly

Solution: Always use `runWasmOperation()` wrapper.

### Error: "More than one instance of dashcore-lib"
This warning appears if dashcore-lib versions are duplicated:
```bash
npm list @dashevo/dashcore-lib
```

Should show single version (0.22.0). If you see multiple versions, the dashcore-lib dependency needs to be aligned across packages.

### Timeout Errors
The operation timed out (60 second default). Possible causes:
- Testnet is slow or unreachable
- Network connectivity issues
- Identity doesn't exist

Check testnet connectivity:
```bash
ping testnet-dapi-seed-1.dashevo.io
```

## Key Takeaways

1. **Workers are mandatory** - Not optional, not for performance, for correctness
2. **One operation per worker** - Each spawned process runs exactly one operation
3. **Fresh WASM per worker** - New SDK instance, new WASM memory, new locks
4. **Always use the runner** - `runWasmOperation()` is the correct interface
5. **Sequential by design** - Workers exit after operation, preventing concurrency issues

## See Also

- `src/sdk.ts` - EvoSDK class with prefetch guard
- `workers/wasm-operations.js` - Worker process implementation
- `tests/integration/` - Real-world operation examples
