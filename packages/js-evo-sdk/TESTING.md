# WASM SDK Integration Testing Guide

## Overview

This document provides comprehensive guidance for testing the js-evo-sdk package, which integrates with the WASM SDK for Dash Platform operations.

## Test Architecture

The js-evo-sdk uses a two-tier testing strategy:

### Tier 1: Unit Tests (Mocked WASM)
- **Location**: `tests/unit/facades/**/*.spec.mjs`
- **Speed**: <2 seconds total
- **Network**: No network required
- **WASM SDK**: Fully mocked using Sinon stubs
- **Purpose**: Fast feedback for input validation, parameter conversion, error handling
- **Run**: `npm run test:unit`

**Advantages:**
- Fast execution, great for local development
- No external dependencies required
- Good for testing business logic and error paths
- Can run in CI/CD without testnet access

**Coverage:**
- Input validation (mnemonics, amounts, identities)
- Parameter conversion (string to BigInt, etc.)
- Error handling and wrapping
- Options handling and defaults
- Deprecation warnings

### Tier 2: Functional Tests (Real WASM + Testnet)
- **Location**: `tests/functional/**/*.spec.mjs`
- **Speed**: 1-2 minutes total
- **Network**: Requires Dash Platform testnet connection
- **WASM SDK**: Real WASM operations
- **Purpose**: End-to-end validation with real platform data
- **Run**: `npm run test:functional`

**Status Note:** Functional tests currently fail due to WASM SDK concurrency issues (see "Known Limitations" below). These tests are valuable for integration validation but require the WASM SDK to implement proper reader isolation.

## Running Tests

### Run All Unit Tests (Recommended for Development)
```bash
npm run test:unit
```

Expected output: `228 passing`

### Run Only Mocha Unit Tests (Skip Karma browser tests)
```bash
npx mocha 'tests/unit/**/*.spec.mjs'
```

### Run Specific Test Suite
```bash
npx mocha 'tests/unit/facades/identity-creator.spec.mjs'
npx mocha 'tests/unit/facades/identity-fetcher.spec.mjs'
npx mocha 'tests/unit/facades/credit-operations.spec.mjs'
npx mocha 'tests/unit/facades/identity-updater.spec.mjs'
```

### Run Functional Tests (Requires Testnet)
```bash
npm run test:functional
```

Note: This will fail due to WASM SDK concurrency issues but attempts to validate end-to-end operations.

### Run Specific Functional Test
```bash
npx mocha 'tests/functional/identities.spec.mjs' --exit --timeout 90000
```

## Test Suites Overview

### Unit Tests (Fully Passing ✅)

#### 1. SDK Core Tests
- `tests/unit/sdk.spec.mjs` - SDK factory methods and configuration
- `tests/unit/wallet.spec.mjs` - Wallet helper functions (mnemonic generation, key derivation)

#### 2. Facade Input Validation Tests
- `tests/unit/facades/identity-creator.spec.mjs` - Identity creation validation
  - Mnemonic format validation
  - Amount range validation (200000 - 100000000000 duffs)
  - Start height validation (1 - 10000000)
  - Options handling

- `tests/unit/facades/identity-fetcher.spec.mjs` - Identity fetching
  - Parameter validation
  - Error wrapping for network and proof errors
  - Methods: fetch, getKeys, balance, nonce, etc.

- `tests/unit/facades/identity-updater.spec.mjs` - Identity top-up
  - topUpWithWallet validation
  - topUpWithAccount (deprecated) testing
  - Amount minimum is lower than create (100000 duffs)

- `tests/unit/facades/credit-operations.spec.mjs` - Credit operations
  - creditTransfer parameter handling
  - creditWithdrawal parameter handling
  - Amount type conversion (string, number, BigInt)

#### 3. Other Facade Tests
- `tests/unit/facades/contracts.spec.mjs` - Data contract operations
- `tests/unit/facades/documents.spec.mjs` - Document querying
- `tests/unit/facades/tokens.spec.mjs` - Token operations
- `tests/unit/facades/system.spec.mjs` - System information
- `tests/unit/facades/dpns.spec.mjs` - DPNS operations
- `tests/unit/facades/group.spec.mjs` - Group operations
- `tests/unit/facades/voting.spec.mjs` - Voting operations
- `tests/unit/facades/epoch.spec.mjs` - Epoch information
- `tests/unit/facades/protocol.spec.mjs` - Protocol information

#### 4. Test Statistics
- **Total Unit Tests**: 228 ✅
- **Time**: <2 seconds
- **Framework**: Mocha + Chai + Sinon
- **Pass Rate**: 100%

### Functional Tests (Partially Failing Due to WASM Issues)

#### Identity Operations
- `tests/functional/identities.spec.mjs`
  - fetch/getWithProof/fetchUnproved
  - getKeys methods
  - balance and nonce queries
  - identity discovery by hash

#### Platform Data
- `tests/functional/documents.spec.mjs`
- `tests/functional/contracts.spec.mjs`
- `tests/functional/tokens.spec.mjs`
- `tests/functional/dpns.spec.mjs`

#### System Information
- `tests/functional/system.spec.mjs`
- `tests/functional/protocol.spec.mjs`
- `tests/functional/epoch.spec.mjs`

## Known Limitations

### WASM SDK Concurrency Issue

**Problem**: Functional tests fail with "already locked to a reader" error.

**Root Cause**: The WASM SDK uses a Rust mutex that enforces exclusive reader locking. When multiple async operations try to access the WASM SDK simultaneously, the Rust error propagates.

**Evidence**:
```
Error: already locked to a reader
  at imports.wbg.__wbg_wbindgenthrow_4c11a24fca429ccf
```

