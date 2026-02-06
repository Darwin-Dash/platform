# js-evo-sdk Testing Guide

## Overview

This document provides comprehensive guidance for testing the js-evo-sdk package, which integrates with the WASM SDK for Dash Platform operations.

## Test Architecture

The js-evo-sdk uses a multi-tier testing strategy:

### Tier 1: Unit Tests (Mocked WASM)
- **Location**: `tests/unit/facades/**/*.spec.ts`
- **Framework**: Vitest
- **Speed**: <10 seconds total
- **Network**: No network required
- **WASM SDK**: Fully mocked
- **Purpose**: Fast feedback for input validation, parameter conversion, error handling
- **Run**: `yarn test:unit`

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
- API method signatures

### Tier 2: Integration Tests (Real WASM + Testnet)
- **Location**: `tests/integration/**/*.spec.ts`
- **Framework**: Vitest
- **Speed**: 1-5 minutes total
- **Network**: Requires Dash Platform testnet connection
- **WASM SDK**: Real WASM operations
- **Purpose**: End-to-end validation with real platform data
- **Run**: `yarn test:integration`

### Tier 3: E2E Tests (Browser Automation)
- **Location**: `demo/tests/e2e/**/*.spec.js`
- **Framework**: Playwright
- **Speed**: 5-15 minutes
- **Network**: Requires running demo app and testnet
- **Purpose**: Full browser automation testing
- **Run**: `yarn test:e2e`

## Running Tests

### Quick Start

```bash
# Run all unit tests (recommended for development)
yarn test:unit

# Run integration tests (requires testnet)
yarn test:integration

# Run E2E tests (requires demo app)
yarn test:e2e

# Run all tests
yarn test
```

### Specific Test Commands

```bash
# Run single test file
yarn vitest run tests/unit/facades/identity-fetcher.spec.ts

# Run tests in watch mode
yarn vitest watch

# Run tests with coverage
yarn test:coverage

# Run tests matching pattern
yarn vitest run -t "should fetch identity"
```

### E2E Test Commands

```bash
# Run E2E tests with chromium
yarn playwright test --project=chromium

# Run E2E tests with firefox
yarn playwright test --project=firefox

# Run real testnet E2E tests
yarn playwright test --project=testnet

# Run specific E2E test file
yarn playwright test tests/e2e/wallet.spec.js
```

## Test Suites Overview

### Unit Tests

#### SDK Core Tests
- `tests/unit/sdk.spec.ts` - SDK factory methods and configuration
- `tests/unit/wallet.spec.ts` - Wallet helper functions

#### Facade Tests
| Test File | Coverage |
|-----------|----------|
| `identity-fetcher.spec.ts` | Identity fetching, keys, balance, nonce |
| `identity-creator.spec.ts` | Identity creation with wallet |
| `identity-updater.spec.ts` | Identity top-up operations |
| `identity-discovery.spec.ts` | Identity discovery by hash |
| `credit-operations.spec.ts` | Credit transfers and withdrawals |
| `contracts.spec.ts` | Data contract operations |
| `documents.spec.ts` | Document CRUD operations |
| `tokens.spec.ts` | Token operations |
| `dpns.spec.ts` | DPNS name registration/resolution |
| `dashpay.spec.ts` | DashPay profiles and contacts |
| `addresses.spec.ts` | Address-based operations |
| `system.spec.ts` | System information |
| `epoch.spec.ts` | Epoch information |
| `protocol.spec.ts` | Protocol version info |
| `group.spec.ts` | Group operations |
| `voting.spec.ts` | Voting operations |
| `utxo-operations.spec.ts` | UTXO management |

### Integration Tests

| Test File | Coverage |
|-----------|----------|
| `identity.spec.ts` | Identity fetch, keys, balance |
| `dpns.spec.ts` | DPNS resolution on testnet |
| `documents.spec.ts` | Document queries on testnet |
| `tokens.spec.ts` | Token operations on testnet |
| `wasm-concurrency.spec.ts` | WASM concurrency handling |

### E2E Tests

| Test File | Coverage |
|-----------|----------|
| `identity-creation.spec.js` | Identity creation flow |
| `identity-topup.spec.js` | Top-up flow |
| `dpns-operations.spec.js` | DPNS UI operations |
| `wallet.spec.js` | Wallet operations |
| `network-switcher.spec.js` | Network switching |
| `error-handling.spec.js` | Error states |
| `visual-regression.spec.js` | Screenshot comparisons |
| `performance.spec.js` | Performance metrics |
| `responsive.spec.js` | Mobile/tablet views |

### Real Network E2E Tests

Located in `demo/tests/e2e/real-network/`:
- `write-identity-create.spec.js` - Identity creation on testnet
- `write-dpns-register.spec.js` - DPNS registration on testnet
- `write-identity-topup.spec.js` - Top-up on testnet

These require `MNEMONIC` environment variable:
```bash
MNEMONIC="your twelve word mnemonic" yarn playwright test --project=testnet
```

## Writing New Tests

### Unit Test Template (Vitest)

