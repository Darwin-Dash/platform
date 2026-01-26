# CLAUDE.md - js-evo-sdk

This file provides guidance to Claude Code when working with the js-evo-sdk package.

## Package Overview

The js-evo-sdk is a comprehensive JavaScript/TypeScript SDK for interacting with Dash Platform. It provides facades for identities, DPNS, documents, tokens, DashPay, and more.

## Commands

```bash
# Run all unit tests (Vitest)
yarn test:unit

# Run integration tests
yarn test:integration

# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run E2E tests (Playwright)
yarn test:e2e

# TypeScript type checking
yarn tsc -p tsconfig.json --noEmit

# Build the package
yarn build
```

## Architecture

### Facade Pattern

The SDK uses a facade pattern to provide clean APIs:

```
src/
├── identities/facade.ts    # Identity operations
├── dpns/facade.ts          # DPNS name registration/resolution
├── documents/facade.ts     # Document CRUD operations
├── tokens/facade.ts        # Token operations
├── dashpay/facade.ts       # DashPay profiles and contacts
├── addresses/facade.ts     # Address-based operations
├── protocol/facade.ts      # Protocol queries
├── epoch/facade.ts         # Epoch information
└── system/facade.ts        # System status
```

### Test Structure

```
tests/
├── unit/facades/           # Unit tests with mocked WASM (Vitest)
├── unit/errors/            # Error class tests
├── integration/            # Integration tests with real WASM (Vitest)
└── setup.ts                # Test setup and mock utilities
```

## Testing Framework

The SDK uses **Vitest** for all unit and integration tests:

### Vitest Patterns

**Mock Creation:**
```typescript
import { vi, Mock } from 'vitest';

// Create mocks in beforeEach to ensure fresh state
beforeEach(() => {
  mockWasmSdk = {
    getIdentity: vi.fn().mockResolvedValue(mockIdentity),
    // ...
  };
});
```

**Assertions:**
```typescript
expect(mock).toHaveBeenCalledOnce();
expect(mock).toHaveBeenCalledWith(arg1, arg2);
expect(result).toEqual(expected);
expect(result).toBeInstanceOf(Map);
```

**Error Testing:**
```typescript
await expect(someFunction()).rejects.toThrow('error message');
```

### Test Coverage Status

- 381 unit tests across 21 test files
- All facades have error scenario coverage
- Integration tests require WASM SDK

## Development Learnings

### Mock Patterns
- Create mocks inside `beforeEach()` to ensure fresh state each test
- Module-level mocks get cleared by `vi.clearAllMocks()` - use `beforeEach` to recreate
- When testing facades that use `sdk.getWasmSdkConnected()`, mock both the SDK and WASM SDK:
  ```typescript
  mockEvoSdk = {
    getWasmSdkConnected: vi.fn().mockResolvedValue(mockWasmSdk),
  };
  ```

### Error Testing
- CreditOperations wraps errors with prefix - use `.include()` not `.equal()` for messages
- Amount validation happens before WASM stub - use valid amounts when testing other error paths
- `getIdentityIds()` creates its own DAPIClient internally - needs integration testing, not unit testing

## Related Files

- `package.json` - Dependencies and scripts
- `vitest.config.ts` - Vitest configuration (unit + integration tests)
- `tests/setup.ts` - Test setup with createMockWasmSdk helper
- `playwright.config.ts` - E2E test configuration (Playwright)
