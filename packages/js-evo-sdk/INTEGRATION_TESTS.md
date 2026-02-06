# Integration Tests Guide

Comprehensive guide for running and understanding the Vitest integration tests for WASM SDK identity operations with worker isolation.

## Overview

The integration tests validate that WASM operations work correctly with the worker isolation pattern that prevents "already locked to a reader" concurrency errors from Rust mutex conflicts.

**Test Framework**: Vitest (configured in `vitest.config.ts`)
**Test Files**: TypeScript (`.spec.ts`)
**Location**: `tests/integration/`

## Test Files

### 1. `identity-operations.spec.ts` (15 tests)
Tests read-only identity operations with WASM worker isolation.

**Operations Tested:**
- `identity-fetch` - Single identity retrieval
- `identity-fetch-with-proof` - Identity with cryptographic proof
- `identity-fetch-unproved` - Fast fetch without proof
- `identity-get-keys` - Retrieve identity public keys
- Batch operations (single worker, multiple items)
- Concurrent operations (multiple workers)

**Requirements**: None (uses public testnet data)
**Execution Time**: ~15-30 seconds
**Run**:
```bash
npx vitest run tests/integration/identity-operations.spec.ts
```

### 2. `identity-lifecycle.spec.ts` (15 tests)
Tests identity creation and top-up operations.

**Operations Tested:**
- `identity-create` - Create new identity with wallet
- `identity-topup` - Top-up existing identity
- Input validation (mnemonic, amount, start height)
- Sequential operations
- Concurrent operations
- Error recovery

**Requirements**:
- `MNEMONIC` - Funded testnet wallet (optional, tests skip if missing)
- `EVO_IDENTITY_ID` - Existing testnet identity (optional, for top-up tests)

**Execution Time**: ~2-5 minutes per test (includes blockchain confirmation)
**Run**:
```bash
MNEMONIC="your-12-word-mnemonic" \
EVO_IDENTITY_ID="existing-identity-id" \
npx vitest run tests/integration/identity-lifecycle.spec.ts
```

### 3. `worker-isolation.spec.ts` (15 tests)
Core validation that worker isolation prevents WASM concurrency errors.

**Validations:**
- Basic concurrent operations (3 workers)
- High concurrency (10 concurrent workers)
- Extreme stress (20 concurrent operations)
- Mixed operation types concurrently
- Batch operation efficiency
- Sequential after concurrent patterns
- Rapid-fire operations
- Varying timeout independence
- Error isolation between workers
- Memory leak detection
- Worker independence

**Requirements**: None (uses public testnet data)
**Execution Time**: ~3-5 minutes
**Run**:
```bash
npx vitest run tests/integration/worker-isolation.spec.ts
```

## Running Tests

### Run All Integration Tests
```bash
yarn test:integration
```

### Run With Wallet Funding
```bash
MNEMONIC="your-12-word-mnemonic" \
EVO_IDENTITY_ID="your-identity-id" \
yarn test:integration
```

### Run Specific Test File
```bash
npx vitest run tests/integration/identity-operations.spec.ts
npx vitest run tests/integration/identity-lifecycle.spec.ts
npx vitest run tests/integration/worker-isolation.spec.ts
```

### Run Specific Test
```bash
npx vitest run tests/integration/identity-operations.spec.ts --reporter=verbose -t "should fetch identity by ID"
```

### Watch Mode (for development)
```bash
npx vitest tests/integration/identity-operations.spec.ts
```

### With Debug Output
```bash
LOG_LEVEL=debug npx vitest run tests/integration/
```

### With Coverage
```bash
npx vitest run --coverage tests/integration/
```

## Environment Variables

### Required for Full Testing
```bash
# Funded testnet wallet mnemonic (for creation/topup tests)
MNEMONIC="word1 word2 word3 ... word12"

# Existing testnet identity ID (for topup tests)
EVO_IDENTITY_ID="5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk"

# Optional: Specific key ID for identity
EVO_KEY_ID=0
```

### Optional
```bash
# Enable worker debug output
LOG_LEVEL=debug

# Override testnet connection
DAPI_ADDRESSES="node1.testnet.host,node2.testnet.host"
```

## Environment Setup

### Getting Testnet DASH