```typescript
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { SomeFacade } from '../../../src/some/facade';

describe('SomeFacade', () => {
  let mockWasmSdk: any;
  let facade: SomeFacade;

  beforeEach(() => {
    mockWasmSdk = {
      someMethod: vi.fn(),
    };
    facade = new SomeFacade(mockWasmSdk);
  });

  describe('someOperation', () => {
    it('should validate input', async () => {
      await expect(facade.someMethod(null as any))
        .rejects.toThrow('Parameter is required');
    });

    it('should call WASM SDK with correct args', async () => {
      mockWasmSdk.someMethod.mockResolvedValue({ result: 'test' });

      const result = await facade.someMethod('valid-input');

      expect(mockWasmSdk.someMethod).toHaveBeenCalledOnce();
      expect(mockWasmSdk.someMethod).toHaveBeenCalledWith('valid-input');
      expect(result).toEqual({ result: 'test' });
    });

    it('should handle errors', async () => {
      mockWasmSdk.someMethod.mockRejectedValue(new Error('WASM error'));

      await expect(facade.someMethod('input'))
        .rejects.toThrow('WASM error');
    });
  });
});
```

### Integration Test Template

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestnetSDK } from '../lib/helpers';
import { TEST_TIMEOUTS, TESTNET_IDENTITIES } from '../lib/fixtures';

describe('Integration: SomeFeature', () => {
  let sdk: EvoSDK;

  beforeAll(async () => {
    sdk = await createTestnetSDK();
  }, TEST_TIMEOUTS.SDK_INIT);

  afterAll(async () => {
    await sdk?.disconnect();
  });

  it('should work with real testnet', async () => {
    const result = await sdk.someOperation(TESTNET_IDENTITIES.SAMPLE);
    expect(result).toBeDefined();
  }, TEST_TIMEOUTS.NETWORK_OPERATION);
});
```

### E2E Test Template (Playwright)

```javascript
import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded, waitForDashboard } from './helpers/test-setup.js';

test.describe('Feature Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
    await page.waitForTimeout(500);
  });

  test('should display feature', async ({ page }) => {
    await waitForDashboard(page);

    const element = page.locator('.feature-element');
    await expect(element).toBeVisible();
  });

  test('should handle user interaction', async ({ page }) => {
    await waitForDashboard(page);

    await page.getByRole('button', { name: /action/i }).click();
    await page.waitForTimeout(300);

    const result = page.locator('.result');
    await expect(result).toBeVisible();
  });
});
```

## Test Configuration

### Vitest Configuration (`vitest.config.ts`)

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/unit/**/*.spec.ts',
      'tests/integration/**/*.spec.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

### Playwright Configuration (`playwright.config.ts`)

```typescript
export default defineConfig({
  testDir: './demo/tests/e2e',
  timeout: 120000,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'testnet', testDir: './demo/tests/e2e/real-network', timeout: 300000 },
  ],
});
```

## Debugging Tests

### Vitest Debugging

```bash
# Run with verbose output
yarn vitest run --reporter=verbose

# Run single test with debug logs
LOG_LEVEL=debug yarn vitest run -t "test name"

# Run in UI mode
yarn vitest --ui
```

### Playwright Debugging

```bash
# Run with headed browser
yarn playwright test --headed

# Run with debug mode
PWDEBUG=1 yarn playwright test

# Generate test report
yarn playwright test && yarn playwright show-report
```

## CI/CD Integration

### GitHub Actions Workflows

- **Unit Tests**: `.github/workflows/ci.yml`
- **E2E Tests**: `.github/workflows/e2e.yml`
- **Coverage**: `.github/workflows/coverage.yml`

### Performance Expectations

| Test Type | Duration |
|-----------|----------|
| Unit tests | <10 seconds |
| Integration tests | 2-5 minutes |
| E2E tests (mock) | 5-10 minutes |
| E2E tests (testnet) | 10-20 minutes |

## Troubleshooting

### Issue: "Cannot find module @dashevo/wasm-sdk"
**Solution**: The package should resolve from the workspace. Check yarn.lock.

### Issue: Integration tests timeout
**Cause**: Testnet may be slow or unreachable.
**Solution**: Increase timeout or check network connectivity.

### Issue: E2E tests fail with "Cannot navigate to invalid URL"
**Cause**: Web server not running.
**Solution**: Ensure `yarn demo:web:dev` is running or let Playwright start it.

### Issue: Visual regression tests fail
**Cause**: UI changed, screenshots need updating.
**Solution**: Review changes and update baselines:
```bash
yarn playwright test --update-snapshots
```

## Test Coverage

Target coverage for new code: >80%

View coverage report:
```bash
yarn test:coverage
open coverage/index.html
```

## Contact Request Lifecycle Test

The full contact lifecycle test verifies the complete DashPay contact flow:
1. Login with wallet containing 2+ identities with DPNS names
2. Send contact request from identity A to identity B
3. Switch to identity B
4. Accept the incoming contact request
5. Verify contact appears in contacts list

### Running the Test

The tests use the `MNEMONIC` environment variable from `.env` file (loaded automatically via dotenv).
You can also set it explicitly:

```bash
# Using the dedicated script (uses .env automatically)
yarn test:e2e:lifecycle

# Or with explicit mnemonic
MNEMONIC="your wallet mnemonic" TEST_CONTACT_LIFECYCLE=true yarn test:e2e:lifecycle
```

### Requirements
- Wallet with at least 2 identities that have DPNS names registered
- Sufficient credits on both identities for document operations
- No existing contact relationship between the identities (test finds available pair automatically)

### DPNS Regression Test

A narrower regression test is also available to verify DPNS resolution works after SDK initialization:

```bash
# Using .env automatically
yarn test:e2e:dpns

# Or explicitly
yarn test:e2e -- --grep "DPNS resolution"
```

This test catches the "Contract Not Found" error that occurs when the SDK is not properly connected.

## Related Documentation

- **CLAUDE.md** - Package overview and commands
- **IDENTITY_ARCHITECTURE.md** - Identity operations architecture
- **vitest.config.ts** - Vitest configuration
- **playwright.config.ts** - Playwright E2E configuration
