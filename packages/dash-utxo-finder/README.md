# @dashevo/dash-utxo-finder

A lightweight, stateless utility library for finding the latest spendable UTXO (Unspent Transaction Output) on Dash Platform. The library coordinates transaction syncing from DAPI, UTXO extraction, and intelligent selection to provide developers with a simple API for wallet operations.

## Features

- **Stateless Design**: Zero storage, zero state tracking. Application controls all state.
- **Dual Mode Operation**:
  - Watch-only mode (HDPublicKey) for monitoring addresses
  - Full control mode (mnemonic/HDPrivateKey) for transaction signing
- **Network Aware**: Supports both mainnet and testnet address formats
- **Event-Based Progress**: Real-time progress updates via EventEmitter
- **UTXO Selection**: Smart selection based on blockchain chronology (height, time, value)
- **Flexible Address Derivation**: Customize external/internal chain counts
- **Coin Selection**: Find minimum UTXO set for specific amounts
- **Lock Detection**: Automatic detection of InstantSend and ChainLock status

## Installation

```bash
npm install @dashevo/dash-utxo-finder
```

## Quick Start

### Basic Usage: Find Latest UTXO

```javascript
const { UTXOFinder, AddressDerivation } = require('@dashevo/dash-utxo-finder');
const DAPIClient = require('@dashevo/dapi-client');

// Initialize DAPI client
const dapiClient = new DAPIClient({ network: 'testnet' });

// Create UTXO finder
const finder = new UTXOFinder(dapiClient, 'testnet');

// Listen for progress
finder.on('progress', (progress) => {
  console.log(`Sync: ${progress.progress.toFixed(2)}%`);
});

finder.on('found', (event) => {
  console.log('Found UTXO:', event.utxo);
});

// Derive addresses and find latest UTXO
const result = await finder.findLatestUTXOFromMnemonic(
  'your twelve word mnemonic phrase here',
  {
    accountIndex: 0,
    externalCount: 20,
    internalCount: 20,
    fromHeight: 1000000,
    requiredAmount: 200000 // 0.002 DASH
  }
);

console.log('Latest UTXO:', result.latestUTXO);
console.log('Used address:', result.addressData.address);
console.log('Private key:', result.addressData.privateKey);
```

## Storage & Caching (Optional)

The library supports optional persistent caching for offline queries and faster subsequent syncs.

### Default: Stateless (No Storage)

By default, the library stores nothing and queries fresh from DAPI every time:

```javascript
const finder = new UTXOFinder(dapiClient, 'testnet');
// No caching, always queries fresh
```

### Option 1: In-Memory Storage

Fast but temporary (clears on process exit):

```javascript
const { UTXOFinder, InMemoryStorage } = require('@dashevo/dash-utxo-finder');

const finder = new UTXOFinder(dapiClient, 'testnet', {
  storageAdapter: new InMemoryStorage()
});

// UTXOs cached in RAM until process exits
const utxo = await finder.findLatestSpendableUTXO(addresses, { fromHeight: 1000000 });

// Later: Query from cache (works offline if previously synced)
const cached = await finder.getCachedUTXOs(addresses[0]);
console.log(`Found ${cached?.length || 0} cached UTXOs`);
```

### Option 2: Browser localStorage

Persistent, synchronous, ~5-10MB limit (good for most wallets):

```javascript
const { UTXOFinder, LocalStorageAdapter } = require('@dashevo/dash-utxo-finder');

const finder = new UTXOFinder(dapiClient, 'testnet', {
  storageAdapter: new LocalStorageAdapter('my-wallet-cache')
});

// UTXOs persist across page reloads
const utxo = await finder.findLatestSpendableUTXO(addresses, { fromHeight: 1000000 });

// On next page load, cache is still available
const cached = await finder.getCachedUTXOs(addresses[0]);
```

### Option 3: Browser IndexedDB

Persistent, async, 100s of MB possible (best for large wallets):

```javascript
const { UTXOFinder, IndexedDBAdapter } = require('@dashevo/dash-utxo-finder');

const storage = new IndexedDBAdapter('my-wallet-db');
const finder = new UTXOFinder(dapiClient, 'testnet', {
  storageAdapter: storage
});

// Best for large UTXO sets
const utxos = await finder.findAllUTXOs(addresses, { fromHeight: 1000000 });

// Remember to close when done (IndexedDB only)
storage.close();
```

