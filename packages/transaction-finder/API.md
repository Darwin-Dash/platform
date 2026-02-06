# API Reference

Complete API documentation for `@dashevo/transaction-finder`.

## Table of Contents

- [TransactionFinder](#transactionfinder) - Main facade class
- [Configuration Types](#configuration-types)
- [Data Types](#data-types)
- [Event Types](#event-types)
- [Advanced Classes](#advanced-classes)

## TransactionFinder

Main unified facade class. Automatically creates the appropriate finder based on mode.

### Constructor

```typescript
new TransactionFinder(config: TransactionFinderConfig)
```

**Parameters:**
- `config` - Configuration object (type depends on mode)

**Example:**
```typescript
const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  network: 'testnet',
  addresses: ['yX3CJJ42...'],
  dapiClient: myDapiClient,
  fromHeight: 1,
});
```

### Common Methods

#### getMode()

Get the current operating mode.

```typescript
getMode(): FinderMode
```

**Returns:** `FinderMode.HISTORIC | FinderMode.REALTIME`

#### getNetwork()

Get the configured network.

```typescript
getNetwork(): string
```

**Returns:** `'mainnet' | 'testnet' | 'regtest'`

#### getStatus()

Get mode-specific status information.

```typescript
getStatus(): any
```

**Returns:**
- Historic mode: `{ mode: 'historic' }`
- Realtime mode: `{ active: boolean, trackedTransactions: number, chainLockHeight: number }`

#### stop()

Stop all operations (Realtime mode only).

```typescript
stop(): void
```

### Historic Mode Methods

Available when `mode: FinderMode.HISTORIC`.

#### findUTXOs()

Find all UTXOs for configured addresses.

```typescript
async findUTXOs(): Promise<UTXO[]>
```

**Returns:** Array of UTXO objects

**Throws:** Error if sync fails or no addresses configured

**Example:**
```typescript
const utxos = await finder.findUTXOs();
utxos.forEach(utxo => {
  console.log(`UTXO: ${utxo.txId}:${utxo.vout} - ${utxo.satoshis} sats`);
});
```

#### findLatestSpendableUTXO()

Find the latest spendable UTXO (highest block height, most recent).

```typescript
async findLatestSpendableUTXO(): Promise<UTXO>
```

**Returns:** Single UTXO object

**Throws:**
- Error if no spendable UTXOs found
- Error if UTXO amount < requiredAmount (if specified in config)

**Example:**
```typescript
const utxo = await finder.findLatestSpendableUTXO();
console.log('Latest UTXO:', utxo.satoshis, 'sats at height', utxo.blockHeight);
```

### Realtime Mode Methods

Available when `mode: FinderMode.REALTIME`.

#### monitorAddresses()

Start monitoring addresses for incoming transactions.

```typescript
async monitorAddresses(
  addresses: string | string[],
  callbacks: RealtimeFinderCallbacks
): Promise<() => void>
```

**Parameters:**
- `addresses` - Address or array of addresses to monitor
- `callbacks` - Event callbacks for transactions, locks, etc.

**Returns:** Cleanup function to stop monitoring

**Example:**
```typescript
const stopMonitoring = await finder.monitorAddresses(
  ['yX3CJJ42...'],
  {
    onTransaction: (tx) => console.log('TX:', tx.txid),
    onInstantLock: (lock) => console.log('InstantLocked in', lock.latency, 'ms'),
    onChainLock: (cl) => console.log('ChainLocked at', cl.chainLockedHeight),
  }
);

// Later: stop monitoring
stopMonitoring();
```

#### waitForConfirmation()

Wait for a specific transaction to be confirmed.

```typescript
async waitForConfirmation(
  txid: string,
  options?: ConfirmationOptions
): Promise<ConfirmationResult>
```

**Parameters:**
- `txid` - Transaction ID to wait for
- `options` - Confirmation requirements and timeout

**Returns:** Confirmation result with method, times, and latency

**Example:**
```typescript
const result = await finder.waitForConfirmation('abc123...', {
  requireInstantLock: true,
  requireChainLock: false,
  timeout: 180000, // 3 minutes
  onProgress: (status) => {
    console.log('Status:', status.status, '-', status.elapsedMs, 'ms');
  },
});

console.log('Confirmed via:', result.method);
console.log('Total latency:', result.totalLatencyMs, 'ms');
```

#### getTransaction()

Get current state of a tracked transaction.

```typescript
getTransaction(txid: string): TrackedTransaction | undefined
```

**Parameters:**
- `txid` - Transaction ID

**Returns:** Transaction state or undefined if not tracked

**Example:**
```typescript
const tx = finder.getTransaction('abc123...');
if (tx) {
  console.log('Status:', tx.status);
  console.log('InstantLocked:', !!tx.instantLockTime);
  console.log('ChainLocked:', !!tx.chainLockTime);
}
```

#### clearTransaction()

Remove a specific transaction from tracking.

```typescript
clearTransaction(txid: string): void
```

**Parameters:**
- `txid` - Transaction ID to clear

**Example:**
```typescript
finder.clearTransaction('abc123...');
```

#### clearAllConfirmed()

Remove all confirmed (ChainLocked) transactions from tracking.

```typescript
clearAllConfirmed(): void
```

**Example:**
```typescript
// Periodically clean up to manage memory
setInterval(() => {
  finder.clearAllConfirmed();
}, 60000);
```

#### getNodeHealth()

Get health statistics for DAPI nodes used in multi-node IS hex hunting.

```typescript
getNodeHealth(): NodeHealthSummary
```

**Returns:**
```typescript
interface NodeHealthSummary {
  /** Total number of nodes tracked */
  totalTracked: number;
  /** Number of healthy (non-blacklisted) nodes */
  healthy: number;
  /** Number of blacklisted nodes */
  blacklisted: number;
  /** Per-node statistics */
  nodeStats: Map<string, NodeStats>;
}

interface NodeStats {
  address: string;
  successes: number;           // Successful IS hex deliveries
  failures: number;            // Failed IS hex deliveries
  blacklisted: boolean;        // Whether node is blacklisted
  lastSuccessTime: number | null;
  blacklistedAt: number | null;
}
```

**Example:**
```typescript
const health = finder.getNodeHealth();

console.log(`Tracking ${health.totalTracked} nodes`);
console.log(`Healthy: ${health.healthy}, Blacklisted: ${health.blacklisted}`);

// Show per-node stats
for (const [addr, stats] of health.nodeStats) {
  const status = stats.blacklisted ? '❌' : '✅';
  console.log(`${status} ${addr}: ${stats.successes} successes, ${stats.failures} failures`);
}
```

## Configuration Types

### TransactionFinderConfig

Union type of all mode-specific configs:

```typescript
type TransactionFinderConfig =
  | HistoricFinderConfig
  | RealtimeFinderConfig;
```

### HistoricFinderConfig

```typescript
interface HistoricFinderConfig {
  mode: FinderMode.HISTORIC;
  network: 'mainnet' | 'testnet' | 'regtest';
  addresses: string[];
  dapiClient: DAPIClientLike;
  fromHeight: number;
  toHeight?: number;
  requiredAmount?: number;
  timeout?: number;
  retries?: number;
  bloomFalsePositiveRate?: number;
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  onProgress?: (progress: SyncProgress) => void;
}
```

### RealtimeFinderConfig

```typescript
interface RealtimeFinderConfig {
  mode: FinderMode.REALTIME;
  network: 'mainnet' | 'testnet' | 'regtest';
  addresses: string[];
  dapiClient: DAPIClientLike;
  timeout?: number;
  retries?: number;
  bloomFalsePositiveRate?: number;
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  enableDAPIFailover?: boolean;
  dapiNodeRetryDelay?: number;
  autoPruneOnConfirmation?: boolean;
  maxTrackedTransactions?: number;
  basePollInterval?: number;
  maxPollInterval?: number;
  minPollInterval?: number;
  adaptivePolling?: boolean;
  enableTransactionPolling?: boolean;   // Enable polling-based IS/CL detection via getTransaction(). Default: true
  transactionPollInterval?: number;     // Poll interval in ms (minimum 1000). Default: 2000
  streamReconnectInterval?: number;     // Periodic stream reconnection interval in ms. Forces DAPI to
                                        // re-run historical + mempool scan to catch missed txs.
                                        // Default: 60000 (60s). Set to 0 to disable.
  instantLockHexWaitMs?: number;        // How long to wait (ms) for parallel streams to deliver IS proof
                                        // bytes after the poller detects IS (boolean only).
                                        // Default: 8000 (8s). Set to 0 to disable.

  // Multi-Node IS Hex Hunting Configuration
  multiNodeIsHunting?: boolean;         // Enable parallel IS hex hunting from multiple DAPI nodes.
                                        // Opens parallel streams on monitorAddresses() and races for
                                        // IS hex delivery. First valid hex wins. Default: true
  isHuntingNodes?: number;              // Number of DAPI nodes to connect to for IS hunting.
                                        // More nodes = higher chance of success. Default: 3
  isHuntingTimeoutMs?: number;          // Timeout (ms) for IS hex hunting before ChainLock fallback.
                                        // Speed priority: keep short. Default: 3000 (3 seconds)
  isHuntingBlacklistThreshold?: number; // Blacklist nodes after this many consecutive failures.
                                        // Default: 1 (immediate blacklist on first failure)
}
```

## Data Types

### UTXO

```typescript
interface UTXO {
  txId: string;              // Transaction ID
  vout: number;              // Output index
  satoshis: number;          // Amount in satoshis
  script: string;            // Output script (hex)
  address: string;           // Address
  blockHeight: number;       // Block height
  blockTime: number;         // Block timestamp
  blockHash: string | null;  // Block hash
  isChainLocked: boolean;    // ChainLock status
  isInstantLocked: boolean;  // InstantLock status
}
```

### TrackedTransaction

```typescript
interface TrackedTransaction {
  txid: string;
  broadcastTime: number | null;
  instantLockTime: number | null;
  blockHeight: number | null;
  blockHash: string | null;
  chainLockTime: number | null;
  chainLockBlockHeight: number | null;
  status: 'pending' | 'instantlocked' | 'chainlocked';
}
```

### SyncProgress

```typescript
interface SyncProgress {
  progress: number;        // Percentage (0-100)
  syncedBlocks: number;    // Blocks synced
  totalBlocks: number;     // Total blocks to sync
  currentHeight: number;   // Current block height
}
```

## Event Types

### TransactionEvent

```typescript
interface TransactionEvent {
  txid: string;
  timestamp: number;
  transaction?: any;  // dashcore Transaction object
}
```

### InstantLockEvent

```typescript
interface InstantLockEvent {
  txid: string;
  timestamp: number;
  latency: number;          // ms from broadcast
  instantLockHex?: string;  // Raw InstantLock proof bytes as hex (from DAPI stream only,
                            // not available from polling). Required for InstantAssetLockProof.
}
```

### ChainLockEvent

```typescript
interface ChainLockEvent {
  txid: string;
  timestamp: number;
  blockHeight: number;
  chainLockedHeight: number;
  latency: number;    // ms from broadcast or InstantLock
}
```

### BlockInclusionEvent

```typescript
interface BlockInclusionEvent {
  txid: string;
  blockHeight: number;
  blockHash: string;
  timestamp: number;
}
```

### ConfirmationOptions

```typescript
interface ConfirmationOptions {
  requireInstantLock?: boolean;    // Default: true
  requireChainLock?: boolean;      // Default: false
  timeout?: number;                // Default: 900000 (15 min)
  onProgress?: (status: ConfirmationProgress) => void;
}
```

### ConfirmationResult

```typescript
interface ConfirmationResult {
  txid: string;
  method: 'instantlock' | 'chainlock' | 'timeout';
  instantLockTime: number | null;
  chainLockTime: number | null;
  blockHeight: number | null;
  totalLatencyMs: number;
  instantLockHex?: string | null;  // Raw InstantLock proof bytes as hex.
                                   // Present when IS proof arrived via stream.
                                   // null when IS was detected via polling only
                                   // (boolean flag without raw bytes).
}
```

### ConfirmationProgress

```typescript
interface ConfirmationProgress {
  txid: string;
  status: 'waiting' | 'pending' | 'instantlocked' | 'chainlocked';
  message: string;
  elapsedMs: number;
}
```

## Advanced Classes

For advanced use cases, you can use the mode-specific finders directly:

### HistoricFinder

```typescript
import { HistoricFinder } from '@dashevo/transaction-finder';

const finder = new HistoricFinder({
  mode: FinderMode.HISTORIC,
  network: 'testnet',
  addresses: ['yX3CJJ42...'],
  dapiClient: myDapiClient,
  fromHeight: 1,
});

const utxos = await finder.findUTXOs();
```

### RealtimeFinder

```typescript
import { RealtimeFinder } from '@dashevo/transaction-finder';

const finder = new RealtimeFinder({
  mode: FinderMode.REALTIME,
  network: 'testnet',
  addresses: ['yX3CJJ42...'],
  dapiClient: myDapiClient,
});

await finder.monitorAddresses(['yX3CJJ42...'], {
  onInstantLock: (lock) => console.log('Locked!'),
});
```

## Utility Classes

### BloomFilterBuilder

Create bloom filters for address sets.

```typescript
import { BloomFilterBuilder } from '@dashevo/transaction-finder';

// Build from addresses
const filter = BloomFilterBuilder.build(
  ['yX3CJJ42...', 'yf1j1PKD...'],
  'testnet'
);

// Build from single address (convenience)
const filter2 = BloomFilterBuilder.buildForAddress('yX3CJJ42...', 'testnet');

// Get filter statistics
const stats = BloomFilterBuilder.getStats(filter);
console.log('Filter size:', stats.size, 'bytes');
console.log('Hash functions:', stats.hashFunctions);
```

### LatestUTXOSelector

Select latest spendable UTXO from a set.

```typescript
import { LatestUTXOSelector } from '@dashevo/transaction-finder';

const latestUTXO = LatestUTXOSelector.select(
  utxos,
  100000  // Optional: required amount in satoshis
);
```

**Selection Priority:**
1. Block height (highest = latest)
2. Block time (most recent = latest)
3. Value (larger = preferred)

### Logger

Configurable logger with multiple levels.

```typescript
import { createLogger, LogLevel } from '@dashevo/transaction-finder';

const logger = createLogger('MyComponent', 'debug');

logger.trace('Trace message');
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');

// Check log level
if (logger.isDebugEnabled()) {
  logger.debug('Expensive debug operation');
}

// Change log level
logger.setLevel(LogLevel.INFO);
```

**Log Levels** (from most to least verbose):
- `TRACE` (0) - Extremely detailed
- `DEBUG` (1) - Debug information
- `INFO` (2) - Informational messages
- `WARN` (3) - Warnings
- `ERROR` (4) - Errors only
- `SILENT` (5) - No logging

## Error Handling

### Common Errors

**"At least one address is required"**
```typescript
// Missing addresses
const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  network: 'testnet',
  addresses: [],  // ❌ Empty array
  // ...
});

// Fix: provide at least one address
addresses: ['yX3CJJ42...']  // ✅
```

**"Method only available in X mode"**
```typescript
const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  // ...
});

await finder.monitorAddresses(...);  // ❌ Wrong mode

// Fix: check mode before calling methods
if (finder.getMode() === FinderMode.REALTIME) {
  await finder.monitorAddresses(...);  // ✅
}
```

**"No spendable UTXOs available"**
```typescript
// No UTXOs found or none are spendable
const utxo = await finder.findLatestSpendableUTXO();  // ❌ Throws

// Fix: check if UTXOs exist first
const utxos = await finder.findUTXOs();
if (utxos.length > 0) {
  const latestUTXO = await finder.findLatestSpendableUTXO();  // ✅
}
```

**"Insufficient funds"**
```typescript
const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  // ...
  requiredAmount: 1000000,  // Requires 0.01 DASH
});

const utxo = await finder.findLatestSpendableUTXO();  // ❌ May throw if UTXO < required

// Fix: catch error or adjust requiredAmount
try {
  const utxo = await finder.findLatestSpendableUTXO();
} catch (error) {
  console.error('Insufficient funds:', error.message);
}
```

## Best Practices

### Memory Management

For long-running realtime services, enable auto-pruning:

```typescript
const finder = new TransactionFinder({
  mode: FinderMode.REALTIME,
  // ...
  autoPruneOnConfirmation: true,  // Auto-remove confirmed transactions
  maxTrackedTransactions: 1000,   // Safety limit
});
```

Or manually clean up:

```typescript
// Clear all confirmed transactions periodically
setInterval(() => {
  finder.clearAllConfirmed();
}, 60000);
```

### Error Recovery

Handle stream errors gracefully:

```typescript
finder.on('error', (error) => {
  console.error('Stream error:', error);
  // Implement reconnection logic
});

finder.on('realtime:error', (error) => {
  console.error('Realtime error:', error);
});
```

### Performance Optimization

**Adaptive Polling** (enabled by default):
```typescript
{
  adaptivePolling: true,      // Adjusts polling based on failures
  basePollInterval: 5000,     // 5s when healthy
  maxPollInterval: 30000,     // 30s when failing
}
```

**Bloom Filter Tuning**:
```typescript
{
  bloomFalsePositiveRate: 0.0001,  // Lower = more bandwidth, fewer false positives
}
```

## TypeScript Support

Full TypeScript definitions included. Import types as needed:

```typescript
import {
  TransactionFinder,
  FinderMode,
  UTXO,
  TrackedTransaction,
  ConfirmationResult,
  ConfirmationOptions,
  TransactionEvent,
  InstantLockEvent,
  ChainLockEvent,
} from '@dashevo/transaction-finder';
```

## See Also

- [README.md](./README.md) - Package overview and quick start
- [MIGRATION.md](./MIGRATION.md) - Migration guide from old packages
- [EXAMPLES.md](./EXAMPLES.md) - Detailed usage examples
