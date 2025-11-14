# @dashevo/instantsend-chainlock-monitor

Standalone library for monitoring Dash payment confirmations via **InstantSend** and **ChainLock**.

## Features

- Monitor specific addresses for incoming payments
- Detect InstantSend confirmations (~1-3 seconds)
- Detect ChainLock confirmations (~1-3 minutes)
- Dual-path confirmation system (race between IS and CL)
- No wallet required - pure DAPI stream monitoring
- TypeScript support with full type definitions
- Works on mainnet, testnet, and regtest

## Installation

```bash
npm install @dashevo/instantsend-chainlock-monitor
```

## Quick Start

### Monitor an Address for Payments

```typescript
import { InstantSendChainLockMonitor } from '@dashevo/instantsend-chainlock-monitor';

const monitor = new InstantSendChainLockMonitor({
  network: 'testnet',
  dapiAddresses: ['seed-1.testnet.networks.dash.org:1443'],
});

const unsubscribe = await monitor.watchAddresses('yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy', {
  onTransaction: (tx) => {
    console.log('Payment received:', tx.txid);
  },
  onInstantLock: (lock) => {
    console.log('InstantLocked in', lock.latency, 'ms');
    // Safe to accept payment
  },
  onChainLock: (cl) => {
    console.log('ChainLocked at height', cl.blockHeight);
    // Payment is final
  },
});

// Later: stop monitoring
// unsubscribe();
```

### Wait for Specific Transaction Confirmation

```typescript
const monitor = new InstantSendChainLockMonitor({
  network: 'testnet',
  seeds: ['seed-1.testnet.networks.dash.org'],
});

const result = await monitor.waitForConfirmation(
  'abc123...', // txid
  'yX3CJJ42...', // address
  {
    requireInstantLock: true,
    timeout: 180000, // 3 minutes
    onProgress: (status) => {
      console.log(status.message);
    },
  }
);

console.log('Confirmed via:', result.method);
console.log('Latency:', result.totalLatencyMs, 'ms');
```

## API Reference

### InstantSendChainLockMonitor

Main class for payment monitoring.

#### Constructor

```typescript
new InstantSendChainLockMonitor(config: InstantSendChainLockMonitorConfig)
```

**Config options:**
- `network`: `'mainnet' | 'testnet' | 'regtest'` (required)
- `dapiAddresses`: String array of DAPI node addresses (optional)
- `seeds`: String array of DNS seeds (optional)
- `timeout`: Connection timeout in ms (default: 60000)
- `retries`: Number of retry attempts (default: 15)
- `bloomFalsePositiveRate`: Bloom filter FP rate (default: 0.0001)
- `debug`: Enable debug logging (default: false)

Note: Either `dapiAddresses` or `seeds` must be provided.

#### Methods

**watchAddresses(addresses, callbacks)**

Monitor addresses for incoming transactions and confirmations.

```typescript
const unsubscribe = await monitor.watchAddresses(
  'yX3CJJ42...' | ['address1', 'address2'],
  {
    onTransaction?: (tx: TransactionEvent) => void,
    onInstantLock?: (lock: InstantLockEvent) => void,
    onChainLock?: (cl: ChainLockEvent) => void,
    onBlockInclusion?: (block: BlockInclusionEvent) => void,
  }
);
```

Returns: Cleanup function to stop monitoring

**waitForConfirmation(txid, addresses, options)**

Wait for a specific transaction to be confirmed.

```typescript
const result = await monitor.waitForConfirmation(
  'txid',
  'address' | ['addresses'],
  {
    requireInstantLock?: boolean,  // default: true
    requireChainLock?: boolean,    // default: false
    timeout?: number,               // default: 900000 (15 min)
    onProgress?: (status) => void,
  }
);
```

Returns: ConfirmationResult with method, timestamps, and latency

**stop()**

Stop all monitoring and cleanup resources.

```typescript
monitor.stop();
```

**getStatus()**

Get current monitoring status.

```typescript
const status = monitor.getStatus();
// { active: boolean, trackedTransactions: number, chainLockHeight: number }
```

**getTransaction(txid)**

Get tracked transaction state.

```typescript
const tx = monitor.getTransaction('abc123...');
// TrackedTransaction object or undefined
```

## Use Cases

### 1. E-commerce Payment Detection

```typescript
import { InstantSendChainLockMonitor } from '@dashevo/instantsend-chainlock-monitor';

// Customer checkout
const paymentAddress = generateNewAddress();
showQRCode(paymentAddress);

// Monitor for payment
const monitor = new InstantSendChainLockMonitor({ network: 'mainnet' });
await monitor.watchAddresses(paymentAddress, {
  onInstantLock: (lock) => {
    // Payment confirmed - fulfill order
    fulfillOrder(lock.txid);
  },
});
```

### 2. Identity Top-Up Confirmation

```typescript
// After broadcasting asset lock transaction
const monitor = new InstantSendChainLockMonitor({ network: 'testnet' });

const result = await monitor.waitForConfirmation(assetLockTxid, fundingAddress, {
  requireInstantLock: true,
  onProgress: (status) => updateUI(status.message),
});

if (result.method === 'instantlock') {
  // Proceed with identity top-up
  await createAssetLockProof(assetLockTxid);
}
```

### 3. Multi-Address Payment Monitoring