### Cache Management

```javascript
// Clear specific address
await finder.clearCache('yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj');

// Clear all cache for current network
await finder.clearCache();
```

### Custom Storage Backend

Implement `StorageAdapter` interface for custom backends:

```javascript
class MyDatabaseStorage {
  async saveUTXOs(network, address, utxos) {
    // Save to your PostgreSQL/MongoDB/etc
  }

  async getUTXOs(network, address) {
    // Retrieve from your database
  }

  async saveSyncCheckpoint(network, checkpoint) {
    // Save checkpoint
  }

  async getSyncCheckpoint(network) {
    // Retrieve checkpoint
  }

  async clear(network, address) {
    // Clear cache
  }
}

const finder = new UTXOFinder(dapiClient, 'testnet', {
  storageAdapter: new MyDatabaseStorage()
});
```

## API Reference

### UTXOFinder

Main class for UTXO operations.

#### Constructor

```typescript
constructor(dapiClient: DAPIClient, network: string = 'testnet')
```

#### Methods

##### findLatestSpendableUTXO(addresses, options)

Find the single latest spendable UTXO for given addresses.

```typescript
async findLatestSpendableUTXO(
  addresses: string[],
  options: {
    fromHeight: number;
    toHeight?: number;
    requiredAmount?: number;
  }
): Promise<UTXO>
```

**Parameters:**
- `addresses`: Array of Dash addresses to monitor
- `fromHeight`: Block height to start scanning from
- `toHeight`: Block height to stop (optional, uses current height if omitted)
- `requiredAmount`: Minimum satoshis needed (optional)

**Returns:** UTXO object with metadata

**Throws:** Error if no spendable UTXOs or insufficient funds

**Example:**
```javascript
const utxo = await finder.findLatestSpendableUTXO(
  ['yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj'],
  { fromHeight: 1000000, requiredAmount: 200000 }
);
```

##### findAllUTXOs(addresses, options)

Get all spendable UTXOs sorted by blockchain recency (latest first).

```typescript
async findAllUTXOs(
  addresses: string[],
  options: UTXOFinderOptions
): Promise<UTXO[]>
```

**Example:**
```javascript
const utxos = await finder.findAllUTXOs(addresses, { fromHeight: 1000000 });
console.log(`Found ${utxos.length} spendable UTXOs`);
```

##### findUTXOsForAmount(addresses, options)

Find minimum set of UTXOs needed to cover a specific amount.

```typescript
async findUTXOsForAmount(
  addresses: string[],
  options: UTXOFinderOptions & { requiredAmount: number }
): Promise<UTXO[]>
```

**Example:**
```javascript
const utxos = await finder.findUTXOsForAmount(addresses, {
  fromHeight: 1000000,
  requiredAmount: 500000 // 0.005 DASH
});

const total = utxos.reduce((sum, u) => sum + u.satoshis, 0);
console.log(`Selected ${utxos.length} UTXOs totaling ${total} sats`);
```

##### findLatestUTXOFromMnemonic(mnemonic, options)

Convenience method that combines address derivation and UTXO finding.

```typescript
async findLatestUTXOFromMnemonic(
  mnemonic: string,
  options: {
    accountIndex?: number;
    externalCount?: number;
    internalCount?: number;
    fromHeight: number;
    requiredAmount?: number;
  }
): Promise<{
  latestUTXO: UTXO;
  addressData: DerivedAddress;
  externalAddresses: DerivedAddress[];
  internalAddresses: DerivedAddress[];
}>
```

**Example:**
```javascript
const result = await finder.findLatestUTXOFromMnemonic(mnemonic, {
  accountIndex: 0,
  externalCount: 20,
  internalCount: 20,
  fromHeight: 1000000
});

// Now have both UTXO and the private key for signing
const tx = new Transaction()
  .from(utxoForTx)
  .to(destination, amount)
  .change(result.addressData.address)
  .sign(result.addressData.privateKey);
```

### AddressDerivation

Address derivation utilities supporting BIP44 standard.

#### Static Methods

##### fromMnemonic(mnemonic, network, options)

Derive addresses from BIP39 mnemonic (full control).

```typescript
static fromMnemonic(
  mnemonic: string,
  network: string = 'testnet',
  options: {
    accountIndex?: number;
    externalCount?: number;
    internalCount?: number;
  }
): AddressDerivationResult
```

