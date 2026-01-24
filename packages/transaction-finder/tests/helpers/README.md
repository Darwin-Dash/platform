# Test Helpers Documentation

Comprehensive guide to test utilities and infrastructure for the `@dashevo/transaction-finder` test suite.

## Overview

The test helpers provide a robust, deterministic testing environment for transaction discovery and monitoring operations. The key innovation is **pre-configured streams** that eliminate async timing issues and provide reliable test behavior.

## Architecture

```
helpers/
├── ControllableMockDAPIClient.ts    # Mock DAPI client with pre-configured streams
├── MockDataBuilder.ts               # Test data generation (transactions, locks, blocks)
├── MockStreamBuilder.ts             # Stream message builder
└── test-fixtures.ts                 # Common test data and constants
```

## ControllableMockDAPIClient

### Purpose

A controllable mock implementation of ResilientDAPIClient that allows tests to pre-configure stream responses. This eliminates race conditions and provides deterministic test behavior.

### Key Features

- ✅ **Pre-configured streams** - Set up all messages before creating finders
- ✅ **Deterministic behavior** - No async timing issues
- ✅ **Complete workflows** - Support for transactions + InstantLocks + MerkleBlocks + ChainLocks
- ✅ **Error simulation** - Test error handling with controlled failures
- ✅ **Type compatibility** - Implements DAPI client interface

### Basic Usage

```typescript
import { ControllableMockDAPIClient, MockDataBuilder, MockStreamBuilder } from '../../helpers/ControllableMockDAPIClient';

// Create mock client
const mockDAPIClient = new ControllableMockDAPIClient();

// Create test data
const tx = MockDataBuilder.createTransaction(
  '1111111111111111111111111111111111111111111111111111111111111111',
  [{ address: 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy', satoshis: 100000 }]
);

// Build stream messages
const txBuilder = new MockStreamBuilder();
txBuilder.addTransactions([tx.toBuffer()]);

// Pre-configure the stream
mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

// Use in tests
const finder = new RealtimeFinder({
  mode: FinderMode.REALTIME,
  network: 'testnet',
  addresses: ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
  dapiClient: mockDAPIClient,
});
```

### API Reference

#### Constructor

```typescript
new ControllableMockDAPIClient()
```

Creates a new mock DAPI client instance.

#### Methods

##### setTransactionStreamMessages()

Pre-configure transaction stream messages.

```typescript
mockDAPIClient.setTransactionStreamMessages(messages: StreamMessage[]);
```

**Parameters:**
- `messages` - Array of stream messages created by `MockStreamBuilder`

**Example:**
```typescript
const txBuilder = new MockStreamBuilder();
txBuilder
  .addTransactions([tx1.toBuffer(), tx2.toBuffer()])
  .addInstantLock(instantLock)
  .addMerkleBlock(merkleBlock.toBuffer());

mockDAPIClient.setTransactionStreamMessages(txBuilder.build());
```

##### setHeaderStreamMessages()

Pre-configure header stream messages.

```typescript
mockDAPIClient.setHeaderStreamMessages(messages: StreamMessage[]);
```

**Parameters:**
- `messages` - Array of header stream messages

**Example:**
```typescript
const headerBuilder = new MockStreamBuilder();
headerBuilder.addBlockHeaders([header1, header2, header3]);

mockDAPIClient.setHeaderStreamMessages(headerBuilder.build());
```

##### setChainLockStreamMessages()

Pre-configure ChainLock stream messages.

```typescript
mockDAPIClient.setChainLockStreamMessages(messages: StreamMessage[]);
```

**Parameters:**
- `messages` - Array of ChainLock messages

**Example:**
```typescript
const chainLock = MockDataBuilder.createChainLock(1500);
mockDAPIClient.setChainLockStreamMessages([{ chainLockSigMessages: [chainLock] }]);
```

##### setErrorMode()

Enable error simulation for testing error handling.

```typescript
mockDAPIClient.setErrorMode(errorType: 'stream' | 'header' | 'all');
```

**Parameters:**
- `errorType` - Type of error to simulate
  - `'stream'` - Transaction stream errors
  - `'header'` - Header stream errors
  - `'all'` - All stream types error

**Example:**
```typescript
// Simulate stream failure
mockDAPIClient.setErrorMode('stream');

try {
  await finder.monitorAddresses(['yX3CJJ42...'], {});
} catch (error) {
  expect(error.message).toContain('Stream error occurred');
}
```

