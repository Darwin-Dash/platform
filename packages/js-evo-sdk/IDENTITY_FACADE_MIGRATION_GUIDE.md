# Identity Facade Migration Guide

## Overview

The identity operations API has been refactored from a monolithic facade to a modular architecture with specialized facades. This guide helps you migrate from deprecated methods to the new architecture.

## Quick Summary

| Old Method | New Method | Status | Migration Priority |
|------------|------------|--------|-------------------|
| `identities.createWithAccount()` | `identities.createWithWallet()` | Deprecated | High |
| `identities.topUpWithAccount()` | `identities.topUpWithWallet()` | Deprecated | High |
| All other methods | No change | Active | N/A |

## Migration Paths

### 1. Identity Creation

#### Old Pattern (Deprecated)
```typescript
// Pre-sync wallet account, then create identity
const account = await wallet.getAccount();
await account.sync();

const result = await sdk.identities.createWithAccount(account, 200000, {
  identityIndex: 0,
  useSourceAsChangeAddress: true
});
```

#### New Pattern (Recommended)
```typescript
// Direct creation with mnemonic - wallet coordination handled internally
const result = await sdk.identities.createWithWallet(
  'your twelve word mnemonic phrase here...',
  200000,
  {
    startHeight: 1,
    useSourceAsChangeAddress: true,
    onProgress: (event) => {
      console.log(`[${event.phase}] ${event.message}`);
      if (event.progress !== undefined) {
        console.log(`Progress: ${event.progress}%`);
      }
    }
  }
);

console.log('Identity created:', result.identityId);
console.log('Balance:', result.balance);
console.log('Transaction:', result.transactionHash);
```

**Benefits of New Pattern:**
- No manual wallet setup required
- Built-in progress tracking with detailed phase information
- Automatic identity discovery (finds next available identity index)
- Better error handling with domain-specific error classes
- Stateless - can be used in serverless/cloud functions

**Key Differences:**
- `mnemonic` replaces `account` - you provide the BIP39 phrase directly
- `startHeight` replaces account sync logic - specify blockchain height to start scanning
- `onProgress` callback provides detailed phase-by-phase updates
- No need to manually discover identity index - handled automatically

### 2. Identity Top-Up

#### Old Pattern (Deprecated)
```typescript
// Pre-sync wallet account, then top up
const account = await wallet.getAccount();
await account.sync();

const result = await sdk.identities.topUpWithAccount(
  'identityId123...',
  50000,
  account,
  {
    useSourceAsChangeAddress: true
  }
);
```

#### New Pattern (Recommended)
```typescript
// Direct top-up with mnemonic
const result = await sdk.identities.topUpWithWallet(
  'identityId123...',
  50000,
  'your twelve word mnemonic phrase here...',
  {
    startHeight: 1,
    useSourceAsChangeAddress: true,
    onProgress: (event) => {
      console.log(`[${event.phase}] ${event.message}`);
    }
  }
);

console.log('Identity topped up:', result.identityId);
console.log('New balance:', result.newBalance);
console.log('Added amount:', result.addedAmount);
```

**Benefits of New Pattern:**
- Same as creation - no manual wallet setup
- Progress tracking for long-running operations
- Lower minimum amount (50,000 duffs vs 200,000 for creation)
- Better error context and recovery options

## Progress Event Phases

Both `createWithWallet()` and `topUpWithWallet()` emit progress events through the `onProgress` callback:

### Creation Phases
1. **wallet_setup** - Initializing wallet, deriving keys, discovering UTXOs
2. **identity_discovery** - Scanning for existing identities to find next index
3. **transaction_creation** - Building asset lock transaction
4. **transaction_broadcast** - Broadcasting to network
5. **confirmation_wait** - Waiting for InstantLock or ChainLock
6. **identity_creation** - Submitting identity to Platform

### Top-Up Phases
1. **wallet_setup** - Same as creation
2. **transaction_creation** - Building asset lock transaction
3. **transaction_broadcast** - Broadcasting to network
4. **confirmation_wait** - Waiting for confirmation
5. **identity_topup** - Submitting top-up to Platform

### Event Structure
```typescript
interface OperationEvent {
  phase: string;           // Phase identifier
  status: 'start' | 'progress' | 'complete' | 'error';
  message: string;         // Human-readable description
  progress?: number;       // 0-100 percentage (if applicable)
  timestamp: number;       // Unix timestamp
  data?: any;             // Phase-specific data
}
```

## Error Handling

The new architecture uses domain-specific error classes for better error handling:

### Error Types

```typescript
import {
  ValidationError,        // Input validation failures
  WalletSetupError,      // Wallet initialization issues
  TransactionCreationError, // Transaction building failures
  TransactionBroadcastError, // Network broadcast issues
  ConfirmationTimeoutError,  // Lock confirmation timeouts
  PlatformSubmissionError,   // Platform identity creation/topup failures
  InsufficientFundsError,    // Not enough UTXOs
  NetworkError,              // DAPI connection issues
  ErrorHelpers               // Utility functions
} from '@dashevo/evo-sdk/identities/errors';
```