**Returns:** Object with `external`, `internal` address arrays and `hdPrivateKey`

**Example:**
```javascript
const { external, internal, hdPrivateKey } = AddressDerivation.fromMnemonic(
  'abandon abandon abandon...',
  'testnet',
  { accountIndex: 0, externalCount: 10, internalCount: 10 }
);

external.forEach(addr => {
  console.log(`${addr.index}: ${addr.address}`);
});
```

##### fromHDPublicKey(hdPublicKey, network, options)

Derive addresses from extended public key (watch-only mode).

```typescript
static fromHDPublicKey(
  hdPublicKey: HDPublicKey | string,
  network: string = 'testnet',
  options: {
    externalCount?: number;
    internalCount?: number;
  }
)
```

**Returns:** Object with `external` and `internal` address arrays (no private keys)

**Example:**
```javascript
const xpub = 'tpub6...'; // Testnet extended public key
const { external, internal } = AddressDerivation.fromHDPublicKey(
  xpub,
  'testnet',
  { externalCount: 10, internalCount: 5 }
);

// Can now monitor addresses without having private keys
```

##### deriveAddress(mnemonic, network, accountIndex, addressIndex, isChange)

Derive a single address.

```typescript
static deriveAddress(
  mnemonic: string,
  network: string,
  accountIndex: number,
  addressIndex: number,
  isChange?: boolean
): DerivedAddress
```

**Example:**
```javascript
const addr = AddressDerivation.deriveAddress(
  mnemonic,
  'testnet',
  0,  // account
  0,  // address index
  false // external (false = external/receiving, true = internal/change)
);
console.log(addr.address); // The actual address
console.log(addr.privateKey); // For signing
```

##### getHDPublicKeyFromMnemonic(mnemonic, network, accountIndex)

Get extended public key for sharing watch-only capability.

```typescript
static getHDPublicKeyFromMnemonic(
  mnemonic: string,
  network?: string,
  accountIndex?: number
): string
```

**Returns:** Extended public key (xpub/tpub)

**Example:**
```javascript
const xpub = AddressDerivation.getHDPublicKeyFromMnemonic(mnemonic, 'testnet', 0);
// Share xpub with watch-only apps
```

### BloomFilterBuilder

Create bloom filters for efficient transaction filtering.

#### Static Methods

##### build(addresses, network)

Create a bloom filter for a set of addresses.

```typescript
static build(addresses: string[], network: string): Buffer
```

**Example:**
```javascript
const bloomFilter = BloomFilterBuilder.build(
  ['yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj'],
  'testnet'
);
```

### UTXOExtractor

Extract UTXOs from transaction data.

#### Constructor

```typescript
constructor(network: string = 'testnet')
```

#### Methods

##### extractUTXOs(transactions, addresses)

Extract all UTXOs for given addresses from a transaction list.

```typescript
extractUTXOs(
  transactions: TransactionWithMetadata[],
  addresses: string[]
): UTXO[]
```

**Returns:** Array of UTXO objects

##### getSpendableUTXOs(utxos)

Filter UTXOs to only spendable ones (confirmed, chain locked, or instant locked).

```typescript
getSpendableUTXOs(utxos: UTXO[]): UTXO[]
```

### LatestUTXOSelector

Intelligent UTXO selection based on blockchain state.

#### Static Methods

##### select(utxos, requiredAmount)

Select the single latest spendable UTXO.

```typescript
static select(utxos: UTXO[], requiredAmount?: number): UTXO
```

**Selection Order:**
1. Filter for spendable (confirmed OR chain locked OR instant locked)
2. Sort by block height (highest = latest)
3. Tiebreak by block time (most recent)
4. Tiebreak by value (larger)
5. Return first (latest)

**Example:**
```javascript
const latestUTXO = LatestUTXOSelector.select(utxos, 200000);
```

##### getAllSpendable(utxos)

Get all spendable UTXOs sorted by recency.

```typescript
static getAllSpendable(utxos: UTXO[]): UTXO[]
```

##### selectForAmount(utxos, amount)

Find minimum UTXO set for specific amount.

```typescript
static selectForAmount(utxos: UTXO[], amount: number): UTXO[]
```