##### core.getBestBlockHeight()

Mock implementation returning configured height.

```typescript
await mockDAPIClient.core.getBestBlockHeight(): Promise<number>
```

**Returns:** Current best block height (default: 1000)

**Example:**
```typescript
const height = await mockDAPIClient.core.getBestBlockHeight();
expect(height).toBe(1000);
```

##### core.subscribeToTransactionsWithProofs()

Returns pre-configured transaction stream.

```typescript
mockDAPIClient.core.subscribeToTransactionsWithProofs(options): AsyncIterable<StreamMessage>
```

**Parameters:**
- `options` - Stream options (bloomFilter, fromBlockHeight, etc.)

**Returns:** Async iterable of pre-configured messages

**Example:**
```typescript
const stream = await mockDAPIClient.core.subscribeToTransactionsWithProofs({
  bloomFilter: { /* ... */ },
  fromBlockHeight: 1000,
});

for await (const message of stream) {
  // Process pre-configured messages
}
```

##### core.subscribeToBlockHeadersWithChainLocks()

Returns pre-configured header stream.

```typescript
mockDAPIClient.core.subscribeToBlockHeadersWithChainLocks(options): AsyncIterable<StreamMessage>
```

**Parameters:**
- `options` - Stream options (fromBlockHeight, count)

**Returns:** Async iterable of pre-configured header messages

## MockDataBuilder

### Purpose

Utility class for creating realistic test data in proper dashcore-lib formats.

### API Reference

#### createTransaction()

Creates a transaction with specified outputs.

```typescript
static createTransaction(
  requestedTxId: string,
  outputs: Array<{ address: string; satoshis: number }>
): Transaction
```

**Parameters:**
- `requestedTxId` - Desired transaction ID (note: actual hash may differ)
- `outputs` - Array of output definitions

**Returns:** dashcore-lib Transaction instance

**Example:**
```typescript
const tx = MockDataBuilder.createTransaction(
  '1111111111111111111111111111111111111111111111111111111111111111',
  [
    { address: 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy', satoshis: 100000 },
    { address: 'yP8A3cbdxRtLRduy5mXDsBnJtMzHWs6ZXr', satoshis: 50000 },
  ]
);

console.log(tx.hash);  // Actual hash calculated from transaction content
console.log(tx.toBuffer());  // Serialized transaction
```

**Important:** The actual transaction hash is calculated from the transaction content (inputs + outputs), not from `requestedTxId`. Tests should compare against verifiable properties (satoshis, address) rather than exact txid.

#### createInstantLock()

Creates an InstantLock in proper dashcore-lib format.

```typescript
static createInstantLock(txid: string, height: number): Buffer
```

**Parameters:**
- `txid` - Transaction ID to lock
- `height` - Block height for the lock

**Returns:** Properly formatted InstantLock buffer

**Example:**
```typescript
const tx = MockDataBuilder.createTransaction(/* ... */);
const instantLock = MockDataBuilder.createInstantLock(tx.hash, 1500);

// Use in stream
const txBuilder = new MockStreamBuilder();
txBuilder
  .addTransactions([tx.toBuffer()])
  .addInstantLock(instantLock);
```

**Implementation:** Uses `InstantLock.fromObject()` to create properly validated buffers that pass dashcore-lib validation when deserialized.

#### createMerkleBlock()

Creates a MerkleBlock with specified transactions.

```typescript
static createMerkleBlock(
  height: number,
  txHashes: string[],
  timestamp: number
): MerkleBlock
```

**Parameters:**
- `height` - Block height
- `txHashes` - Array of transaction hashes to include
- `timestamp` - Block timestamp (Unix epoch)

**Returns:** dashcore-lib MerkleBlock instance

**Example:**
```typescript
const tx1 = MockDataBuilder.createTransaction(/* ... */);
const tx2 = MockDataBuilder.createTransaction(/* ... */);

const merkleBlock = MockDataBuilder.createMerkleBlock(
  1500,
  [tx1.hash, tx2.hash],
  1609459200  // 2021-01-01 00:00:00 UTC
);

console.log(merkleBlock.header.height);  // 1500
console.log(merkleBlock.hasTransaction(tx1.hash));  // true
```

#### createChainLock()

