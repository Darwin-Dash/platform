# @dashevo/transaction-finder

[![Tests](https://img.shields.io/badge/tests-257%20passing-brightgreen)](#running-tests)
[![Coverage](https://img.shields.io/badge/coverage-79%25-yellow)](#running-tests)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](./tsconfig.json)
[![License](https://img.shields.io/badge/license-MIT-green)](./package.json)

Unified transaction finding library for Dash Platform. Discover UTXOs through blockchain scanning and monitor transactions in real-time with InstantSend and ChainLock confirmations.

## Features

- 🔍 **Historic Mode**: Blockchain scanning for UTXO discovery from transaction history
- ⚡ **Realtime Mode**: Live InstantSend/ChainLock monitoring for incoming transactions
- 🔄 **Hybrid Mode**: Combined historic scanning + realtime monitoring for complete wallet sync
- 📦 **Lightweight**: Minimal dependencies, works in browsers and Node.js
- 🎯 **Type-Safe**: Full TypeScript support with strict typing
- 🔌 **Flexible**: Works with standard DAPIClient from @dashevo/dapi-client

## Installation

```bash
npm install @dashevo/transaction-finder
# or
yarn add @dashevo/transaction-finder
```

## Quick Start

### Historic Mode - Find UTXOs

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  network: 'testnet',
  addresses: ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
  dapiClient: myDapiClient,
  fromHeight: 1,
});

// Find all UTXOs
const utxos = await finder.findUTXOs();
console.log('Found', utxos.length, 'UTXOs');

// Or find just the latest spendable one
const latestUTXO = await finder.findLatestSpendableUTXO();
console.log('Latest UTXO:', latestUTXO.satoshis, 'satoshis');
```

### Realtime Mode - Monitor Payments

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

const finder = new TransactionFinder({
  mode: FinderMode.REALTIME,
  network: 'testnet',
  addresses: ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
  dapiClient: myDapiClient,
});

// Monitor for incoming transactions
await finder.monitorAddresses(['yX3CJJ42...'], {
  onTransaction: (tx) => {
    console.log('Transaction detected:', tx.txid);
  },
  onInstantLock: (lock) => {
    console.log('InstantLocked in', lock.latency, 'ms');
  },
  onChainLock: (cl) => {
    console.log('ChainLocked at height', cl.chainLockedHeight);
  },
});
```

### Hybrid Mode - Wallet Sync + Monitoring

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

const finder = new TransactionFinder({
  mode: FinderMode.HYBRID,
  network: 'testnet',
  addresses: ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
  dapiClient: myDapiClient,
  historic: {
    fromHeight: 1,
    onProgress: (progress) => {
      console.log(`Syncing: ${progress.progress.toFixed(1)}%`);
    },
  },
  realtime: {
    autoPruneOnConfirmation: true,
  },
});

// Sync history then monitor for new transactions
const { utxos, stopMonitoring } = await finder.syncAndMonitor({
  onTransaction: (tx) => console.log('New transaction:', tx.txid),
  onInstantLock: (lock) => console.log('InstantLocked!'),
  onChainLock: (cl) => console.log('ChainLocked!'),
});

console.log('Historic scan found', utxos.length, 'UTXOs');
console.log('Now monitoring for new transactions...');

// Later: stop monitoring when done
stopMonitoring();
```

## Modes

### Historic Mode

Scans blockchain history to discover UTXOs for a set of addresses. Perfect for:
- Initial wallet sync
- UTXO discovery for payment operations
- Historical transaction analysis

**Key Methods**:
- `findUTXOs()` - Returns all UTXOs found
- `findLatestSpendableUTXO()` - Returns single latest UTXO

**Configuration**:
```typescript
{
  mode: FinderMode.HISTORIC,
  network: 'testnet',
  addresses: string[],
  dapiClient: DAPIClientLike,
  fromHeight: number,        // Start block
  toHeight?: number,         // End block (default: current tip)
  requiredAmount?: number,   // Minimum satoshis needed
  timeout?: number,          // Stream timeout
}
```

### Realtime Mode

Monitors addresses for new transactions with InstantSend and ChainLock confirmations. Perfect for:
- Payment monitoring
- Transaction confirmation tracking
- Real-time wallet updates

**Key Methods**:
- `monitorAddresses(addresses, callbacks)` - Start monitoring
- `waitForConfirmation(txid, options)` - Wait for specific transaction
- `getTransaction(txid)` - Get transaction state
- `stop()` - Stop monitoring

**Configuration**:
```typescript
{
  mode: FinderMode.REALTIME,
  network: 'testnet',
  addresses: string[],
  dapiClient: DAPIClientLike,
  autoPruneOnConfirmation?: boolean,
  maxTrackedTransactions?: number,
  basePollInterval?: number,
  adaptivePolling?: boolean,
}
```

### Hybrid Mode

Combines historic scanning with realtime monitoring for complete wallet functionality. Perfect for:
- Full wallet sync workflows
- Complete transaction history with live updates
- Payment tracking from broadcast to final confirmation

**Key Methods**:
- `syncAndMonitor(callbacks)` - Full hybrid workflow
- `findUTXOs()` - Historic scan only
- `monitorAddresses(callbacks)` - Realtime only
- All methods from both Historic and Realtime modes

**Configuration**:
```typescript
{
  mode: FinderMode.HYBRID,
  network: 'testnet',
  addresses: string[],
  dapiClient: DAPIClientLike,
  historic: {
    fromHeight: number,
    toHeight?: number,
    onProgress?: (progress) => void,
  },
  realtime: {
    autoPruneOnConfirmation?: boolean,
    maxTrackedTransactions?: number,
  },
}
```

## Events

### Historic Mode Events

```typescript
finder.on('start', ({ addressCount, fromHeight }) => {});
finder.on('step', ({ step }) => {});
finder.on('progress', ({ progress, syncedBlocks, totalBlocks }) => {});
finder.on('found', ({ utxo, totalUTXOs }) => {});
finder.on('error', (error) => {});
```

### Realtime Mode Events

Callbacks are passed to `monitorAddresses()`:

```typescript
{
  onTransaction: (tx) => {},     // New transaction detected
  onInstantLock: (lock) => {},   // InstantLock received (~1-3s)
  onChainLock: (cl) => {},       // ChainLock received (~1-3min)
  onBlockInclusion: (block) => {}, // Transaction in block
}
```

### Hybrid Mode Events

```typescript
finder.on('historic:start', (data) => {});
finder.on('historic:progress', (data) => {});
finder.on('historic:found', (data) => {});
finder.on('phase', ({ phase, status }) => {});
finder.on('realtime:error', (error) => {});
```

## API Reference

### TransactionFinder

Main class with factory pattern. Creates appropriate finder based on mode.

#### Constructor

```typescript
new TransactionFinder(config: TransactionFinderConfig)
```

#### Methods

**Common Methods** (all modes):
- `getMode(): FinderMode` - Get current operating mode
- `getNetwork(): string` - Get configured network
- `getStatus(): any` - Get mode-specific status

**Historic Methods** (Historic/Hybrid modes only):
- `findUTXOs(): Promise<UTXO[]>` - Find all UTXOs
- `findLatestSpendableUTXO(): Promise<UTXO>` - Find latest UTXO

**Realtime Methods** (Realtime/Hybrid modes only):
- `monitorAddresses(addresses, callbacks): Promise<() => void>` - Monitor addresses
- `waitForConfirmation(txid, options): Promise<ConfirmationResult>` - Wait for TX confirmation
- `getTransaction(txid): TrackedTransaction | undefined` - Get transaction state
- `clearTransaction(txid): void` - Clear specific transaction
- `clearAllConfirmed(): void` - Clear all confirmed transactions
- `stop(): void` - Stop monitoring

**Hybrid Methods** (Hybrid mode only):
- `syncAndMonitor(callbacks): Promise<{utxos, stopMonitoring}>` - Full hybrid workflow

### Types

See [API.md](./API.md) for complete type definitions.

## Examples

See [EXAMPLES.md](./EXAMPLES.md) for detailed examples including:
- Wallet sync workflow
- Payment monitoring
- Transaction confirmation tracking
- Error handling and retries
- Memory management for long-running services

## Migration

Migrating from `@dashevo/dash-utxo-finder` or `@dashevo/instantsend-chainlock-monitor`? See [MIGRATION.md](./MIGRATION.md) for upgrade guide.

## Architecture

This package consolidates two previous packages:
- `@dashevo/dash-utxo-finder` → Historic mode
- `@dashevo/instantsend-chainlock-monitor` → Realtime mode

Benefits of consolidation:
- Unified API for all transaction finding needs
- Eliminated ~450 lines of duplicate code
- Shared core utilities (BloomFilter, Logger, StreamParser)
- Type-safe mode switching
- Better maintainability

## Browser Support

Works in modern browsers with Buffer polyfill:

```javascript
if (typeof window !== 'undefined' && !window.Buffer) {
  window.Buffer = require('buffer').Buffer;
}
```

## Performance

- **Historic Mode**: Efficient streaming with header pre-caching
- **Realtime Mode**: Adaptive polling reduces DAPI load
- **Memory**: Auto-pruning support for long-running services
- **Network**: Bloom filters minimize bandwidth usage

## License

MIT

## Contributing

This package is part of the [Dash Platform](https://github.com/dashevo/platform) monorepo.

## Support

- Documentation: [Dash Platform Docs](https://docs.dash.org/projects/platform/)
- Issues: [GitHub Issues](https://github.com/dashevo/platform/issues)
- Discord: [Dash Platform Discord](https://discord.gg/dash)