**Example:**
```javascript
const selected = LatestUTXOSelector.selectForAmount(utxos, 500000);
```

## Type Definitions

### UTXO

```typescript
interface UTXO {
  txId: string;              // Transaction ID
  vout: number;              // Output index
  satoshis: number;          // Amount in satoshis
  script: string;            // Hex-encoded script
  address: string;           // Dash address
  blockHeight: number;       // Block containing transaction
  blockTime: number;         // Block timestamp in milliseconds
  blockHash: string | null;  // Block hash
  isChainLocked: boolean;    // Locked by ChainLock
  isInstantLocked: boolean;  // Locked by InstantSend
}
```

### DerivedAddress

```typescript
interface DerivedAddress {
  index: number;             // Index in derivation chain
  address: string;           // Dash address
  path: string;              // BIP44 derivation path
  privateKey?: any;          // Private key (only in full control mode)
}
```

## Events

UTXOFinder emits useful progress and state events:

```javascript
finder.on('start', (event) => {
  // { addressCount: number, fromHeight: number }
});

finder.on('step', (event) => {
  // { step: 'building-bloom-filter' | 'syncing-transactions' | ... }
});

finder.on('progress', (event) => {
  // { progress: 0-100, syncedBlocks, totalBlocks, currentHeight }
});

finder.on('found', (event) => {
  // { utxo, totalUTXOs } or { utxos, count }
});

finder.on('error', (error) => {
  // { error object }
});
```

## Examples

### Watch-Only Monitoring

Monitor addresses without having private keys:

```javascript
const { UTXOFinder, AddressDerivation } = require('@dashevo/dash-utxo-finder');

// Share extended public key with monitoring app
const xpub = 'tpub6...';

// Monitor addresses in watch-only mode
const { external, internal } = AddressDerivation.fromHDPublicKey(
  xpub,
  'testnet'
);

const allAddresses = [
  ...external.map(a => a.address),
  ...internal.map(a => a.address)
];

const finder = new UTXOFinder(dapiClient, 'testnet');
const latestUTXO = await finder.findLatestSpendableUTXO(allAddresses, {
  fromHeight: 1000000
});

console.log('Found UTXO:', latestUTXO);
```

### Full Control with Signing

Create and sign transactions:

```javascript
const result = await finder.findLatestUTXOFromMnemonic(mnemonic, {
  fromHeight: 1000000,
  requiredAmount: 200000
});

const utxoForTx = new Transaction.UnspentOutput({
  txId: result.latestUTXO.txId,
  outputIndex: result.latestUTXO.vout,
  script: result.latestUTXO.script,
  satoshis: result.latestUTXO.satoshis
});

const tx = new Transaction()
  .from(utxoForTx)
  .to('yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj', 100000)
  .change(result.addressData.address)
  .fee(1000)
  .sign(result.addressData.privateKey);

await dapiClient.core.broadcastTransaction(tx.serialize());
```

### Custom Address Derivation

Derive only specific addresses:

```javascript
const addr = AddressDerivation.deriveAddress(
  mnemonic,
  'testnet',
  0,      // Account 0
  5,      // Address 5
  false   // External chain
);

console.log('Address:', addr.address);
console.log('Path:', addr.path);

const finder = new UTXOFinder(dapiClient, 'testnet');
const utxo = await finder.findLatestSpendableUTXO([addr.address], {
  fromHeight: 1000000
});
```

## Architecture

### Stateless Design

The library intentionally stores no state:

- **No address index tracking** - App manages which addresses are "used"
- **No UTXO caching** - Always queries fresh from DAPI
- **No persistent state** - Each call is independent
- **No configuration state** - Network/settings passed per-call

This design allows:
- Multiple instances with different configurations
- Easy testing and mocking
- Simple integration into existing state management
- Clear data flow and debugging

### Race Condition Prevention

The library prevents the bloom filter race condition described in PRD Section 5.1-5.4 through stateless upfront address derivation:

**The Problem (PRD 5.1):**
- Dynamic address discovery during sync → bloom filter needs to be expanded
- Stream restart required to include new addresses
- Race condition: old stream ends before new stream starts → incomplete UTXO discovery

**Our Solution:**
- All addresses are derived **before sync** starts
- Addresses are static for the entire sync operation
- No dynamic address discovery during streaming
- Prevents race condition by design