Creates a ChainLock message.

```typescript
static createChainLock(height: number): Buffer
```

**Parameters:**
- `height` - Block height for the ChainLock

**Returns:** Serialized ChainLock buffer

**Example:**
```typescript
const chainLock = MockDataBuilder.createChainLock(1500);

mockDAPIClient.setChainLockStreamMessages([
  { chainLockSigMessages: [chainLock] }
]);
```

#### createBlockHeader()

Creates a block header.

```typescript
static createBlockHeader(
  height: number,
  timestamp: number,
  prevHash?: string
): BlockHeader
```

**Parameters:**
- `height` - Block height
- `timestamp` - Block timestamp
- `prevHash` - Previous block hash (optional)

**Returns:** Block header buffer

**Example:**
```typescript
const header1 = MockDataBuilder.createBlockHeader(1000, 1609459200);
const header2 = MockDataBuilder.createBlockHeader(1001, 1609459260, header1.hash);
const header3 = MockDataBuilder.createBlockHeader(1002, 1609459320, header2.hash);

const headerBuilder = new MockStreamBuilder();
headerBuilder.addBlockHeaders([header1, header2, header3]);
```

## MockStreamBuilder

### Purpose

Fluent builder for constructing stream message arrays with proper structure.

### API Reference

#### addTransactions()

Add transaction messages to the stream.

```typescript
addTransactions(txBuffers: Buffer[]): MockStreamBuilder
```

**Parameters:**
- `txBuffers` - Array of serialized transaction buffers

**Returns:** Builder instance (for chaining)

**Example:**
```typescript
const tx1 = MockDataBuilder.createTransaction(/* ... */);
const tx2 = MockDataBuilder.createTransaction(/* ... */);

const builder = new MockStreamBuilder();
builder.addTransactions([tx1.toBuffer(), tx2.toBuffer()]);
```

#### addInstantLock()

Add an InstantLock message to the stream.

```typescript
addInstantLock(lockBuffer: Buffer): MockStreamBuilder
```

**Parameters:**
- `lockBuffer` - Serialized InstantLock buffer

**Returns:** Builder instance (for chaining)

**Example:**
```typescript
const instantLock = MockDataBuilder.createInstantLock(tx.hash, 1500);

builder.addInstantLock(instantLock);
```

#### addMerkleBlock()

Add a MerkleBlock message to the stream.

```typescript
addMerkleBlock(merkleBlockBuffer: Buffer): MockStreamBuilder
```

**Parameters:**
- `merkleBlockBuffer` - Serialized MerkleBlock buffer

**Returns:** Builder instance (for chaining)

**Example:**
```typescript
const merkleBlock = MockDataBuilder.createMerkleBlock(1500, [tx.hash], 1609459200);

builder.addMerkleBlock(merkleBlock.toBuffer());
```

#### addChainLock()

Add a ChainLock message to the stream.

```typescript
addChainLock(chainLockBuffer: Buffer): MockStreamBuilder
```

**Parameters:**
- `chainLockBuffer` - Serialized ChainLock buffer

**Returns:** Builder instance (for chaining)

**Example:**
```typescript
const chainLock = MockDataBuilder.createChainLock(1500);

builder.addChainLock(chainLock);
```

#### addBlockHeaders()

Add block header messages to the stream.

```typescript
addBlockHeaders(headerBuffers: Buffer[]): MockStreamBuilder
```

**Parameters:**
- `headerBuffers` - Array of block header buffers

**Returns:** Builder instance (for chaining)

**Example:**
```typescript
const headers = [
  MockDataBuilder.createBlockHeader(1000, 1609459200),
  MockDataBuilder.createBlockHeader(1001, 1609459260),
  MockDataBuilder.createBlockHeader(1002, 1609459320),
];

builder.addBlockHeaders(headers);
```

#### build()

Build the final stream message array.

```typescript
build(): StreamMessage[]
```

**Returns:** Array of stream messages ready for pre-configuration

**Example:**
```typescript
const messages = builder.build();
mockDAPIClient.setTransactionStreamMessages(messages);
```

### Fluent Interface

The builder supports method chaining for concise stream construction:

