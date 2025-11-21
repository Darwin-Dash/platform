# WASM Worker Integration Testing Guide

## Overview

This guide explains how to run the new integration tests that validate WASM SDK operations with proper worker isolation to prevent concurrency errors.

The integration tests use the `wasm-worker-runner.ts` pattern which spawns child processes (Node.js) or Web Workers (browser) to execute WASM operations in isolation, preventing "already locked to a reader" mutex conflicts from Rust.

## Test Files

### 1. `wasm-worker-identity-fetcher.spec.mjs`
Tests identity fetching operations with worker isolation:
- Single identity fetch
- Identity with cryptographic proof
- Fast fetch without proof
- Key retrieval
- Batch operations (single worker, multiple operations)
- Concurrent operations (multiple workers)
- Error handling and timeouts
- Stress testing

**Run:**
```bash
npx mocha tests/integration/wasm-worker-identity-fetcher.spec.mjs --exit --timeout 180000
```

**Characteristics:**
- No testnet wallet required (read-only operations)
- Uses publicly available testnet identities
- ~10-15 seconds execution time

### 2. `wasm-worker-identity-creator.spec.mjs`
Tests identity creation with worker isolation:
- Create identity with wallet
- Mnemonic validation
- Amount validation
- Custom start height
- Change address routing
- Timeout handling
- Concurrent creation attempts
- Error recovery

**Run:**
```bash
TEST_MNEMONIC="your 12-word mnemonic here" npx mocha tests/integration/wasm-worker-identity-creator.spec.mjs --exit --timeout 600000
```

**Requirements:**
- `TEST_MNEMONIC` environment variable with funded testnet wallet
- Testnet wallet must have ~0.5 DASH per identity creation
- 10 minutes per test due to blockchain confirmation

**Characteristics:**
- Requires funded testnet wallet
- Tests state-changing operations
- Tests blockchain confirmation waiting
- Tests wallet coordination

### 3. `wasm-worker-identity-updater.spec.mjs`
Tests identity top-up operations with worker isolation:
- Top-up existing identity
- Validation of identity ID and amount
- Custom start height
- Mnemonic validation
- Sequential operations
- Concurrent top-ups
- Resource cleanup
- Error recovery

**Run:**
```bash
TEST_MNEMONIC="your 12-word mnemonic here" \
EVO_IDENTITY_ID="existing-identity-id" \
npx mocha tests/integration/wasm-worker-identity-updater.spec.mjs --exit --timeout 600000
```

**Requirements:**
- `TEST_MNEMONIC` with funded wallet
- `EVO_IDENTITY_ID` for existing testnet identity
- Optional: `EVO_KEY_ID` for private key operations

### 4. `wasm-worker-concurrency.spec.mjs`
Validates the worker isolation pattern prevents WASM mutex errors:
- Basic concurrent operations
- High concurrency (10+ simultaneous workers)
- Mixed operation types concurrently
- Batch vs. individual operation performance
- Sequential after concurrent
- Rapid-fire operations
- Varying timeouts
- Stress testing (20 concurrent operations)
- Error isolation between workers
- Repeated concurrent batches
- Memory leak detection

**Run:**
```bash
npx mocha tests/integration/wasm-worker-concurrency.spec.mjs --exit --timeout 300000
```

**Characteristics:**
- No wallet funding required
- Validates worker isolation works
- Tests system stability under load
- Critical for validating fix for WASM concurrency
- ~5 minutes execution time

## Environment Setup

### Prerequisites

1. **Node.js 18+**
   ```bash
   node --version  # Should be v18.18 or higher
   ```

2. **Testnet Access**
   The tests connect to Dash Platform testnet. Ensure you have:
   - Internet connection to testnet nodes
   - Testnet is responsive (check dashboards or health checks)

3. **Testnet Wallet (for creation/updater tests)**
   - Get DASH from faucet: https://testnet-faucet.dash.org
   - Address: `yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy` (requires ~0.5 DASH per test)
   - Verify balance:
     ```bash
     # Using dash-cli or similar tools
     dash-cli getbalance
     ```

### Environment Variables

#### Optional (Read-Only Tests)
```bash
LOG_LEVEL=debug  # Enable worker debug output
```