**Technical Guarantee:**
- `TransactionSyncer.syncTransactions()` prevents concurrent syncs
- Throws error if sync called while another is in progress
- Must await previous sync to completion
- Flag is always reset via try/finally block (even on error)

**Usage Implication:**
```javascript
// ✅ CORRECT: Derive addresses first
const { external, internal } = AddressDerivation.fromMnemonic(mnemonic, 'testnet');
const allAddresses = [...external, ...internal];

// Then use for syncing
const utxos = await finder.findLatestSpendableUTXO(allAddresses, options);

// ❌ WRONG: Trying to add addresses during sync
const firstSync = finder.syncTransactions(filter, 0); // don't await
const secondSync = finder.syncTransactions(filter, 0); // throws: sync in progress
```

See test file: `__tests__/unit/TransactionSyncer.test.ts > Race condition prevention`

### Component Interaction

```
Application Code
     ↓
UTXOFinder (main API)
     ├→ AddressDerivation (if using convenience methods)
     ├→ BloomFilterBuilder (address → bloom filter)
     ├→ TransactionSyncer (DAPI stream handling)
     ├→ UTXOExtractor (transactions → UTXOs)
     └→ LatestUTXOSelector (UTXO selection)
```

### Lock Detection (InstantSend & ChainLock)

The library automatically detects Dash's security features that provide instant finality:

**InstantSend Locks:**
- Transactions are instant-locked via LLMQ (Long-Living Masternode Quorum) consensus
- Provides near-instant confirmation before blockchain confirmation
- UTXOs with `isInstantLocked: true` are immediately spendable
- Detection: Matches transaction ID from DAPI `instantSendLockMessages` stream

**ChainLocks:**
- Entire blocks are chain-locked by quorum consensus
- All transactions in a chain-locked block are `isChainLocked: true`
- Provides protection against 51% attacks and deep reorganizations
- Detection: Matches block hash from DAPI `chainLockMessages` stream

**Usage:**
```javascript
const utxos = await finder.findAllUTXOs(addresses, { fromHeight: 1000000 });

utxos.forEach(utxo => {
  console.log(`UTXO ${utxo.txId}:${utxo.vout} - ${utxo.satoshis} sats`);

  if (utxo.isInstantLocked) {
    console.log('  ✓ InstantSend locked - instant confirmation');
  }
  if (utxo.isChainLocked) {
    console.log('  ✓ ChainLocked - finalized by quorum');
  }
  if (utxo.blockHeight > 0 && !utxo.isInstantLocked && !utxo.isChainLocked) {
    console.log('  ⏳ Confirmed but not yet locked');
  }
  if (utxo.blockHeight === 0) {
    console.log('  ⏳ Unconfirmed (waiting for block)');
  }
});
```

**Spendability Criteria:**

A UTXO is considered spendable if ANY of:
- `blockHeight > 0` (confirmed in blockchain)
- `isChainLocked === true` (block is chain-locked)
- `isInstantLocked === true` (transaction is instant-locked)

This ensures you can safely spend UTXOs that have Dash's instant finality guarantees.

## Network Support

### Mainnet

- Address prefix: 'X' (e.g., `XyFYDjqXHuDVQqvTRv8DHjvSnKC1Yb5RCf`)
- Coin type: 5 (BIP44)
- Public key prefix: 0x0488B21E (xpub)
- Private key prefix: 0x0488AD4E (xprv)

### Testnet

- Address prefix: 'y' (e.g., `yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj`)
- Coin type: 1 (BIP44)
- Public key prefix: 0x043587CF (tpub)
- Private key prefix: 0x04358394 (tprv)

## Error Handling

The library throws descriptive errors:

```javascript
try {
  const utxo = await finder.findLatestSpendableUTXO(addresses, {
    fromHeight: 1000000,
    requiredAmount: 1000000 // 0.01 DASH
  });
} catch (error) {
  if (error.message.includes('No spendable UTXOs')) {
    console.log('No confirmed transactions yet');
  } else if (error.message.includes('Insufficient funds')) {
    console.log('UTXO too small for required amount');
  } else {
    console.log('DAPI error:', error);
  }
}
```

## Performance Considerations

- **Bloom Filter Size**: Automatically sized based on address count
- **Block Range**: Larger ranges require more sync time
- **Address Count**: More addresses = larger bloom filter = more matching transactions
- **Network Latency**: DAPI calls depend on network conditions