```typescript
const txBuilder = new MockStreamBuilder();

const messages = txBuilder
  .addTransactions([tx1.toBuffer(), tx2.toBuffer()])
  .addInstantLock(instantLock1)
  .addInstantLock(instantLock2)
  .addMerkleBlock(merkleBlock1.toBuffer())
  .addMerkleBlock(merkleBlock2.toBuffer())
  .addChainLock(chainLock)
  .build();

mockDAPIClient.setTransactionStreamMessages(messages);
```

## test-fixtures.ts

### Purpose

Centralized test data and constants for consistent test behavior.

### Constants

#### TEST_ADDRESSES

Common test addresses used across tests:

```typescript
export const TEST_ADDRESSES = {
  address1: 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy',
  address2: 'yP8A3cbdxRtLRduy5mXDsBnJtMzHWs6ZXr',
  address3: 'yTsGq4wV8WF5GKLaYV2C43zrkr2sfTtysT',
};
```

**Usage:**
```typescript
import { TEST_ADDRESSES } from '../../helpers/test-fixtures';

const finder = new RealtimeFinder({
  addresses: [TEST_ADDRESSES.address1],
  // ...
});
```

#### TEST_HEIGHTS

Common block heights for testing:

```typescript
export const TEST_HEIGHTS = {
  genesis: 1,
  low: 1000,
  mid: 500000,
  high: 1000000,
  current: 1500000,
};
```

#### TEST_TIMESTAMPS

Common timestamps for testing:

```typescript
export const TEST_TIMESTAMPS = {
  jan2021: 1609459200,  // 2021-01-01 00:00:00 UTC
  jan2022: 1640995200,  // 2022-01-01 00:00:00 UTC
  jan2023: 1672531200,  // 2023-01-01 00:00:00 UTC
};
```

### Helper Functions

#### createMockInstantLock()

Creates a mock InstantLock for testing.

```typescript
export function createMockInstantLock(txid: string): Buffer
```

**Parameters:**
- `txid` - Transaction ID to lock

**Returns:** InstantLock buffer

**Example:**
```typescript
import { createMockInstantLock } from '../../helpers/test-fixtures';

const instantLock = createMockInstantLock(tx.hash);
```

## Usage Patterns

### Pattern 1: Simple Transaction Stream

```typescript
import { ControllableMockDAPIClient, MockDataBuilder, MockStreamBuilder } from '../../helpers/ControllableMockDAPIClient';

const mockDAPIClient = new ControllableMockDAPIClient();

const tx = MockDataBuilder.createTransaction(
  '1111111111111111111111111111111111111111111111111111111111111111',
  [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
);

const txBuilder = new MockStreamBuilder();
txBuilder.addTransactions([tx.toBuffer()]);

mockDAPIClient.setTransactionStreamMessages(txBuilder.build());
```

### Pattern 2: Complete Confirmation Workflow

```typescript
const tx = MockDataBuilder.createTransaction(/* ... */);
const instantLock = MockDataBuilder.createInstantLock(tx.hash, 1500);
const merkleBlock = MockDataBuilder.createMerkleBlock(1500, [tx.hash], TEST_TIMESTAMPS.jan2021);
const chainLock = MockDataBuilder.createChainLock(1500);

const txBuilder = new MockStreamBuilder();
txBuilder
  .addTransactions([tx.toBuffer()])
  .addInstantLock(instantLock)
  .addMerkleBlock(merkleBlock.toBuffer())
  .addChainLock(chainLock);

mockDAPIClient.setTransactionStreamMessages(txBuilder.build());
```

### Pattern 3: Multiple Addresses and Transactions

```typescript
const tx1 = MockDataBuilder.createTransaction(
  '1111111111111111111111111111111111111111111111111111111111111111',
  [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
);

const tx2 = MockDataBuilder.createTransaction(
  '2222222222222222222222222222222222222222222222222222222222222222',
  [{ address: TEST_ADDRESSES.address2, satoshis: 200000 }]
);

const txBuilder = new MockStreamBuilder();
txBuilder
  .addTransactions([tx1.toBuffer(), tx2.toBuffer()])
  .addInstantLock(MockDataBuilder.createInstantLock(tx1.hash, 1500))
  .addInstantLock(MockDataBuilder.createInstantLock(tx2.hash, 1501));

mockDAPIClient.setTransactionStreamMessages(txBuilder.build());
```

### Pattern 4: Error Simulation

