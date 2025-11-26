# Migration Guide

This guide helps you migrate from the previous packages to `@dashevo/transaction-finder`.

## Quick Reference

| Old Package | New Mode | Migration Complexity |
|-------------|----------|---------------------|
| `@dashevo/dash-utxo-finder` | Historic Mode | Low - Simple API mapping |
| `@dashevo/instantsend-chainlock-monitor` | Realtime Mode | Medium - Config changes |

## From @dashevo/dash-utxo-finder

### Basic UTXO Finding

**Before:**
```typescript
import { UTXOFinder } from '@dashevo/dash-utxo-finder';

const finder = new UTXOFinder(dapiClient, 'testnet');

const utxo = await finder.findLatestSpendableUTXO(
  ['yX3CJJ42...'],
  {
    fromHeight: 1,
    toHeight: 1000,
    requiredAmount: 100000,
  }
);
```

**After:**
```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  network: 'testnet',
  addresses: ['yX3CJJ42...'],
  dapiClient: dapiClient,
  fromHeight: 1,
  toHeight: 1000,
  requiredAmount: 100000,
});

const utxo = await finder.findLatestSpendableUTXO();
```

**Key Changes:**
1. Configuration moved to constructor (addresses, height range)
2. Explicit `mode` parameter
3. Methods no longer take addresses as parameters

### Progress Tracking

**Before:**
```typescript
finder.on('progress', ({ progress, syncedBlocks, totalBlocks }) => {
  console.log(`Progress: ${progress}%`);
});

const utxo = await finder.findLatestSpendableUTXO(addresses, options);
```

**After:**
```typescript
const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  network: 'testnet',
  addresses: addresses,
  dapiClient: dapiClient,
  fromHeight: 1,
  onProgress: (progress) => {
    console.log(`Progress: ${progress.progress}%`);
  },
});

const utxo = await finder.findLatestSpendableUTXO();
```

**Key Changes:**
1. `onProgress` callback moved to config
2. Events still available: `finder.on('progress', ...)`

### Network Configuration

**Before:**
```typescript
const finder = new UTXOFinder(dapiClient, 'testnet');
finder.setNetwork('mainnet');
```

**After:**
```typescript
// Network is immutable in new API - create new instance
const testnetFinder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  network: 'testnet',
  // ...
});

const mainnetFinder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  network: 'mainnet',
  // ...
});
```

**Key Changes:**
1. No `setNetwork()` method - create new instance instead
2. Promotes immutability and clearer state management

## From @dashevo/instantsend-chainlock-monitor

### Basic Transaction Monitoring

**Before:**
```typescript
import { InstantSendChainLockMonitor } from '@dashevo/instantsend-chainlock-monitor';

const monitor = new InstantSendChainLockMonitor({
  network: 'testnet',
  dapiAddresses: ['54.186.154.251:1443'],
  logLevel: 'info',
});

const unsubscribe = await monitor.watchAddresses(
  'yX3CJJ42...',
  {
    onTransaction: (tx) => console.log('TX:', tx.txid),
    onInstantLock: (lock) => console.log('InstantLocked!'),
    onChainLock: (cl) => console.log('ChainLocked!'),
  }
);

// Later: stop
unsubscribe();
```

**After:**
```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

const finder = new TransactionFinder({
  mode: FinderMode.REALTIME,
  network: 'testnet',
  addresses: ['yX3CJJ42...'],
  dapiAddresses: ['54.186.154.251:1443'],
  logLevel: 'info',
});

const unsubscribe = await finder.monitorAddresses(
  ['yX3CJJ42...'],
  {
    onTransaction: (tx) => console.log('TX:', tx.txid),
    onInstantLock: (lock) => console.log('InstantLocked!'),
    onChainLock: (cl) => console.log('ChainLocked!'),
  }
);

// Later: stop
unsubscribe();
```

**Key Changes:**
1. Rename `watchAddresses` → `monitorAddresses`
2. Add `mode: FinderMode.REALTIME`
3. Addresses moved to config (still passed to monitorAddresses for compatibility)

### Wait for Confirmation

**Before:**
```typescript
const result = await monitor.waitForConfirmation(
  'abc123...',
  'yX3CJJ42...',
  {
    requireInstantLock: true,
    timeout: 180000,
  }
);

if (result.method === 'instantlock') {
  console.log('Confirmed via InstantSend');
}
```

**After:**
```typescript
const result = await finder.waitForConfirmation(
  'abc123...',
  {
    requireInstantLock: true,
    timeout: 180000,
  }
);

if (result.method === 'instantlock') {
  console.log('Confirmed via InstantSend');
}
```