### Migration Example with Error Handling

#### Old Pattern
```typescript
try {
  const account = await wallet.getAccount();
  await account.sync();
  const result = await sdk.identities.createWithAccount(account, 200000);
} catch (error) {
  // Generic error - hard to know what went wrong
  console.error('Identity creation failed:', error.message);
  // Can't determine if retryable or what recovery action to take
}
```

#### New Pattern
```typescript
import { ErrorHelpers, ValidationError, NetworkError } from '@dashevo/evo-sdk';

try {
  const result = await sdk.identities.createWithWallet(
    mnemonic,
    200000,
    {
      startHeight: 1,
      onProgress: (event) => updateUI(event)
    }
  );

  console.log('Success:', result.identityId);

} catch (error) {
  // Intelligent error handling based on error type
  if (ErrorHelpers.isRecoverable(error)) {
    console.log('Retryable error - trying again...');
    // Implement retry logic
  } else if (error instanceof ValidationError) {
    console.error('Invalid input:', error.field, error.message);
    // Show user-friendly validation error
  } else if (error instanceof InsufficientFundsError) {
    const shortfall = error.requiredAmount - error.availableAmount;
    console.error(`Need ${shortfall} more duffs`);
    // Prompt user to add funds
  } else {
    console.error('Non-recoverable error:', error.message);
    // Log and report
  }
}
```

## Advanced: Accessing Specialized Facades

The new architecture exposes specialized facades for advanced use cases:

```typescript
const sdk = new EvoSDK({ network: 'testnet' });

// Access specialized facades directly
const fetcher = sdk.identities.fetcher;         // Read operations
const creditOps = sdk.identities.creditOps;     // Financial operations
const creator = sdk.identities.creator;         // Create identities
const updater = sdk.identities.updater;         // Top up identities
const discovery = sdk.identities.discovery;     // Discovery operations

// Example: Batch identity discovery
const hashes = [
  'abc123...', // 40-char hex hashes
  'def456...',
];
const results = await discovery.discoverByHashBatch(hashes);

// Example: Get single key without full identity fetch
const keys = await fetcher.getKey('identityId', 0);

// Example: List all keys with pagination
const allKeys = await fetcher.listKeys('identityId', 100, 0);
```

## Configuration Changes

### Amount Limits

| Operation | Minimum | Maximum | Notes |
|-----------|---------|---------|-------|
| Creation | 200,000 duffs | 100B duffs | 0.002 DASH minimum |
| Top-Up | 50,000 duffs | 100B duffs | 0.0005 DASH minimum |
| Transfer | 0 duffs | 100B duffs | Can transfer zero |
| Withdrawal | 0 duffs | 100B duffs | Plus network fees |

### Start Height

- **Minimum**: 1
- **Maximum**: 10,000,000
- **Default**: 1 (if not specified)
- **Recommendation**: Use recent blockchain height for faster sync

## Breaking Changes

### Removed from Public API

The following internal classes are no longer exposed:
- `Wallet` class from wallet-lib - use mnemonic directly
- `Account` class from wallet-lib - no longer needed

### Behavioral Changes

1. **Identity Index Discovery**
   - Old: Manual specification or wallet storage lookup
   - New: Automatic Platform query-based discovery

2. **UTXO Selection**
   - Old: Account-based UTXO management
   - New: Latest spendable UTXO strategy with validation

3. **Progress Reporting**
   - Old: Limited or no progress information
   - New: Detailed phase-by-phase progress events

## Migration Checklist

- [ ] Replace `createWithAccount()` calls with `createWithWallet()`
- [ ] Replace `topUpWithAccount()` calls with `topUpWithWallet()`
- [ ] Update wallet setup code (remove account sync logic)
- [ ] Add `onProgress` callbacks for better UX
- [ ] Implement error handling with domain-specific error classes
- [ ] Test with appropriate `startHeight` for your use case
- [ ] Update tests to use new method signatures
- [ ] Remove wallet-lib `Account` references from your code

## Timeline

- **Phase 6** (Nov 14, 2025): Facade refactoring completed
- **Phase 7** (Nov 14, 2025): Unit tests completed (150 tests passing)
- **Phase 8** (Nov 14, 2025): Documentation and migration guide
- **Deprecation Warning Period**: 3-6 months
- **Removal of Deprecated Methods**: TBD (likely 6-12 months)

## Support

If you encounter issues during migration:
1. Check error type using `error instanceof IdentityOperationError`
2. Use `ErrorHelpers.getDetails(error)` to get full context
3. Verify mnemonic format (12 words, space-separated)
4. Ensure amounts meet minimum requirements
5. Check startHeight is within valid range (1 - 10,000,000)

For questions or issues, please file an issue on the GitHub repository.