```typescript
const addresses = [
  'yAddress1...',
  'yAddress2...',
  'yAddress3...',
];

await monitor.watchAddresses(addresses, {
  onTransaction: (tx) => {
    console.log('Payment to one of our addresses:', tx.txid);
  },
  onInstantLock: (lock) => {
    // Determine which address received payment
    const tx = monitor.getTransaction(lock.txid);
    console.log('Confirmed payment:', tx);
  },
});
```

## Architecture

### Dual Confirmation Paths

The monitor implements Dash's dual confirmation system:

**Path 1: InstantSend Lock** (fast, preferred)
- LLMQ quorum (60% of masternodes) signs transaction
- Cryptographic proof of non-double-spend
- Arrives in ~1-3 seconds
- Delivered via DAPI Core stream

**Path 2: ChainLock** (reliable fallback)
- LLMQ signs entire blockchain
- Confirms all transactions in ChainLocked blocks
- Arrives in ~1-3 minutes
- Detected via Platform DAPI polling

Both paths provide cryptographic finality. The library races them and accepts whichever arrives first.

### Components

- **InstantSendChainLockMonitor**: Main API class
- **TransactionTracker**: State management for transactions
- **ChainLockHeightMonitor**: Platform DAPI polling for ChainLock heights
- **Bloom Filter Utility**: Creates filters for DAPI stream subscriptions
- **Stream Parser**: Parses DAPI stream messages (transactions, merkle blocks, InstantLocks)

## Dependencies

- `@dashevo/dapi-client` - DAPI network communication
- `@dashevo/dashcore-lib` - Dash transaction/block parsing

## Testing

### Manual Integration Test

Monitor an address and manually send funds to it:

```bash
# Build library
npm run build

# Create .env file
echo "TESTNET_ADDRESS=yYourAddress" > .env

# Run manual test (you send DASH manually)
npm run test:integration
```

### Automated Integration Test

Requires local Dash Core node with RPC enabled. Automatically broadcasts a transaction and monitors for confirmations:

```bash
# Install RPC client (development dependency)
npm install --save-dev @dashevo/dash-rpc-client

# Configure .env file
cat > .env << EOF
TESTNET_RPC_URL=http://localhost:19998
TESTNET_RPC_USER=dashrpc
TESTNET_RPC_PASS=your_password
TESTNET_WALLET=test_wallet
EOF

# Run automated test
NETWORK=testnet node tests/integration/automated-payment.spec.js
```

**Prerequisites for automated test:**
1. Dash Core node running with RPC enabled (see [@dashevo/dash-rpc-client](../dash-rpc-client/README.md) for setup)
2. Wallet loaded with sufficient testnet DASH
3. RPC credentials configured in `.env`

See [tests/integration/automated-payment.spec.js](tests/integration/automated-payment.spec.js) for complete example.

## Expected Latencies

### Testnet
- Transaction → InstantLock: 2-5 seconds
- InstantLock → ChainLock: 60-180 seconds
- Transaction → ChainLock: 65-185 seconds

### Mainnet
- Transaction → InstantLock: 1-3 seconds
- InstantLock → ChainLock: 30-90 seconds
- Transaction → ChainLock: 35-95 seconds

### Regtest (Local Dashmate)
- Transaction → InstantLock: 1-2 seconds
- InstantLock → ChainLock: 5-15 seconds
- Transaction → ChainLock: 8-20 seconds

## Advanced Usage

### Direct Bloom Filter Creation

```typescript
import { createAddressBloomFilter } from '@dashevo/instantsend-chainlock-monitor';

const filter = createAddressBloomFilter(['addr1', 'addr2'], 'testnet');
const stream = await dapiClient.core.subscribeToTransactionsWithProofs(filter, {
  fromBlockHeight: currentHeight,
  count: 0,
});
```

### Custom Stream Processing

```typescript
import {
  parseTransactions,
  parseMerkleBlock,
  parseInstantLocks,
} from '@dashevo/instantsend-chainlock-monitor';

stream.on('data', (response) => {
  const transactions = parseTransactions(response, 'testnet');
  const merkleBlock = parseMerkleBlock(response);
  const instantLocks = parseInstantLocks(response);

  // Custom processing logic
});
```

### Using TransactionTracker Directly

```typescript
import { TransactionTracker } from '@dashevo/instantsend-chainlock-monitor';

const tracker = new TransactionTracker();
tracker.addBroadcast('txid-here');
tracker.recordInstantLock('txid-here', Date.now());
tracker.recordChainLock(blockHeight, Date.now());

const tx = tracker.getTransaction('txid-here');
console.log('Status:', tx.status); // 'pending' | 'instantlocked' | 'chainlocked'
```

## Troubleshooting

### "No data events from DAPI stream"

Ensure you're using `createAddressBloomFilter()` from this library. Custom bloom filter implementations are often incompatible with DAPI.

### "Block not found" errors

The DAPI node you're connecting to might be slightly behind. Try subscribing from `currentHeight - 1` instead of `currentHeight`.

### ChainLock detection slow

ChainLocks arrive every ~1-3 minutes on average. This is expected. For faster confirmation, rely on InstantLock path.

## Example Project

See `../js-evo-sdk/instantsend_chainlock/test-instantsend-chainlock-monitor.js` for a complete working example showing all features.

## License

MIT

## Contributing

This library was extracted from proven test scripts in the js-evo-sdk project. The code has been battle-tested on testnet and mainnet.

For issues or contributions, see the main platform repository.