**Optimization Tips:**
1. Use narrowest block range possible
2. Derive only necessary addresses (e.g., 5-20, not 1000)
3. Consider caching results in your application
4. Use watch-only mode when signatures not needed

## Testing

### Overview

The UTXO Finder has comprehensive test coverage with 198+ tests across three categories:

- **Unit Tests** (198 tests) - Fast, isolated, no infrastructure needed
- **Testnet Integration** (8 tests) - Uses public testnet seeds
- **Regtest Integration** (10 tests) - Uses SSH tunnel to remote regtest
- **RPC Tests** (5 tests) - Requires local Dash node with RPC

**Pass Rate**: 100% on unit tests, 95%+ on integration tests (with resilience utilities)

### Quick Start

```bash
# Run all unit tests (fast, always works)
npm test -- __tests__/unit/

# Run all tests (requires infrastructure)
npm test

# Run specific test file
npm test -- __tests__/unit/LatestUTXOSelector.test.ts

# Run tests in watch mode
npm test -- --watch
```

### Test Categories

#### Unit Tests (No Infrastructure Required)

**Count**: 198 tests
**Duration**: 1-2 seconds
**Pass Rate**: 100%
**Infrastructure**: None needed

**Run**:
```bash
npm test -- __tests__/unit/
```

**What's tested**:
- AddressDerivation (BIP44 paths, network formats)
- LatestUTXOSelector (selection logic, sorting)
- UTXOExtractor (transaction parsing, metadata)
- TransactionSyncer (stream processing, lock detection)
- BloomFilterBuilder (filter creation)
- StorageAdapter (caching strategies)

#### Testnet Integration Tests

**Count**: 8 tests
**Duration**: 30-90 seconds
**Pass Rate**: 95%+ (with retry logic)
**Infrastructure**: Internet connection (uses public seeds)

**Run**:
```bash
npm test -- __tests__/integration/UTXOFinder.testnet.integration.test.ts
```

**Skip**:
```bash
SKIP_TESTNET_TESTS=true npm test
```

**Features**:
- Uses public Dash testnet infrastructure
- Automatic DNS resolution of seed hostnames
- Retry logic with exponential backoff
- Circuit breaker for unreliable seeds
- No local setup required

**What's tested**:
- DAPI connectivity
- Block height queries
- Network switching
- UTXO discovery on real blockchain
- Event emission
- Error handling

#### Regtest Integration Tests

**Count**: 10 tests
**Duration**: 10-30 seconds
**Pass Rate**: 100% (when SSH available)
**Infrastructure**: SSH access to regtest server

**Requirements**:
- SSH tunnel to regtest Dashmate server
- DAPI on `localhost:2443`
- RPC on `localhost:20002`

**Setup**:
```bash
# Establish SSH tunnels
ssh -L 2443:127.0.0.1:2443 -L 20002:127.0.0.1:20002 ruald@10.0.0.119

# Run tests
npm test -- __tests__/integration/UTXOFinder.integration.test.ts
```

**Skip**:
```bash
SKIP_REGTEST_TESTS=true npm test
```

**What's tested**:
- Full workflow on private regtest chain
- Transaction creation and mining
- UTXO discovery with known state
- Performance benchmarking

#### RPC Tests (E2E)

**Count**: 5 tests
**Duration**: 30-60 seconds
**Pass Rate**: 100% (when node available)
**Infrastructure**: Local Dash testnet node with RPC

**Requirements**:
- Local dashd running in testnet mode
- RPC server enabled
- Wallet with testnet funds

**Setup**: See [scripts/setup-local-testnet.md](./scripts/setup-local-testnet.md)

**Run**:
```bash
npm test -- __tests__/integration/UTXOFinder.e2e-with-rpc.test.ts
```

**Skip**:
```bash
SKIP_RPC_TESTS=true npm test
```

**What's tested**:
- RPC connectivity via JSON-RPC
- Transaction broadcasting
- Block generation
- End-to-end UTXO lifecycle

### Test Configuration

Tests use environment variables for configuration. Create `.env.local`:

```bash
# Copy template
cp .env.test .env.local

# Edit for your environment
vi .env.local
```