```typescript
const mockDAPIClient = new ControllableMockDAPIClient();
mockDAPIClient.setErrorMode('stream');

try {
  await finder.monitorAddresses([TEST_ADDRESSES.address1], {});
  fail('Should have thrown error');
} catch (error) {
  expect(error.message).toContain('Stream error occurred');
}
```

### Pattern 5: Historic Header Sync

```typescript
const headers = [];
for (let height = 1000; height <= 1100; height++) {
  headers.push(MockDataBuilder.createBlockHeader(height, TEST_TIMESTAMPS.jan2021 + height * 60));
}

const headerBuilder = new MockStreamBuilder();
headerBuilder.addBlockHeaders(headers);

mockDAPIClient.setHeaderStreamMessages(headerBuilder.build());
```

## Best Practices

### 1. Always Pre-configure Streams

❌ **Bad** - Dynamic message queuing (unreliable):
```typescript
const mockDAPIClient = new ControllableMockDAPIClient();
const finder = new RealtimeFinder({ dapiClient: mockDAPIClient });

await finder.monitorAddresses([TEST_ADDRESSES.address1], {});

// Try to queue message after monitoring started
mockDAPIClient.queueStreamMessage({ rawTransactions: [tx.toBuffer()] });

// Race condition - message may arrive too late
```

✅ **Good** - Pre-configured streams:
```typescript
const mockDAPIClient = new ControllableMockDAPIClient();

const txBuilder = new MockStreamBuilder();
txBuilder.addTransactions([tx.toBuffer()]);
mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

const finder = new RealtimeFinder({ dapiClient: mockDAPIClient });
await finder.monitorAddresses([TEST_ADDRESSES.address1], {});

// All messages already configured
```

### 2. Wait for Async Processing

Always add sufficient wait time after starting monitoring:

```typescript
await finder.monitorAddresses([TEST_ADDRESSES.address1], {
  onTransaction: (tx) => events.push(tx),
});

// Wait for stream processing
await new Promise((resolve) => setTimeout(resolve, 300));

// Now verify results
expect(events.length).toBeGreaterThan(0);
```

### 3. Use Verifiable Properties

Don't compare against exact transaction hashes:

❌ **Bad**:
```typescript
expect(utxo.txId).toBe('1111111111111111111111111111111111111111111111111111111111111111');
```

✅ **Good**:
```typescript
expect(utxo.satoshis).toBe(100000);
expect(utxo.address).toBe(TEST_ADDRESSES.address1);
expect(utxo.blockHeight).toBe(1500);
```

### 4. Use Correct Property Names

Reference the UTXO interface for correct property names:

```typescript
interface UTXO {
  txId: string;        // NOT txid
  vout: number;        // NOT outputIndex
  satoshis: number;
  script: string;
  address: string;
  blockHeight: number; // NOT height
}
```

### 5. Clean Up Resources

Always clean up finder resources:

```typescript
let finder: RealtimeFinder;

afterEach(() => {
  if (finder) {
    finder.stop();
  }
});
```

## Troubleshooting

### Issue: Tests timeout

**Cause:** Stream not pre-configured, async wait not sufficient

**Solution:**
```typescript
// 1. Pre-configure stream
mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

// 2. Add sufficient wait
await new Promise((resolve) => setTimeout(resolve, 300));
```

### Issue: "Cannot read properties of undefined"

**Cause:** Using wrong property names (txid vs txId, height vs blockHeight)

**Solution:** Use correct UTXO interface property names

### Issue: Transaction hash mismatch

**Cause:** Hash is calculated from transaction content, not requested txid

**Solution:** Compare against verifiable properties (satoshis, address) instead of txId

### Issue: InstantLock validation fails

**Cause:** InstantLock not in proper dashcore-lib format

**Solution:** Use `MockDataBuilder.createInstantLock()` which creates properly formatted buffers

## Performance Considerations

- **Stream creation:** < 1ms per message
- **Mock client overhead:** Negligible
- **Async processing wait:** 300ms recommended
- **Memory usage:** < 1MB for typical test data

## Summary

The test helpers provide:

✅ **Deterministic testing** via pre-configured streams
✅ **Realistic data** using dashcore-lib formats
✅ **Fluent API** for concise test setup
✅ **Complete workflows** from transaction to ChainLock
✅ **Error simulation** for robust testing
✅ **Type safety** with full TypeScript support

These helpers enable comprehensive testing of transaction discovery and monitoring without external dependencies or timing issues.