#### Required for Identity Creator Tests
```bash
TEST_MNEMONIC="abandon abandon ... about"  # 12-word BIP39 mnemonic
```

#### Required for Identity Updater Tests
```bash
TEST_MNEMONIC="abandon abandon ... about"
EVO_IDENTITY_ID="5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk"
EVO_KEY_ID=0  # Optional: specific key ID
```

## Running Tests

### Run All Integration Tests
```bash
TEST_MNEMONIC="your-mnemonic" EVO_IDENTITY_ID="your-id" npm run test:integration
```

### Run Specific Test Suite

**Identity Fetcher Only (No Setup Required)**
```bash
npx mocha tests/integration/wasm-worker-identity-fetcher.spec.mjs --exit --timeout 180000
```

**Identity Creator Only (Requires Funded Wallet)**
```bash
TEST_MNEMONIC="your-mnemonic" npx mocha tests/integration/wasm-worker-identity-creator.spec.mjs --exit --timeout 600000
```

**Identity Updater Only (Requires Funded Wallet + Existing Identity)**
```bash
TEST_MNEMONIC="your-mnemonic" EVO_IDENTITY_ID="your-id" \
npx mocha tests/integration/wasm-worker-identity-updater.spec.mjs --exit --timeout 600000
```

**Concurrency Tests Only (No Setup Required)**
```bash
npx mocha tests/integration/wasm-worker-concurrency.spec.mjs --exit --timeout 300000
```

### Run with Debug Output
```bash
LOG_LEVEL=debug npx mocha tests/integration/wasm-worker-identity-fetcher.spec.mjs --exit --timeout 180000
```

### Run Specific Test
```bash
npx mocha tests/integration/wasm-worker-identity-fetcher.spec.mjs --grep "should fetch identity by ID" --exit --timeout 180000
```

## Test Characteristics

### What Tests Validate

**1. Worker Isolation Prevents Concurrency Errors**
- Multiple workers can run simultaneously
- No "already locked to a reader" errors
- Each worker has isolated WASM memory

**2. Proper Resource Cleanup**
- WASM memory freed after each operation
- No resource leaks with repeated operations
- Batch operations reuse single worker efficiently

**3. Error Handling**
- Worker errors propagate correctly
- Timeout errors handled gracefully
- Non-existent resources return proper errors

**4. Operational Correctness**
- Identity fetching returns valid data
- Key retrieval works properly
- Top-up operations coordinate with wallet
- Creation operations produce valid identities

**5. Performance**
- Single operations: <5 seconds (testnet dependent)
- Batch operations more efficient than individual
- Concurrent operations don't slow each other down
- No memory leaks under load

### Performance Expectations

| Operation | Mode | Time | Notes |
|-----------|------|------|-------|
| Identity Fetch | Single | 1-3s | Network dependent |
| Identity Fetch | Batch (5) | 3-8s | Single worker |
| Identity Fetch | Concurrent (5) | 3-8s | Multiple workers |
| Identity Create | Single | 30-120s | Blockchain confirmation |
| Identity Top-up | Single | 30-120s | Blockchain confirmation |
| Key Retrieval | Single | 2-5s | Network dependent |
| Concurrency Test | 10 concurrent | 10-30s | Mix of operations |
| Stress Test | 20 concurrent | 30-60s | Heavy load |

## Troubleshooting

### Issue: "Worker timeout after 60000ms"

**Cause:** Testnet is slow or unreachable

**Solutions:**
- Increase timeout: `--timeout 180000` for 3 minutes
- Check testnet health
- Verify internet connection
- Check firewall rules

```bash
# Increase timeout
npx mocha tests/integration/wasm-worker-identity-fetcher.spec.mjs --timeout 180000
```

### Issue: "Cannot find module 'wasm-operations.js'"

**Cause:** Worker file path resolution issue

**Solutions:**
- Ensure dist/ directory exists
- Rebuild: `npm run build`
- Check file exists: `ls packages/js-evo-sdk/workers/wasm-operations.js`

### Issue: "Failed to fetch identity: not found"

**Cause:** Test identity doesn't exist or is on different network

**Solutions:**
- Verify testnet is accessible
- Use a different identity ID
- Check `TEST_IDS` in `tests/fixtures/testnet.mjs`