1. Visit: https://testnet-faucet.dash.org
2. Enter wallet address: `yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy`
3. Request DASH (you'll receive test DASH)
4. Wait for confirmation (~10 seconds)
5. Verify balance before running creation tests

### Checking Wallet Balance

If you have dash-cli installed:
```bash
dash-cli -testnet getbalance
```

Or use blockchain explorer for testnet.

### Getting Existing Identity for Top-Up Tests

1. Create a test identity using creation tests
2. Note the identity ID from the result
3. Use that ID in `EVO_IDENTITY_ID` environment variable

## Test Characteristics

### What Gets Validated

**Worker Isolation:**
- Multiple workers run simultaneously without mutex errors
- Each worker has isolated WASM memory
- No "already locked to a reader" errors
- Proper resource cleanup between operations

**Operational Correctness:**
- Identity data is returned correctly
- Keys are retrieved properly
- Transactions are signed and broadcast
- Blockchain confirmation is waited for

**Performance:**
- Single operations complete in reasonable time
- Batch operations are efficient
- Concurrent operations don't slow each other
- No memory leaks under load

**Error Handling:**
- Non-existent identities return proper errors
- Validation errors are caught early
- Timeouts are handled gracefully
- Worker errors don't affect other workers

### Performance Expectations

| Operation | Time | Notes |
|-----------|------|-------|
| Single fetch | 1-3s | Network dependent |
| Batch fetch (5 items) | 3-8s | Single worker |
| Concurrent fetch (5) | 3-8s | Multiple workers |
| Identity creation | 30-120s | Blockchain confirmation |
| Identity top-up | 30-120s | Blockchain confirmation |
| Worker isolation (10 concurrent) | 10-30s | Mix of operations |
| Stress test (20 concurrent) | 30-60s | Heavy load test |

## Vitest Configuration

Configuration is in `vitest.config.ts`:

```typescript
{
  globals: true,            // Enable global describe/it/expect
  environment: 'node',      // Node.js environment
  testTimeout: 600000,      // 10 minutes for blockchain ops
  hookTimeout: 60000,       // 1 minute for setup/teardown
  teardownTimeout: 30000,   // 30 seconds for cleanup
  isolate: true,            // Isolate test contexts
}
```

### Per-Test Timeout Override

Tests can specify custom timeouts as the second parameter:

```typescript
it('long operation', async () => {
  // test code
}, 120000);  // 2 minute timeout
```

## Key Differences from Mocha

| Aspect | Mocha | Vitest |
|--------|-------|--------|
| Import | `import { expect } from 'chai'` | `import { expect } from 'vitest'` |
| Skip | `this.skip()` | early return or `it.skip()` |
| Timeout | `this.timeout(60000)` | `, 60000)` as 2nd param |
| Assertions | Chai syntax | Jest/Vitest syntax |
| Hooks | `before`/`after` | `beforeAll`/`afterAll` |

## Assertion Examples

```typescript
// Type checks
expect(result).toBeDefined();
expect(result).toBeNull();

// Property checks
expect(result).toHaveProperty('id');
expect(result).toHaveProperty('id', 'some-value');

// Array checks
expect(results).toHaveLength(3);
expect(results).toContain(item);

// Error handling
expect(async () => { throw new Error(); }).rejects.toThrow();

// Type assertions
expect(value).toBeTypeOf('string');
expect(value).toBeInstanceOf(Array);

// Numeric
expect(value).toBeGreaterThan(0);
expect(value).toBeLessThanOrEqual(100);

// String matching
expect(msg).toMatch(/pattern/);
expect(msg).toContain('substring');
```

## Troubleshooting

### Issue: Tests timeout after 600000ms

**Cause**: Testnet is slow or unreachable

**Solutions**:
- Increase timeout: Add per-test timeout
- Check testnet health
- Verify internet connection
- Check firewall rules

```bash
# Increase global timeout
npx vitest run tests/integration/ --testTimeout=900000
```

### Issue: "Cannot find module 'wasm-operations.js'"

**Cause**: Worker file path issues

**Solutions**:
1. Rebuild: `yarn build`
2. Verify dist/ exists: `ls dist/`
3. Check worker file: `ls packages/js-evo-sdk/workers/wasm-operations.js`

### Issue: "Failed to fetch identity: not found"

**Cause**: Test identity doesn't exist on testnet

**Solutions**:
- Verify testnet is accessible
- Use different identity from TEST_IDS
- Check identity is on correct network

### Issue: "Insufficient funds" for creation tests

**Cause**: Testnet wallet empty

**Solutions**:
1. Check balance: `dash-cli -testnet getbalance`
2. Get DASH from faucet: https://testnet-faucet.dash.org
3. Address: `yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy`
4. Wait for confirmation

### Issue: "Worker timeout" errors

**Cause**:
- Very short timeout configured
- Slow network
- WASM operations taking longer than expected

**Solutions**:
- Increase timeout
- Check network latency
- Try again later

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - run: yarn install
      - run: yarn build

      - name: Run worker isolation tests
        run: yarn test:integration -- tests/integration/worker-isolation.spec.ts

      - name: Run operations tests
        run: yarn test:integration -- tests/integration/identity-operations.spec.ts
```

## Test Development

### Adding New Integration Tests

1. Create test file: `tests/integration/new-feature.spec.ts`
2. Use Vitest syntax:
   ```typescript
   import { describe, it, expect } from 'vitest';

   describe('Feature', () => {
     it('should do something', async () => {
       // test code
     }, 60000);  // timeout
   });
   ```

3. Use worker isolation:
   ```typescript
   import { runWasmOperation } from '../../dist/identities/utils/wasm-worker-runner.js';

   const result = await runWasmOperation('operation-name', {
     param1: 'value',
   }, {
     timeout: 60000,
   });
   ```

4. Run and verify locally
5. Add to CI/CD if needed

## Related Documentation

- **TESTING.md** - Unit test documentation
- **wasm-worker-runner.ts** - Worker isolation implementation
- **vitest.config.ts** - Vitest configuration
- **workers/operations/** - Operation handlers

## Summary

The integration tests:
- Use Vitest with proper configuration
- Prevent WASM concurrency errors with worker isolation
- Cover identity operations (fetch, create, topup)
- Validate worker isolation prevents mutex conflicts
- Test error handling and edge cases
- Support CI/CD integration
- Work with optional wallet funding
- Include stress testing with 20 concurrent operations

These tests are essential for validating that the worker isolation pattern solves the WASM concurrency problem while maintaining correctness and performance.