**Current Workaround**: The `wasm-worker-runner.ts` utility spawns child processes (Node.js) or Web Workers (browser) to isolate WASM operations:
```typescript
// Isolated operation - safe from concurrency issues
const result = await runWasmOperation('identity-fetch', { identityId }, {});
```

**Note**: This affects concurrent WASM operations but unit tests with mocked WASM pass perfectly (228 tests).

## Test Configuration

### TypeScript Configuration
- **File**: `tsconfig.json`
- **Target**: ES2022
- **Module**: ESNext
- **Strict**: true

### Test Framework
- **Framework**: Mocha 11.1.0
- **Assertions**: Chai 4.3.10
- **Mocking**: Sinon 17.0.1
- **Module System**: ES Modules (.mjs files)

## Writing New Tests

### Unit Test Template
```javascript
import { expect } from 'chai';
import sinon from 'sinon';
import init, * as wasmSDKPackage from '@dashevo/wasm-sdk';
import { EvoSDK } from '../../../dist/sdk.js';

describe('NewFeature', () => {
  let wasmSdk;
  let client;
  let sandbox;

  beforeEach(async function setup() {
    // Initialize real WASM SDK for initialization tests
    await init();
    const builder = wasmSDKPackage.WasmSdkBuilder.testnetTrusted();
    wasmSdk = builder.build();
    client = EvoSDK.fromWasm(wasmSdk);
    sandbox = sinon.createSandbox();

    // Mock specific methods
    sandbox.stub(wasmSdk, 'identityFetch');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should validate input', async () => {
    await expect(client.someMethod(null))
      .to.be.rejectedWith('Parameter is required');
  });

  it('should convert types correctly', async () => {
    wasmSdk.identityFetch.resolves({ id: 'test-id' });

    const result = await client.identities.fetch('test-id');

    expect(wasmSdk.identityFetch).to.have.been.calledOnce;
    expect(result.id).to.equal('test-id');
  });
});
```

### Key Testing Patterns

**Testing async rejections:**
```javascript
await expect(myAsyncFunction()).to.be.rejectedWith('Error message');
```

**Testing error types:**
```javascript
expect(() => { ... }).to.throw(ValidationError);
```

**Stubbing WASM methods:**
```javascript
sandbox.stub(wasmSdk, 'methodName').resolves(mockValue);
sandbox.stub(wasmSdk, 'methodName').rejects(new Error('Failed'));
```

**Checking call arguments:**
```javascript
const callArgs = stub.firstCall.args;
expect(callArgs[0]).to.equal(expectedValue);
```

## Debugging Tests

### Run Tests with Debug Output
```bash
LOG_LEVEL=debug npm run test:unit
```

### Run Single Test
```bash
npx mocha 'tests/unit/facades/identity-creator.spec.mjs' --grep "should reject"
```

### Run Tests with Detailed Output
```bash
npx mocha 'tests/unit/**/*.spec.mjs' --reporter spec
```

### Increase Mocha Timeout
```bash
npx mocha 'tests/unit/**/*.spec.mjs' --timeout 10000
```

## CI/CD Integration

### GitHub Actions
The unit tests are suitable for CI/CD pipelines:

```yaml
- name: Run Unit Tests
  run: npm run test:unit
  timeout-minutes: 5
```

### Performance Expectations
- Unit tests: <2 seconds
- Full test suite with Karma: ~20 seconds
- Functional tests (if WASM concurrency fixed): ~2 minutes

## Troubleshooting

### Issue: "Cannot find module @dashevo/wasm-sdk"
**Solution**: Rebuild the project
```bash
npm run build
```

### Issue: "dashcore-lib multiple instances found"
**This is a warning**, not an error. It occurs when multiple packages require dashcore-lib. The tests still pass.

### Issue: Functional tests timeout
**Expected behavior** - Functional tests hit WASM concurrency issues and may timeout. Unit tests should pass.

### Issue: Karma tests fail to run
**Solution**: Ensure dist/ directory exists
```bash
npm run build
```

## Performance Baseline

- Unit tests: 228 tests in <1 second
- Mocha only (no Karma): <500ms
- Full unit test suite with Karma: ~20 seconds
- Functional tests (with issues): 1-2 minutes before failing

## Related Documentation

- **WASM Worker Runner**: `src/identities/utils/wasm-worker-runner.ts` - Child process isolation for WASM operations
- **Identity Facades**: `src/identities/facades/` - Coordinated identity operations
- **Identity Config**: `src/identities/config/operation-config.ts` - Constants and limits
- **Test Fixtures**: `tests/fixtures/testnet.mjs` - Test data and constants

## Contributing Tests

When adding new features:

1. **Create unit tests first** - Test with mocked WASM
2. **Test validation logic** - Input validation, parameter conversion
3. **Test error cases** - Both expected errors and edge cases
4. **Add to coverage** - Aim for >90% coverage in new code
5. **Document patterns** - Use consistent test structure

Example:
```javascript
describe('NewFeature', () => {
  describe('Validation', () => {
    it('should reject invalid input');
    it('should accept valid input');
  });

  describe('Type Conversion', () => {
    it('should convert string to BigInt');
  });

  describe('Error Handling', () => {
    it('should wrap WASM errors');
    it('should handle network failures');
  });
});
```

## Future Improvements

1. **Fix WASM Concurrency** - Implement proper reader isolation in WASM SDK
2. **Integration Tests** - Once WASM is fixed, functional tests will fully validate end-to-end operations
3. **Performance Tests** - Add benchmarks for common operations
4. **Snapshot Tests** - Validate complex response structures
5. **Property-Based Tests** - Use generative testing for validation logic

## Contact & Support

For test-related issues:
- Check existing test files for patterns
- Review Mocha/Chai/Sinon documentation
- Examine error messages and stack traces
- Enable DEBUG output for detailed diagnostics