### Issue: "Batch WASM operations not supported in browser"

**This is expected.** Batch operations only work in Node.js. Browser environment uses Web Workers instead.

### Issue: Tests timeout with "already locked to a reader"

**This shouldn't happen.** The worker isolation pattern should prevent this.

**If it occurs:**
- Check worker file is being used
- Verify child process is being spawned
- Check WASM module initialization in worker
- Enable debug: `LOG_LEVEL=debug`

### Issue: "Insufficient funds" for identity creation

**Cause:** Testnet wallet doesn't have enough DASH

**Solutions:**
1. Check wallet balance:
   ```bash
   dash-cli getbalance  # or equivalent
   ```

2. Get DASH from faucet: https://testnet-faucet.dash.org

3. Wait for confirmation (10+ seconds)

4. Verify in test:
   ```bash
   LOG_LEVEL=debug TEST_MNEMONIC="..." npx mocha ... --grep "should create"
   ```

### Issue: "Unknown operation type" in worker

**Cause:** Operation not registered in `workers/operations/index.js`

**Check available operations:**
```bash
cat packages/js-evo-sdk/workers/operations/index.js | grep "^  '"
```

**Available operations:**
- `identity-create`
- `identity-topup`
- `identity-discover`
- `identity-fetch`
- `identity-fetch-with-proof`
- `identity-fetch-unproved`
- `identity-get-keys`

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [pull_request, push]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Run Integration Tests
        run: npx mocha tests/integration/wasm-worker-concurrency.spec.mjs --exit --timeout 300000

      - name: Run Fetcher Tests
        run: npx mocha tests/integration/wasm-worker-identity-fetcher.spec.mjs --exit --timeout 180000
```

### Performance Testing

To measure performance improvements from worker isolation:

```bash
# Baseline: without worker isolation (simulated)
# This would use direct WASM calls (currently fails)

# With worker isolation
time npx mocha tests/integration/wasm-worker-concurrency.spec.mjs --grep "stress test" --exit
```

Expected with worker isolation:
- 20 concurrent operations: 30-60 seconds
- No "already locked to a reader" errors
- Linear performance (not exponential slowdown)

## Test Development

### Adding New Integration Tests

1. **Choose operation type** - fetch, create, topup, discover, etc.

2. **Create test file** - Follow naming: `wasm-worker-{name}.spec.mjs`

3. **Use `runWasmOperation` function:**
   ```javascript
   import { runWasmOperation } from '../../../dist/identities/utils/wasm-worker-runner.js';

   const result = await runWasmOperation('operation-name', {
     param1: 'value1',
     param2: 'value2',
   }, {
     timeout: 60000,
     network: 'testnet',
   });
   ```

4. **Add to test operations registry** - Edit `workers/operations/index.js`

5. **Create operation handler** - File in `workers/operations/{operation-name}.js`

6. **Test locally before committing:**
   ```bash
   npx mocha tests/integration/wasm-worker-{name}.spec.mjs --exit
   ```

## Related Documentation

- **TESTING.md** - Unit test documentation
- **wasm-worker-runner.ts** - Worker isolation implementation
- **workers/operations/** - Operation handlers
- **workers/wasm-operations.js** - Worker main process

## Contact & Support

For integration testing issues:
1. Check troubleshooting section above
2. Enable debug output: `LOG_LEVEL=debug`
3. Check worker logs in console
4. Verify testnet connectivity
5. Check operation handler implementation

## Future Enhancements

1. **Performance Monitoring** - Track operation latency
2. **Metrics Collection** - Worker utilization, queue depth
3. **Advanced Batch Operations** - Pagination, streaming results
4. **Error Recovery** - Automatic retry with backoff
5. **Worker Pool Management** - Limit concurrent workers
6. **Browser Web Worker Support** - Full browser testing

## Summary

The integration tests with worker isolation:
- ✅ Prevent WASM concurrency errors
- ✅ Validate correct operation behavior
- ✅ Test error handling and edge cases
- ✅ Measure performance under load
- ✅ Ensure resource cleanup
- ✅ Support CI/CD integration

These tests are essential for validating that the worker isolation pattern solves the WASM mutex conflict problem while maintaining correctness and performance.