**Key variables**:
```bash
# Local testnet node
TESTNET_RPC_ENDPOINT=http://localhost:18332
TESTNET_RPC_USERNAME=dash
TESTNET_RPC_PASSWORD=dashpass

# Regtest via SSH
DASHMATE_SSH_HOST=user@your.server
REGTEST_RPC_ENDPOINT=http://localhost:20002

# Test control
SKIP_RPC_TESTS=false
SKIP_TESTNET_TESTS=false
SKIP_REGTEST_TESTS=false

# Timeouts
DAPI_TIMEOUT=180000
HOOK_TIMEOUT=60000

# Retry settings
MAX_RETRIES=5
```

See [docs/TESTING_GUIDE.md](./docs/TESTING_GUIDE.md) for complete reference.

### Running in CI/CD

Tests are CI/CD ready with automatic infrastructure detection:

```yaml
# GitHub Actions example
- name: Run UTXO Finder Tests
  env:
    SKIP_RPC_TESTS: true      # No local node in CI
    SKIP_REGTEST_TESTS: true  # No SSH access in CI
    DAPI_TIMEOUT: 240000      # Longer timeout for CI networks
    MAX_RETRIES: 7            # More retries for flaky CI
  run: npm test
```

### Resilience Features

Tests include production-ready resilience patterns:

**Retry Logic**: Automatic exponential backoff for transient failures
**Circuit Breaker**: Prevents cascading failures on bad seeds
**Seed Health**: Identifies and avoids unhealthy nodes

**Example**:
```typescript
// Tests automatically use retry + circuit breaker
await withRetry(
  () => circuitBreaker.execute(() => dapiClient.getStatus()),
  { maxRetries: 5, baseDelay: 1000 }
);
```

### Debugging Tests

**Enable verbose logging**:
```bash
VERBOSE=true npm test
```

**Check configuration**:
```typescript
import { TestEnv } from './__tests__/helpers/env';
TestEnv.printConfig();
```

**Check seed health**:
```bash
node scripts/check-testnet-health.js --verbose
```

**View test structure**:
```bash
npm test -- --reporter=verbose
```

### Documentation

Comprehensive guides available:

- **[docs/TESTING_GUIDE.md](./docs/TESTING_GUIDE.md)** - Complete testing reference
- **[docs/DNS_RESOLUTION_TESTING.md](./docs/DNS_RESOLUTION_TESTING.md)** - DNS and TLS details
- **[scripts/setup-local-testnet.md](./scripts/setup-local-testnet.md)** - Local node setup
- **[SESSION_IMPLEMENTATION_SUMMARY.md](./SESSION_IMPLEMENTATION_SUMMARY.md)** - Implementation details
- **[TEST_RESULTS.md](./TEST_RESULTS.md)** - Latest test results

### Test Statistics

**Coverage by Component**:
- AddressDerivation: 40 tests
- LatestUTXOSelector: 35 tests
- UTXOExtractor: 32 tests
- TransactionSyncer: 28 tests
- UTXOFinder: 45 tests
- BloomFilterBuilder: 2 tests
- StorageAdapter: 16 tests

**Performance**:
- Unit tests: ~1-2 seconds for all 198
- Average per test: ~5-10ms
- Integration tests: 30-90 seconds (network dependent)

**Infrastructure**:
- JSON-RPC client for all RPC operations
- Retry logic with exponential backoff
- Circuit breaker for seed failure protection
- Health monitoring for seed nodes
- Environment-based configuration

## Integration with js-evo-sdk

This library is designed to integrate cleanly with the Dash Platform SDK:

```javascript
import { UTXOFinder, AddressDerivation } from '@dashevo/dash-utxo-finder';

class WalletCoordinator {
  async setupWallet(mnemonic, network) {
    const finder = new UTXOFinder(this.dapiClient, network);

    const result = await finder.findLatestUTXOFromMnemonic(mnemonic, {
      fromHeight: options.skipSynchronizationBeforeHeight,
      requiredAmount: 200000
    });

    return {
      utxo: result.latestUTXO,
      privateKey: result.addressData.privateKey,
      changeAddress: result.internalAddresses[0].address
    };
  }
}
```

## License

MIT

## Contributing

Contributions welcome! Please ensure tests pass and maintain test coverage.

## Support

For issues and questions:
- GitHub Issues: https://github.com/dashevo/platform/issues
- Documentation: https://docs.dash.org