**Key Changes:**
1. Address parameter removed (uses config addresses)
2. Same options and return types

### Configuration Options

**Before:**
```typescript
{
  network: 'testnet',
  dapiAddresses: [...],
  timeout: 60000,
  retries: 15,
  bloomFalsePositiveRate: 0.0001,
  logLevel: 'info',
  autoPruneOnConfirmation: false,
  maxTrackedTransactions: 1000,
  basePollInterval: 5000,
  maxPollInterval: 30000,
  adaptivePolling: true,
}
```

**After:**
```typescript
{
  mode: FinderMode.REALTIME,
  network: 'testnet',
  addresses: [...],           // NEW: required
  dapiAddresses: [...],
  timeout: 60000,
  retries: 15,
  bloomFalsePositiveRate: 0.0001,
  logLevel: 'info',
  autoPruneOnConfirmation: false,
  maxTrackedTransactions: 1000,
  basePollInterval: 5000,
  maxPollInterval: 30000,
  adaptivePolling: true,
}
```

**Key Changes:**
1. Add `mode` field
2. Add `addresses` field (was passed to methods before)
3. All other options remain the same

## Breaking Changes

### API Changes

1. **Constructor signature**: Configuration object structure changed
2. **Method parameters**: Addresses moved from method params to config
3. **Network mutability**: `setNetwork()` removed (create new instance)
4. **Package name**: `@dashevo/dash-utxo-finder` → `@dashevo/transaction-finder`
5. **Package name**: `@dashevo/instantsend-chainlock-monitor` → `@dashevo/transaction-finder`

### Configuration Changes

1. **Mode required**: Must specify `mode: FinderMode.HISTORIC | REALTIME | HYBRID`
2. **Addresses location**: Moved to top-level config
3. **DAPI client**: Accepts standard DAPIClient from @dashevo/dapi-client

### Import Changes

**Before:**
```typescript
import { UTXOFinder } from '@dashevo/dash-utxo-finder';
import { InstantSendChainLockMonitor } from '@dashevo/instantsend-chainlock-monitor';
```

**After:**
```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';
// Or use specific finders for advanced use cases
import { HistoricFinder, RealtimeFinder, HybridFinder } from '@dashevo/transaction-finder';
```

## New Capabilities

### Hybrid Mode (NEW!)

Combines both packages' functionality:

```typescript
const finder = new TransactionFinder({
  mode: FinderMode.HYBRID,
  network: 'testnet',
  addresses: ['yX3CJJ42...'],
  dapiClient: myDapiClient,
  historic: { fromHeight: 1 },
  realtime: { autoPruneOnConfirmation: true },
});

// One call does it all: sync history + monitor new transactions
const { utxos, stopMonitoring } = await finder.syncAndMonitor({
  onTransaction: (tx) => console.log('New TX:', tx.txid),
  onInstantLock: (lock) => console.log('InstantLocked!'),
  onChainLock: (cl) => console.log('ChainLocked!'),
});
```

### Type Safety

Full TypeScript support with compile-time mode checking:

```typescript
const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  // ... config
});

// TypeScript knows these are valid
await finder.findUTXOs();
await finder.findLatestSpendableUTXO();

// TypeScript error: method not available in this mode
await finder.monitorAddresses(...); // ❌ Compile error
```

## Troubleshooting

### "Module not found" errors

Make sure to install the package and its peer dependencies:

```bash
npm install @dashevo/transaction-finder @dashevo/dashcore-lib
```

### "Method only available in X mode" errors

Check your `mode` configuration matches the methods you're calling:
- Historic methods: `findUTXOs()`, `findLatestSpendableUTXO()`
- Realtime methods: `monitorAddresses()`, `waitForConfirmation()`
- Hybrid methods: All of the above + `syncAndMonitor()`

### Type errors with configuration

Make sure to import `FinderMode` enum:

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC, // ✅ Correct
  // mode: 'historic',        // ❌ Type error
  // ...
});
```

## Timeline for Deprecation

- **Current**: Both old packages and new package available
- **Next minor version**: Old packages marked as deprecated
- **Next major version**: Old packages removed

We recommend migrating as soon as possible to benefit from:
- Unified API
- Better type safety
- Hybrid mode capability
- Improved error handling
- Active maintenance

## Need Help?

- Examples: See [EXAMPLES.md](./EXAMPLES.md)
- API Reference: See [API.md](./API.md)
- Issues: [GitHub Issues](https://github.com/dashevo/platform/issues)
