# @dashevo/dash-utxo-finder - Product Requirements Document

**Version:** 1.3
**Status:** Specification (Ready for Implementation - Complete with Debug Methodology)
**Date:** 2025-10-24
**Last Updated:** 2025-10-30

---

## Executive Summary

### Problem Statement

Current UTXO discovery and selection in Dash Platform is tightly coupled with wallet-lib, which creates several pain points:

1. **Hidden complexity** - UTXO discovery, validation, and selection logic scattered across wallet-lib workers
2. **Limited flexibility** - Difficult to customize address derivation, sync strategies, or UTXO selection criteria
3. **State coupling** - Implicit state management in wallet storage makes stateless operations impossible
4. **Unclear error recovery** - Sync failures and partial states poorly documented
5. **Difficult integration** - Hard to use wallet functionality outside the js-evo-sdk identity context

### Solution: dash-utxo-finder

A lightweight, modular, **stateless-by-default** library that:

- **Simplifies UTXO operations** with clear, single-responsibility components
- **Enables flexible workflows** via pluggable storage, validators, and selectors
- **Provides excellent error recovery** with comprehensive fault tolerance documentation
- **Supports multiple address sources** (mnemonic derivation, pre-generated lists, watch-only, or hybrid)
- **Delivers end-to-end wallet coordination** from address generation through transaction signing
- **Maintains backward compatibility** with existing wallet-lib UTXO patterns

### Benefits

| Benefit | Impact |
|---------|--------|
| Stateless-first design | Applications fully control state; easy to unit test and debug |
| Pluggable storage | Can be used offline, with in-memory cache, IndexedDB, or custom backends |
| Clear error paths | Documented recovery procedures for all failure modes |
| Modular architecture | Use only the components you need; compose custom workflows |
| Comprehensive testing | Full test coverage for all network error scenarios |
| Developer experience | Simple API, clear documentation, runnable examples |

---

## 1. Scope & Capabilities

### In Scope

#### 1.1 UTXO Discovery & Selection
- ✅ Blockchain scanning from specified heights
- ✅ Transaction synchronization via DAPI streaming
- ✅ UTXO extraction with rich metadata (InstantLock, ChainLock, blockTime, etc.)
- ✅ Intelligent selection by recency, amount, or custom criteria
- ✅ Support for both confirmed and unconfirmed transactions
- ✅ Bloom filter optimization for efficient DAPI queries

#### 1.2 Address Derivation
- ✅ BIP44 standard derivation (mnemonic → addresses)
- ✅ Dual-mode operation (full control with private keys OR watch-only with xpub)
- ✅ Custom derivation path support (account index, external/internal counts)
- ✅ Single address derivation or batch generation
- ✅ Mainnet & Testnet address format support

#### 1.3 Transaction Building & Signing Coordination
- ✅ Type 8 asset lock transaction creation
- ✅ Change output calculation and routing
- ✅ Fee estimation and adjustment
- ✅ Transaction signing orchestration
- ✅ Broadcast readiness verification

#### 1.4 Identity Workflow Integration
- ✅ End-to-end identity creation workflow (address → UTXO → transaction → identity)
- ✅ Identity top-up workflow (UTXO discovery → funding transaction)
- ✅ Key management for DIP13 identities
- ✅ Coordination with WASM SDK for asset lock proofs

#### 1.5 Configuration & Flexibility
- ✅ Mnemonic-based address generation (with configurable counts)
- ✅ Pre-derived address list monitoring
- ✅ Hybrid mode (some addresses from mnemonic, some pre-generated)
- ✅ .env file configuration with runtime override capability
- ✅ Network-aware (mainnet, testnet, regtest)

### Out of Scope

#### 1.6 Explicitly Excluded
- ❌ Database persistence (left to application layer)
- ❌ Hardware wallet integration (integration point only)
- ❌ Multi-signature wallets (single-sig only)
- ❌ Coin mixing or privacy features
- ❌ Real-time market price data
- ❌ Fee market analysis beyond basic estimation

---

## 2. Architecture Overview

### 2.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Application Layer                            │
│              (Web App, CLI, Mobile, etc.)                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────▼────────────────┐
        │     Public API Entry Points     │
        ├────────────────────────────────┤
        │ • findLatestUTXO()              │
        │ • findAllUTXOs()                │
        │ • findUTXOsForAmount()          │
        │ • deriveAddresses()             │
        │ • buildTransaction()            │
        └────────────────┬────────────────┘
                         │
        ┌────────────────▼────────────────────────────────────────┐
        │        Core Orchestration Layer                        │
        │         (UTXOFinder, Coordinator)                      │
        └────────────────┬────────────────────────────────────────┘
                         │
     ┌───────────────────┼───────────────────┐
     │                   │                   │
     ▼                   ▼                   ▼
┌──────────┐       ┌──────────┐       ┌──────────┐
│ Address  │       │ Transaction  │   │  UTXO    │
│ Derivation       │   Sync       │   │ Selection│
├──────────┤       ├──────────┤   ├──────────┤
│• BIP44   │       │• Bloom    │   │• Sort by │
│• Key Gen │       │• DAPI Str │   │  Height  │
│• Format  │       │• Metadata │   │• Filter  │
└──────────┘       │• Enrich   │   │  Spent   │
                   └──────────┘   └──────────┘
                         │
                         ▼
                ┌────────────────┐
                │ UTXO Objects   │
                │ (Enriched Metadata)
                └────────────────┘
                         │
     ┌───────────────────┼───────────────────┐
     │                   │                   │
     ▼                   ▼                   ▼
┌──────────┐       ┌──────────┐       ┌──────────┐
│ Storage  │       │Validators│       │Selection │
│ Adapter  │       │(Optional)│       │ Strateg. │
│(Pluggable       │          │       │          │
└──────────┘       └──────────┘       └──────────┘
                         │
     ┌───────────────────▼───────────────────┐
     │      Application State Management     │
     │     (What app does with UTXOs)       │
     └───────────────────────────────────────┘
```

### 2.2 Data Flow: From Mnemonic to Selected UTXO

```
User Input:
├─ Mnemonic (12/24 words) OR
├─ Pre-derived addresses OR
└─ Extended public key (xpub)
           │
           ▼
┌──────────────────────┐
│ AddressDerivation    │
│ • BIP44 path gen     │
│ • Private keys (opt) │
└──────────┬───────────┘
           │
           ├─> External addresses [0..N]
           └─> Internal addresses [0..M]
                        │
                        ▼
        ┌────────────────────────────┐
        │ BloomFilterBuilder          │
        │ Create SPV bloom filter     │
        │ (efficient DAPI filtering)  │
        └────────────┬────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ TransactionSyncer          │
        │ • Connect to DAPI          │
        │ • Subscribe to tx stream   │
        │ • Stream config:           │
        │   - bloom filter           │
        │   - from/to heights        │
        └────────────┬────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ BlockValidator             │
        │ • Validate headers         │
        │ • Check chain continuity   │
        │ • Handle reorgs            │
        └────────────┬────────────────┘
                     │
        ┌────────────▼────────────────┐
        │ DAPI Stream Response        │
        │ ├─ Raw transactions (hex)   │
        │ ├─ Merkle blocks (SPV)      │
        │ ├─ Block headers            │
        │ └─ InstantSend locks (isdlock)
        └────────────┬────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ UTXOExtractor              │
        │ • Parse transaction hex    │
        │ • Extract outputs          │
        │ • Match to addresses       │
        │ • Create UTXO objects      │
        └────────────┬────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ MetadataEnricher           │
        │ • Extract blockHeight      │
        │ • isInstantLocked (stream) │
        │ • isChainLocked (stream)   │
        │ • blockTime                │
        └────────────┬────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ StorageAdapter (Optional)  │
        │ • Cache UTXOs              │
        │ • Track sync state         │
        │ • Support offline queries  │
        └────────────┬────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ LatestUTXOSelector         │
        │ • Sort by height (latest)  │
        │ • Tiebreak by blockTime    │
        │ • Tiebreak by satoshis     │
        │ • Filter spendable         │
        └────────────┬────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ Selected UTXO Result       │
        │ {                          │
        │   txId, vout, satoshis,    │
        │   address, blockHeight,    │
        │   isInstantLocked,         │
        │   isChainLocked            │
        │ }                          │
        └────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ TransactionBuilder         │
        │ • Build Type 8 transaction │
        │ • Set inputs/outputs       │
        │ • Calculate fee            │
        │ • Add change output        │
        └────────────┬────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ Transaction Ready for Sig  │
        │ (Application signs & bcast)│
        └────────────────────────────┘
```

### 2.3 Core Components

#### Component: UTXOFinder (Main Orchestrator)

**Responsibility:** Public API, workflow orchestration, state coordination

**Key Methods:**
```typescript
class UTXOFinder {
  // 1. Simple convenience methods
  async findLatestUTXOFromMnemonic(mnemonic, options): Promise<{
    latestUTXO,
    addressData,
    externalAddresses[],
    internalAddresses[]
  }>

  // 2. Address-based finding (pre-derived or xpub)
  async findLatestSpendableUTXO(addresses: string[], options): Promise<UTXO>
  async findAllUTXOs(addresses: string[], options): Promise<UTXO[]>
  async findUTXOsForAmount(addresses: string[], options): Promise<UTXO[]>

  // 3. Events for progress monitoring
  on('start', (event) => void)
  on('progress', (event) => void)
  on('found', (event) => void)
  on('error', (error) => void)
}
```

**Responsibilities:**
- Route requests to appropriate sub-components
- Manage overall workflow state (sync in progress, etc.)
- Emit progress events for UI updates
- Handle high-level error recovery

---

#### Component: AddressDerivation

**Responsibility:** BIP44 derivation, key generation, format handling

**Key Methods:**
```typescript
class AddressDerivation {
  // Full control mode
  static fromMnemonic(
    mnemonic: string,
    network: string,
    options: { accountIndex?, externalCount?, internalCount? }
  ): { external[], internal[], hdPrivateKey }

  // Watch-only mode
  static fromHDPublicKey(
    hdPublicKey: string | HDPublicKey,
    network: string,
    options: { externalCount?, internalCount? }
  ): { external[], internal[] }

  // Single address derivation
  static deriveAddress(
    mnemonic: string,
    network: string,
    accountIndex: number,
    addressIndex: number,
    isChange: boolean
  ): DerivedAddress

  // Get xpub for sharing
  static getHDPublicKeyFromMnemonic(
    mnemonic: string,
    network: string,
    accountIndex: number
  ): string
}

interface DerivedAddress {
  index: number
  address: string
  path: string              // BIP44 path: m/44'/5'/0'/0/0
  privateKey?: HDPrivateKey // Only in full-control mode
}
```

**Responsibilities:**
- BIP44 path derivation (m/44'/coin/account'/change/index)
- Key generation from mnemonic or HDKey
- Address format validation and generation
- Mainnet/Testnet differentiation
- Support both full-control (mnemonic) and watch-only (xpub) modes

---

#### Component: TransactionSyncer

**Responsibility:** DAPI streaming, transaction parsing, progress tracking

**⚠️ CRITICAL IMPLEMENTATION NOTES:**

1. **Bloom Filter Race Condition:** This component must implement the bloom filter race condition fix (see Section 5.2) to ensure complete UTXO discovery. Without this fix, new addresses discovered during sync will not be properly included in the bloom filter restart.

2. **Two-Phase Sync Required:** Must pre-sync block headers BEFORE transaction sync to build metadata cache. Merkle blocks lack height information and require lookup from pre-cached headers. See Section 2.4 for implementation details.

3. **DAPI Response Formats:** DAPI returns raw buffers (not parsed objects) and uses protobuf getter methods for stream messages. Must handle both protobuf (`msg.getRawTransactions()`) and plain property access for test compatibility. See Appendix C for complete integration guide.

**Key Methods:**
```typescript
class TransactionSyncer {
  async startSync(options: {
    dapiClient: DAPIClient
    addresses: string[]
    fromHeight: number
    toHeight?: number
    bloomFilter?: Buffer
    onTransaction?: (tx) => void
    onProgress?: (state) => void
    onError?: (error) => void
  }): Promise<SyncResult>

  async resumeSync(checkpoint: SyncCheckpoint): Promise<SyncResult>
}

interface SyncResult {
  blocksSynced: number
  transactionsCounted: number
  blockRange: { from, to }
  resumeCheckpoint: SyncCheckpoint  // For recovery
}

interface SyncCheckpoint {
  lastBlockHeight: number
  lastBlockHash: string
  transactionIds: string[]  // For deduplication
  timestamp: number
}
```

**Stream Restart Implementation (CRITICAL):**

When new addresses are discovered (expanding bloom filter), the stream must restart:

```javascript
// CORRECT IMPLEMENTATION PATTERN:

let restartInProgress = false;

const handleNewAddressesFou nd = (newAddresses) => {
  if (newAddresses.length > 0) {
    restartInProgress = true;  // ← ALWAYS SET BEFORE RESTART

    // Cancel old stream and initiate restart
    cancelStream(currentStream);

    // Restart with expanded address list
    startNewStream({
      addresses: [...currentAddresses, ...newAddresses],
      fromHeight: lastSyncedHeight + 1
    }).then((newStream) => {
      historicalSyncStream = newStream;
      restartInProgress = false;  // ← CLEAR AFTER NEW STREAM ASSIGNED
    }).catch((e) => {
      restartInProgress = false;
      emitError(e);
    });
  }
};

const endHandler = () => {
  // CRITICAL: Check BOTH conditions (see Section 5.2)
  if (historicalSyncStream !== currentStream) {
    return; // Stream was replaced
  }
  if (restartInProgress) {
    return; // Restart pending
  }
  // Only here: emit HISTORICAL_DATA_OBTAINED
  emitCompletion();
};
```

**Responsibilities:**
- Open DAPI gRPC streaming connection
- Build and apply bloom filter for address filtering
- Parse raw transaction data from stream
- Emit transactions as they arrive
- Track synchronization progress (blocks, height, %)
- **CRITICAL:** Implement the race condition fix for stream restart (Section 5.2)
- Support interruption and resumption from checkpoint
- Handle network errors with retry logic

---

#### Component: BlockValidator

**Responsibility:** Header validation, chain continuity, reorg detection

**Key Methods:**
```typescript
class BlockValidator {
  async validateHeaders(
    headers: BlockHeader[],
    expectedPreviousHash: string
  ): Promise<ValidationResult>

  async detectReorg(
    newHeaders: BlockHeader[],
    previousState: BlockState
  ): Promise<{ reorgDetected: boolean, reorgDepth: number }>
}

interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  chainContinuous: boolean
}
```

**Responsibilities:**
- Validate block header format and PoW
- Check chain continuity (each header's parent matches previous)
- Detect blockchain reorganizations
- Report validation failures for recovery procedures

---

#### Component: UTXOExtractor

**Responsibility:** Transaction parsing, UTXO object creation

**Key Methods:**
```typescript
class UTXOExtractor {
  constructor(network: string)

  extractUTXOs(
    transactions: TransactionWithMetadata[],
    addresses: string[]
  ): UTXO[]

  getSpendableUTXOs(utxos: UTXO[]): UTXO[]
}

interface TransactionWithMetadata {
  hex: string                  // Raw transaction bytes
  blockHeight: number
  blockHash: string
  blockTime: number
  isInstantLocked: boolean     // From stream isdlock message
  isChainLocked: boolean       // From block state
}

interface UTXO {
  txId: string
  vout: number
  satoshis: number
  script: string                // Hex-encoded script
  address: string
  blockHeight: number           // 0 = unconfirmed
  blockTime: number
  blockHash: string | null
  isChainLocked: boolean
  isInstantLocked: boolean
}
```

**Responsibilities:**
- Parse transaction hex into inputs/outputs
- Match outputs to addresses
- Create UTXO objects with complete metadata
- Filter for spendable outputs (confirmed OR ChainLocked OR InstantLocked)
- Handle transaction format variations

---

#### Component: MetadataEnricher

**Responsibility:** Extract lock status and timing from DAPI stream

**Key Methods:**
```typescript
class MetadataEnricher {
  enrichFromStream(
    transaction: RawTransaction,
    streamMetadata: {
      instantSendLocks: IsdLock[]
      blockHeader: BlockHeader
      merkleBlock: MerkleBlock
    }
  ): EnrichedMetadata

  parseInstantSendLock(isdlock: IsdLock): {
    txId: string
    inputs: InputData[]
    signature: string  // BLS signature
  }
}

interface EnrichedMetadata {
  blockHeight: number
  blockTime: number
  blockHash: string
  isInstantLocked: boolean   // txId in isdlock message
  isChainLocked: boolean     // Block included in ChainLock
}
```

**Responsibilities:**
- Extract InstantSend lock info from stream `isdlock` messages
- Extract ChainLock info from block metadata
- Parse block headers for height and timestamp
- Attach metadata to UTXO objects

---

#### Component: LatestUTXOSelector

**Responsibility:** UTXO sorting and selection strategy

**Key Methods:**
```typescript
class LatestUTXOSelector {
  static select(
    utxos: UTXO[],
    requiredAmount?: number
  ): UTXO  // Latest single UTXO

  static getAllSpendable(utxos: UTXO[]): UTXO[]  // All, sorted by recency

  static selectForAmount(
    utxos: UTXO[],
    amount: number
  ): UTXO[]  // Minimum set for amount
}
```

**Selection Algorithm (Preferred → Fallback):**
1. Filter for spendable: (blockHeight > 0 OR isChainLocked OR isInstantLocked)
2. Sort by: blockHeight DESC (highest = most recent)
3. Tiebreak by: blockTime DESC (most recent time)
4. Tiebreak by: satoshis DESC (larger amounts)
5. Return first (latest)

**Responsibilities:**
- Implement chronological UTXO ordering
- Filter non-spendable UTXOs
- Support different selection strategies (single, all, for-amount)
- Expose sorting for custom selection logic

---

#### Component: StorageAdapter (Optional/Pluggable)

**Responsibility:** Optional state caching and offline queries

**Key Methods:**
```typescript
interface StorageAdapter {
  // Store UTXOs from sync
  saveUTXOs(network: string, address: string, utxos: UTXO[]): Promise<void>

  // Query cached UTXOs (offline)
  getUTXOs(network: string, address: string): Promise<UTXO[]>

  // Track sync state for resumption
  saveSyncCheckpoint(network: string, checkpoint: SyncCheckpoint): Promise<void>
  getSyncCheckpoint(network: string): Promise<SyncCheckpoint | null>

  // Clear cache
  clear(network: string, address?: string): Promise<void>
}

// Default: In-memory storage
class InMemoryStorage implements StorageAdapter { ... }

// Application can provide:
class IndexedDBStorage implements StorageAdapter { ... }
class LocalStorageStorage implements StorageAdapter { ... }
class DatabaseStorage implements StorageAdapter { ... }
```

**Responsibilities:**
- Optional caching of discovered UTXOs
- Optional tracking of sync checkpoints for recovery
- Support multiple backend implementations
- Fully optional (null/undefined means stateless)

---

### 2.4 Processing Pipeline

The sync pipeline follows this order:

```
1. Configuration
   └─> DAPIClient, addresses, heights, options

2. Address Preparation
   ├─> Derive addresses (if mnemonic)
   └─> Validate address formats

3. Bloom Filter Creation
   └─> Build SPV filter from addresses

4. Transaction Sync
   ├─> Open DAPI stream
   ├─> Apply bloom filter
   └─> Stream transactions as they arrive

5. Block Header Validation
   ├─> Validate header format
   ├─> Check chain continuity
   └─> Detect reorgs

6. Transaction Parsing
   ├─> Parse hex to transaction
   ├─> Extract inputs/outputs
   └─> Match to addresses

7. Metadata Enrichment
   ├─> Extract InstantSend locks
   ├─> Extract ChainLock status
   └─> Attach block metadata

8. UTXO Object Creation
   ├─> Create UTXO objects
   └─> Filter spendable only

9. Storage (Optional)
   ├─> Save to StorageAdapter
   └─> Track sync checkpoint

10. Selection
    ├─> Sort by chronology
    └─> Return based on strategy (latest/all/for-amount)
```

---

## 2.4 Low-Level DAPI Integration

**⚠️ CRITICAL:** This section documents essential low-level details not obvious from DAPI documentation. These details were discovered by analyzing the working wallet-lib implementation and caused significant debugging when initially missing.

### 2.4.1 DAPI Response Formats

#### getBlockByHeight() Returns Raw Buffers

**Critical Implementation Detail:** DAPI returns raw block buffers, NOT parsed objects with properties.

```typescript
// ❌ WRONG - Will fail
const block = await dapiClient.core.getBlockByHeight(height);
const hash = block.hash;  // undefined - it's a raw buffer!
const time = block.header.time;  // undefined

// ✅ CORRECT - Parse buffer first
const buffer = await dapiClient.core.getBlockByHeight(height);
const Block = require('@dashevo/dashcore-lib').Block;
const block = new Block(buffer);
const hash = block.header.hash;  // ✅ Works
const time = block.header.time;  // ✅ Works
```

**Why This Matters:** Without parsing, header cache stays empty → blockHeight = 0 → UTXOs marked unspendable.

#### subscribeToTransactionsWithProofs() Returns Protobuf Messages

**Critical Implementation Detail:** Stream messages are protobuf objects with getter methods, NOT plain JavaScript objects.

```typescript
stream.on('data', (msg) => {
  // ❌ WRONG - Properties are undefined
  const rawTxs = msg.rawTransactions;  // undefined
  const rawMerkle = msg.rawMerkleBlock;  // undefined

  // ✅ CORRECT - Use getter methods
  const rawTxs = msg.getRawTransactions();  // ✅ Works
  const rawMerkle = msg.getRawMerkleBlock();  // ✅ Works

  // Nested getters for transaction lists
  const txList = rawTxs.getTransactionsList();  // Array of buffers
});
```

**Best Practice:** Support both patterns for test compatibility:
```typescript
const rawTxs = typeof msg.getRawTransactions === 'function'
  ? msg.getRawTransactions()
  : msg.rawTransactions;  // Fallback for mocks
```

### 2.4.2 Two-Phase Sync Pattern

**Problem:** Merkle blocks contain header hash but NOT height or reliable timestamp.

**Solution:** Pre-sync headers BEFORE transaction sync to build metadata cache.

#### Phase 1: Header Pre-Sync

```typescript
class TransactionSyncer {
  private headerCache = new Map<string, { height: number; time: number }>();

  private async syncHeaders(fromHeight: number, toHeight: number): Promise<void> {
    const core = await this.getCore();

    // Fetch blocks in batches
    const BATCH_SIZE = 100;
    for (let h = fromHeight; h <= toHeight; h += BATCH_SIZE) {
      const batchEnd = Math.min(h + BATCH_SIZE - 1, toHeight);
      const headerPromises = [];

      for (let height = h; height <= batchEnd; height++) {
        headerPromises.push({
          height,
          promise: core.getBlockByHeight(height).catch(() => null)
        });
      }

      const results = await Promise.all(headerPromises.map(hp => hp.promise));

      // Parse raw block buffers
      results.forEach((buffer, index) => {
        if (buffer) {
          const Block = require('@dashevo/dashcore-lib').Block;
          const block = new Block(buffer);

          this.headerCache.set(block.header.hash, {
            height: headerPromises[index].height,  // From our request
            time: block.header.time
          });
        }
      });
    }
  }
}
```

#### Phase 2: Transaction Sync with Cache Lookup

```typescript
async syncTransactions(bloomFilter, fromHeight, toHeight) {
  // Pre-sync headers FIRST
  await this.syncHeaders(fromHeight, toHeight);

  // Then sync transactions
  const stream = core.subscribeToTransactionsWithProofs(bloomFilter, {
    fromBlockHeight: fromHeight,
    count: toHeight - fromHeight
  });

  for await (const msg of stream) {
    const rawMerkle = msg.getRawMerkleBlock();
    if (rawMerkle) {
      const merkleBlock = new MerkleBlock(Buffer.from(rawMerkle));

      // Instant cache lookup (synchronous, fast!)
      const metadata = this.headerCache.get(merkleBlock.header.hash);
      const blockHeight = metadata.height;  // ✅ NOT 0!
      const blockTime = metadata.time;

      // Attach metadata to transactions
      transactions.forEach(tx => {
        tx.metadata = { blockHeight, blockTime, blockHash: merkleBlock.header.hash };
      });
    }
  }
}
```

**Why This Matters:**
- Without header cache: blockHeight = 0 → UTXOs unspendable
- Async `getBlockByHash()` during streaming is slow/unreliable
- Pre-cached lookup is instant and deterministic
- Follows proven wallet-lib BlockHeadersSyncWorker pattern

### 2.4.3 Stream Message Ordering - Critical Pattern

**⚠️ CRITICAL DISCOVERY:** Transactions and their merkle blocks arrive in **SEPARATE messages**, not together.

#### Message Flow Pattern

The DAPI stream does NOT send transactions and their merkle blocks in the same message:

```
Message 1: { rawTransactions: [txA, txB, txC], rawMerkleBlock: null }
Message 2: { rawTransactions: null, rawMerkleBlock: blockX }  ← Contains txA hash
Message 3: { rawTransactions: [txD], rawMerkleBlock: null }
Message 4: { rawTransactions: null, rawMerkleBlock: blockY }  ← Contains txB, txC, txD hashes
```

**Why This Matters:**
- You CANNOT process transaction + metadata in one step
- Must use **store-then-match** pattern
- Transaction initially has `metadata: null`
- Later message updates metadata via hash matching

#### Required Implementation Pattern

```typescript
const transactions: TransactionWithMetadata[] = [];

for await (const msg of stream) {
  // PHASE A: Store transactions immediately (metadata unknown yet)
  if (rawTxs) {
    const txList = rawTxs.getTransactionsList();
    txList.forEach(txBuf => {
      const tx = new Transaction(Buffer.from(txBuf));
      transactions.push({
        tx,
        metadata: null  // ← Will be updated when merkle block arrives
      });
    });
  }

  // PHASE B: Match merkle block to PREVIOUSLY stored transactions
  if (rawMerkle) {
    const merkleBlock = new MerkleBlock(Buffer.from(rawMerkle));
    const cachedHeader = this.headerCache.get(merkleBlock.header.hash);

    // Extract transaction hashes from merkle block
    const txHashesInBlock = new Set(
      merkleBlock.hashes.map(h => {
        return Buffer.from(String(h), 'hex').reverse().toString('hex');
      })
    );

    // Find PREVIOUSLY stored transactions that belong to this block
    transactions
      .filter(({ tx }) => txHashesInBlock.has(tx.hash))
      .forEach(txData => {
        // Backfill metadata for matched transactions
        txData.metadata = {
          blockHash: merkleBlock.header.hash,
          height: cachedHeader.height,
          time: new Date(cachedHeader.time * 1000),
          isChainLocked: false,
          isInstantLocked: false
        };
      });
  }
}
```

**Common Mistake:**
```typescript
// ❌ WRONG - Assumes tx and merkle block are together
if (rawTxs && rawMerkle) {
  const tx = new Transaction(rawTxs[0]);
  tx.metadata = extractFromMerkleBlock(rawMerkle);  // Won't work!
}

// ✅ CORRECT - Store then match across messages
transactions.push({ tx, metadata: null });  // Store first
// ... later, when merkle block arrives...
txData.metadata = metadata;  // Match and update
```

### 2.4.4 Complete Stream Message Processing

```typescript
for await (const msg of stream) {
  // 1. Detect protobuf vs plain objects
  const rawTxs = typeof msg.getRawTransactions === 'function'
    ? msg.getRawTransactions()
    : msg.rawTransactions;

  const rawMerkle = typeof msg.getRawMerkleBlock === 'function'
    ? msg.getRawMerkleBlock()
    : msg.rawMerkleBlock;

  // 2. Handle nested protobuf wrappers for transactions
  if (rawTxs) {
    const txList = typeof rawTxs.getTransactionsList === 'function'
      ? rawTxs.getTransactionsList()
      : (Array.isArray(rawTxs) ? rawTxs : null);

    if (txList) {
      const transactions = txList.map(buf => new Transaction(Buffer.from(buf)));
      // Process transactions...
    }
  }

  // 3. Parse merkle block and lookup metadata
  if (rawMerkle) {
    const merkleBlock = new MerkleBlock(Buffer.from(rawMerkle));
    const cachedHeader = this.headerCache.get(merkleBlock.header.hash);

    if (cachedHeader) {
      const metadata = {
        blockHash: merkleBlock.header.hash,
        height: cachedHeader.height,
        time: new Date(cachedHeader.time * 1000),
        isChainLocked: false,
        isInstantLocked: false
      };

      // Match transactions to this block and attach metadata
    }
  }
}
```

### 2.4.5 Reference: wallet-lib Implementation

This implementation follows the wallet-lib proven pattern:

**wallet-lib Architecture:**
- `BlockHeadersSyncWorker`: Syncs headers first → stores in chainStore
- `TransactionsSyncWorker`: Reads header metadata from cache
- File locations:
  - `/packages/wallet-lib/src/plugins/Workers/BlockHeadersSyncWorker/BlockHeadersSyncWorker.js` (lines 143-157)
  - `/packages/wallet-lib/src/plugins/Workers/TransactionsSyncWorker/TransactionsSyncWorker.js` (lines 409-422)
  - `/packages/wallet-lib/src/plugins/Workers/TransactionsSyncWorker/TransactionsReader.js` (lines 165-166)

**Key Pattern from wallet-lib (lines 409-422):**
```javascript
const chainStore = this.storage.getDefaultChainStore();
const headerHash = merkleBlock.header.hash;
const headerMetadata = chainStore.state.headersMetadata.get(headerHash);

if (!headerMetadata) {
  rejectMerkleBlock(new Error('Header metadata was not found'));
  return;
}

const headerHeight = headerMetadata.height;
const headerTime = headerMetadata.time;
```

---

## 3. Redesigned Stages (from 11-Stage Flow)

The previous implementation had 11 sequential stages. The new architecture reorganizes these into component responsibilities:

### Stage Mapping

| Old Stage | New Component(s) | Change |
|-----------|------------------|--------|
| 1-2: User Init | UTXOFinder | Simplified to API method call |
| 3: Sync (plugins) | TransactionSyncer + BlockValidator | Consolidated, direct DAPI |
| 4: DAPI Transport | TransactionSyncer | Direct streaming, no wrapper |
| 5: Tx Parsing | UTXOExtractor | Dedicated component |
| 6: Storage | StorageAdapter (optional) | Pluggable, not implicit |
| 7: Address Gen | AddressDerivation | Upfront, not during sync |
| 8: UTXO Retrieval | StorageAdapter + UTXOFinder | Query stored/in-transit UTXOs |
| 9: Validation | Optional validators | User-provided, not mandatory |
| 10: Coin Selection | LatestUTXOSelector | Dedicated strategy component |
| 11: Transaction | TransactionBuilder | (Outside scope of finder) |

### Key Improvements

1. **Address generation upfront** - Generate all addresses before sync (not async during)
2. **Stateless by default** - No implicit storage; app controls state
3. **Direct DAPI** - Eliminate DAPIClientTransport wrapper layer
4. **Pluggable validators** - Optional, user-provided validation
5. **Clear separation** - Each component has one responsibility

---

## 4. Complete API Reference

### 4.1 UTXOFinder - Main API

```typescript
/**
 * Main UTXO Finder class - orchestrates all operations
 */
class UTXOFinder extends EventEmitter {
  constructor(
    dapiClient: DAPIClient,
    network: string = 'testnet',
    options?: {
      storageAdapter?: StorageAdapter
      logger?: Logger
      timeout?: number
    }
  )

  /**
   * Convenience: Derive addresses from mnemonic and find latest UTXO
   *
   * @param mnemonic BIP39 mnemonic (12 or 24 words)
   * @param options Configuration
   * @returns Latest UTXO with derived addresses and private keys
   *
   * @throws Error if no spendable UTXOs found or invalid mnemonic
   *
   * @example
   * const result = await finder.findLatestUTXOFromMnemonic(
   *   'abandon abandon abandon ... about',
   *   {
   *     accountIndex: 0,
   *     externalCount: 20,
   *     internalCount: 20,
   *     fromHeight: 1000000,
   *     requiredAmount: 200000  // 0.002 DASH
   *   }
   * );
   * console.log('UTXO:', result.latestUTXO);
   * console.log('Address:', result.addressData.address);
   * console.log('Private Key:', result.addressData.privateKey);
   */
  async findLatestUTXOFromMnemonic(
    mnemonic: string,
    options: {
      accountIndex?: number
      externalCount?: number
      internalCount?: number
      fromHeight: number
      toHeight?: number
      requiredAmount?: number
      onProgress?: (progress: ProgressEvent) => void
    }
  ): Promise<{
    latestUTXO: UTXO
    addressData: DerivedAddress
    externalAddresses: DerivedAddress[]
    internalAddresses: DerivedAddress[]
  }>

  /**
   * Find the single latest spendable UTXO for given addresses
   *
   * Use this when you already have derived addresses or xpub-generated addresses.
   *
   * @param addresses Array of Dash addresses to monitor
   * @param options Configuration
   * @returns Latest spendable UTXO
   *
   * @throws Error if no spendable UTXOs found or invalid parameters
   *
   * @example
   * const utxo = await finder.findLatestSpendableUTXO(
   *   ['yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj'],
   *   { fromHeight: 1000000, requiredAmount: 200000 }
   * );
   */
  async findLatestSpendableUTXO(
    addresses: string[],
    options: {
      fromHeight: number
      toHeight?: number
      requiredAmount?: number
      bloomFilter?: Buffer
      onProgress?: (progress: ProgressEvent) => void
    }
  ): Promise<UTXO>

  /**
   * Get all spendable UTXOs sorted by blockchain recency (latest first)
   *
   * Useful for displaying available funds or implementing custom selection strategies.
   *
   * @param addresses Array of Dash addresses to scan
   * @param options Configuration
   * @returns All spendable UTXOs, newest first
   *
   * @example
   * const utxos = await finder.findAllUTXOs(
   *   ['yAddr1', 'yAddr2'],
   *   { fromHeight: 1000000 }
   * );
   * console.log(`Found ${utxos.length} spendable UTXOs`);
   * utxos.forEach(u => console.log(`${u.satoshis} sats at height ${u.blockHeight}`));
   */
  async findAllUTXOs(
    addresses: string[],
    options: {
      fromHeight: number
      toHeight?: number
      bloomFilter?: Buffer
      onProgress?: (progress: ProgressEvent) => void
    }
  ): Promise<UTXO[]>

  /**
   * Find minimum UTXO set needed to cover a specific amount
   *
   * Useful for coin selection: finds the smallest set of UTXOs that total >= requiredAmount.
   * Uses greedy approach: selects newest UTXOs first until threshold is met.
   *
   * @param addresses Array of Dash addresses to scan
   * @param options Configuration including requiredAmount
   * @returns Array of UTXOs totaling >= requiredAmount
   *
   * @throws Error if total UTXOs insufficient for amount
   *
   * @example
   * const selected = await finder.findUTXOsForAmount(
   *   ['yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj'],
   *   { fromHeight: 1000000, requiredAmount: 500000 }  // 0.005 DASH
   * );
   * const total = selected.reduce((sum, u) => sum + u.satoshis, 0);
   * console.log(`Selected ${selected.length} UTXOs totaling ${total} sats`);
   */
  async findUTXOsForAmount(
    addresses: string[],
    options: {
      fromHeight: number
      toHeight?: number
      requiredAmount: number
      bloomFilter?: Buffer
      onProgress?: (progress: ProgressEvent) => void
    }
  ): Promise<UTXO[]>

  /**
   * Get DAPI URL and status
   */
  getStatus(): {
    network: string
    dapiUrl: string
    connected: boolean
  }

  /**
   * Close DAPI connection and cleanup resources
   */
  async close(): Promise<void>
}
```

#### Events Emitted

```typescript
// Event: 'start' - Sync operation began
finder.on('start', (event: {
  addressCount: number
  fromHeight: number
  toHeight?: number
  addressesScanning: string[]
}) => { ... })

// Event: 'progress' - Sync in progress
finder.on('progress', (event: {
  progress: number              // 0-100 percentage
  syncedBlocks: number
  totalBlocks: number
  currentHeight: number
  estimatedTimeRemaining?: number
}) => { ... })

// Event: 'found' - New UTXO(s) discovered
finder.on('found', (event: {
  utxo?: UTXO                  // Single UTXO for findLatestSpendableUTXO
  utxos?: UTXO[]               // Multiple for findAllUTXOs
  totalFound: number           // Cumulative count
  fromHeight?: number
  toHeight?: number
}) => { ... })

// Event: 'error' - Error occurred (may be recoverable)
finder.on('error', (error: {
  message: string
  code: string
  recoverable: boolean
  suggestedAction?: string
}) => { ... })
```

---

### 4.2 AddressDerivation - Address Generation

```typescript
/**
 * Address derivation utilities
 * Supports BIP44 standard and dual-mode operation (full control or watch-only)
 */
class AddressDerivation {
  /**
   * Derive addresses from BIP39 mnemonic (full control mode)
   *
   * Generates all addresses for an account with private keys accessible.
   * Useful for wallets that need to sign transactions.
   *
   * @param mnemonic BIP39 mnemonic (12 or 24 words)
   * @param network Network: 'mainnet' or 'testnet'
   * @param options Derivation options
   * @returns External, internal addresses plus private key for signing
   *
   * @example
   * const { external, internal, hdPrivateKey } = AddressDerivation.fromMnemonic(
   *   'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
   *   'testnet',
   *   { accountIndex: 0, externalCount: 10, internalCount: 10 }
   * );
   *
   * // Use external for receiving payments
   * console.log('Receive address:', external[0].address);
   *
   * // Use internal for change
   * console.log('Change address:', internal[0].address);
   *
   * // Export public key for watch-only sharing
   * const xpub = AddressDerivation.getHDPublicKeyFromMnemonic(mnemonic, 'testnet');
   */
  static fromMnemonic(
    mnemonic: string,
    network?: string,
    options?: {
      accountIndex?: number        // Default: 0
      externalCount?: number       // Default: 20 (receiving addresses)
      internalCount?: number       // Default: 20 (change addresses)
    }
  ): {
    external: DerivedAddress[]
    internal: DerivedAddress[]
    hdPrivateKey: HDPrivateKey
  }

  /**
   * Derive addresses from extended public key (watch-only mode)
   *
   * Generates addresses without private keys. Useful for:
   * - Public wallets that only display balances
   * - Monitoring wallets where signing happens elsewhere
   * - Mobile apps with restricted security policies
   *
   * @param hdPublicKey Extended public key (xpub for mainnet, tpub for testnet)
   * @param network Network: 'mainnet' or 'testnet'
   * @param options Derivation options
   * @returns External and internal addresses (no private keys)
   *
   * @example
   * const xpub = 'tpub6...';  // Share this publicly
   *
   * const { external, internal } = AddressDerivation.fromHDPublicKey(
   *   xpub,
   *   'testnet',
   *   { externalCount: 10, internalCount: 10 }
   * );
   *
   * // Safe to use these publicly - no private keys
   * externalAddresses = external.map(a => a.address);
   */
  static fromHDPublicKey(
    hdPublicKey: HDPublicKey | string,
    network?: string,
    options?: {
      externalCount?: number
      internalCount?: number
    }
  ): {
    external: DerivedAddress[]
    internal: DerivedAddress[]
  }

  /**
   * Derive a single address at specific derivation path
   *
   * Useful when you need one specific address or testing specific indices.
   *
   * @param mnemonic BIP39 mnemonic
   * @param network Network: 'mainnet' or 'testnet'
   * @param accountIndex Account index (0 for most use cases)
   * @param addressIndex Address index within the change chain
   * @param isChange true for internal (change) addresses, false for external (receiving)
   * @returns Single derived address with optional private key
   *
   * @example
   * // Get specific receiving address
   * const addr = AddressDerivation.deriveAddress(
   *   mnemonic,
   *   'testnet',
   *   0,     // account
   *   5,     // address 5
   *   false  // external/receiving
   * );
   * console.log('Address 5:', addr.address);
   * console.log('Path:', addr.path);  // m/44'/1'/0'/0/5
   */
  static deriveAddress(
    mnemonic: string,
    network: string,
    accountIndex: number,
    addressIndex: number,
    isChange?: boolean
  ): DerivedAddress

  /**
   * Get extended public key from mnemonic
   *
   * The xpub (tpub on testnet) can be shared publicly for watch-only wallets.
   * Others can derive all addresses without seeing private keys.
   *
   * @param mnemonic BIP39 mnemonic
   * @param network Network: 'mainnet' or 'testnet'
   * @param accountIndex Account index
   * @returns Extended public key string (xpub or tpub)
   *
   * @example
   * const xpub = AddressDerivation.getHDPublicKeyFromMnemonic(mnemonic, 'testnet', 0);
   *
   * // Share xpub with watch-only applications
   * console.log('Share this for watch-only:', xpub);
   *
   * // Others use it like:
   * const addresses = AddressDerivation.fromHDPublicKey(xpub, 'testnet');
   */
  static getHDPublicKeyFromMnemonic(
    mnemonic: string,
    network?: string,
    accountIndex?: number
  ): string
}

/**
 * Derived address object
 */
interface DerivedAddress {
  index: number              // Index in generation sequence
  address: string            // Dash address (yXXX for testnet, XXXX for mainnet)
  path: string               // BIP44 derivation path (e.g., m/44'/1'/0'/0/5)
  privateKey?: any           // HDPrivateKey (only in full-control mode)
}
```

---

### 4.3 BloomFilterBuilder - SPV Filter Creation

```typescript
/**
 * Bloom filter creation for efficient DAPI filtering
 */
class BloomFilterBuilder {
  /**
   * Build a bloom filter from addresses
   *
   * Bloom filters allow DAPI servers to efficiently filter transactions
   * without exposing your full address list.
   *
   * @param addresses Array of Dash addresses to filter for
   * @param network Network: 'mainnet' or 'testnet'
   * @returns Buffer containing bloom filter data
   *
   * @example
   * const bloomFilter = BloomFilterBuilder.build(
   *   ['yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj', 'yAnother...'],
   *   'testnet'
   * );
   *
   * // Use in findLatestSpendableUTXO or directly with TransactionSyncer
   * const utxo = await finder.findLatestSpendableUTXO(addresses, {
   *   fromHeight: 1000000,
   *   bloomFilter  // Pass pre-built filter
   * });
   */
  static build(addresses: string[], network: string): Buffer
}
```

---

### 4.4 TransactionSyncer - DAPI Streaming

```typescript
/**
 * Low-level transaction syncing from DAPI
 * Handles DAPI streaming, parsing, and progress tracking
 */
class TransactionSyncer extends EventEmitter {
  constructor(
    dapiClient: DAPIClient,
    network: string,
    options?: {
      logger?: Logger
      timeout?: number
    }
  )

  /**
   * Start transaction sync from blockchain
   *
   * Opens gRPC stream to DAPI and begins pulling transactions.
   * Emits transactions via 'transaction' event as they arrive.
   * Call this for direct, low-level control over sync process.
   *
   * @param options Configuration
   * @returns Sync completion result with checkpoint for resumption
   *
   * @throws Error on DAPI unavailability or stream failure
   *
   * @example
   * const syncer = new TransactionSyncer(dapiClient, 'testnet');
   *
   * syncer.on('transaction', (tx) => {
   *   console.log('Found transaction:', tx.txId);
   *   // Process raw transaction data
   * });
   *
   * syncer.on('progress', (event) => {
   *   console.log(`Synced ${event.blocksSynced}/${event.totalBlocks} blocks`);
   * });
   *
   * const result = await syncer.startSync({
   *   addresses: ['yAddr1', 'yAddr2'],
   *   fromHeight: 1000000,
   *   toHeight: 1001000
   * });
   *
   * console.log(`Synced ${result.transactionsCounted} transactions`);
   */
  async startSync(options: {
    addresses: string[]
    fromHeight: number
    toHeight?: number
    bloomFilter?: Buffer
    onTransaction?: (tx: any) => void
    onProgress?: (progress: any) => void
    onError?: (error: Error) => void
  }): Promise<{
    blocksSynced: number
    transactionsCounted: number
    blockRange: { from: number, to: number }
    resumeCheckpoint: SyncCheckpoint
  }>

  /**
   * Resume sync from previous checkpoint
   *
   * Allows recovery from interrupted syncs. Pass the checkpoint
   * returned from previous startSync() or saved to storage.
   *
   * @param checkpoint Saved sync state
   * @returns Completion result
   *
   * @example
   * // After interruption, resume:
   * const checkpoint = await storage.getSyncCheckpoint('testnet');
   * const result = await syncer.resumeSync(checkpoint);
   */
  async resumeSync(checkpoint: SyncCheckpoint): Promise<any>
}

interface SyncCheckpoint {
  lastBlockHeight: number
  lastBlockHash: string
  transactionIds: string[]
  timestamp: number
}
```

---

### 4.5 BlockValidator - Header Validation

```typescript
/**
 * Blockchain header validation
 */
class BlockValidator {
  constructor(network: string)

  /**
   * Validate block headers for format and chain continuity
   *
   * @param headers Array of BlockHeader objects
   * @param expectedPreviousHash Expected hash of parent block
   * @returns Validation result
   *
   * @example
   * const result = await validator.validateHeaders(headers, previousHash);
   * if (!result.valid) {
   *   console.error('Invalid headers:', result.errors);
   * }
   */
  async validateHeaders(
    headers: BlockHeader[],
    expectedPreviousHash: string
  ): Promise<{
    valid: boolean
    errors: ValidationError[]
    chainContinuous: boolean
  }>

  /**
   * Detect blockchain reorganizations
   *
   * Returns detection results if a reorg is detected.
   *
   * @param newHeaders New headers received
   * @param previousState Previous validated state
   * @returns Reorg information
   */
  async detectReorg(
    newHeaders: BlockHeader[],
    previousState: BlockState
  ): Promise<{
    reorgDetected: boolean
    reorgDepth?: number
    affectedHeight?: number
  }>
}
```

---

### 4.6 UTXOExtractor - Transaction Parsing

```typescript
/**
 * Extracts UTXO objects from raw transaction data
 */
class UTXOExtractor {
  constructor(network: string = 'testnet')

  /**
   * Extract UTXO objects from transactions
   *
   * Parses transaction hex, identifies relevant outputs,
   * and creates UTXO objects with complete metadata.
   *
   * @param transactions Raw transaction data from DAPI
   * @param addresses Addresses to match outputs against
   * @returns Array of UTXO objects
   *
   * @example
   * const utxos = extractor.extractUTXOs(transactions, addresses);
   * console.log(`Extracted ${utxos.length} UTXOs`);
   */
  extractUTXOs(
    transactions: TransactionWithMetadata[],
    addresses: string[]
  ): UTXO[]

  /**
   * Filter UTXOs to only spendable ones
   *
   * Spendable means: confirmed (height > 0) OR ChainLocked OR InstantLocked.
   * Unconfirmed and unconfirmed transactions are excluded.
   *
   * @param utxos Mixed UTXO array
   * @returns Only spendable UTXOs
   */
  getSpendableUTXOs(utxos: UTXO[]): UTXO[]
}

interface TransactionWithMetadata {
  hex: string               // Raw transaction hex
  blockHeight: number       // Block containing transaction
  blockHash: string
  blockTime: number         // Block timestamp
  isInstantLocked: boolean  // From stream isdlock message
  isChainLocked: boolean    // From block state
}

interface UTXO {
  txId: string              // Transaction ID
  vout: number              // Output index in transaction
  satoshis: number          // Value in satoshis
  script: string            // Hex-encoded output script
  address: string           // Dash address
  blockHeight: number       // 0 = unconfirmed, >0 = confirmed
  blockTime: number         // Timestamp in milliseconds
  blockHash: string | null  // Block hash
  isChainLocked: boolean    // Protected by ChainLock
  isInstantLocked: boolean  // Protected by InstantSend
}
```

---

### 4.7 LatestUTXOSelector - Selection Strategy

```typescript
/**
 * Intelligent UTXO selection based on blockchain state
 */
class LatestUTXOSelector {
  /**
   * Select the single latest spendable UTXO
   *
   * Uses chronological ordering:
   * 1. Filter spendable (confirmed OR locked)
   * 2. Sort by block height (newest first)
   * 3. Tiebreak by block time
   * 4. Tiebreak by satoshis (larger first)
   * 5. Return first
   *
   * Useful for finding most recent UTXO to avoid transaction conflicts.
   *
   * @param utxos Available UTXO pool
   * @param requiredAmount Optional minimum amount
   * @returns Single latest UTXO
   *
   * @throws Error if no spendable UTXOs or insufficient funds
   *
   * @example
   * const latestUTXO = LatestUTXOSelector.select(utxos, 200000);
   */
  static select(
    utxos: UTXO[],
    requiredAmount?: number
  ): UTXO

  /**
   * Get all spendable UTXOs sorted by recency
   *
   * Useful for displaying available funds or implementing
   * custom selection strategies.
   *
   * @param utxos UTXO pool (mixed spendable and unspendable)
   * @returns All spendable UTXOs, newest first
   *
   * @example
   * const spendable = LatestUTXOSelector.getAllSpendable(utxos);
   * spendable.forEach(u => {
   *   console.log(`${u.satoshis} sats at height ${u.blockHeight}`);
   * });
   */
  static getAllSpendable(utxos: UTXO[]): UTXO[]

  /**
   * Find minimum UTXO set for specific amount
   *
   * Greedy algorithm: selects newest UTXOs until total >= amount.
   * Returns the smallest set that covers the amount.
   *
   * @param utxos UTXO pool
   * @param amount Required amount in satoshis
   * @returns Minimum UTXO set for amount
   *
   * @throws Error if insufficient funds
   *
   * @example
   * const selected = LatestUTXOSelector.selectForAmount(utxos, 500000);
   * const total = selected.reduce((sum, u) => sum + u.satoshis, 0);
   * console.log(`Selected ${selected.length} UTXOs totaling ${total}`);
   */
  static selectForAmount(
    utxos: UTXO[],
    amount: number
  ): UTXO[]
}
```

---

### 4.8 StorageAdapter - Optional Caching

```typescript
/**
 * Optional storage for caching UTXOs and sync state
 * Allows offline queries and sync recovery
 */
interface StorageAdapter {
  /**
   * Store discovered UTXOs
   *
   * Called after successful sync to cache results.
   * Implementation can choose backend (memory, IndexedDB, etc.)
   *
   * @param network Network name ('mainnet' or 'testnet')
   * @param address Address being synced
   * @param utxos UTXO objects to store
   */
  saveUTXOs(
    network: string,
    address: string,
    utxos: UTXO[]
  ): Promise<void>

  /**
   * Retrieve cached UTXOs (offline operation)
   *
   * Allows querying previously synced UTXOs without network.
   * Returns empty array if no data cached.
   *
   * @param network Network name
   * @param address Address to query
   * @returns Cached UTXOs (or empty array)
   */
  getUTXOs(
    network: string,
    address: string
  ): Promise<UTXO[]>

  /**
   * Store sync checkpoint for recovery
   *
   * Saves progress state to resume interrupted syncs.
   * Implementation may persist to storage.
   *
   * @param network Network name
   * @param checkpoint Sync state
   */
  saveSyncCheckpoint(
    network: string,
    checkpoint: SyncCheckpoint
  ): Promise<void>

  /**
   * Retrieve sync checkpoint for resumption
   *
   * Returns null if no checkpoint saved.
   *
   * @param network Network name
   * @returns Saved checkpoint or null
   */
  getSyncCheckpoint(
    network: string
  ): Promise<SyncCheckpoint | null>

  /**
   * Clear cached data
   *
   * @param network Network name
   * @param address Optional: clear only specific address
   */
  clear(
    network: string,
    address?: string
  ): Promise<void>
}

/**
 * Default in-memory implementation
 */
class InMemoryStorage implements StorageAdapter {
  // Stores everything in RAM
  // Clears on process exit
  // Fast but not persistent
}
```

---

## 5. Critical Bloom Filter Implementation Details

### 5.1 The Race Condition Bug (Upstream Issue)

**Status:** ✅ FIXED in current branch (`fix/instant-lock-timing-and-wasm-isolation`)

#### Problem: Stream Restart Race Condition

When SPV bloom filter expansion occurs (new addresses discovered), the TransactionSyncer must restart the DAPI stream with an expanded bloom filter. However, a critical race condition exists:

```
Timeline:
  T0: cancelStream(oldStream) called
  T1: oldStream's 'end' event fires (async)
  T2: endHandler() executes on old stream
  T3: HISTORICAL_DATA_OBTAINED signal emitted (WRONG - sync not actually complete!)
  T4: newStream being created asynchronously
  T5: newStream finally assigned to historicalSyncStream
  T6: newStream begins processing (too late - sync already marked complete)
```

**Result:** Wallet thinks synchronization is complete (HISTORICAL_DATA_OBTAINED event), but the new stream hasn't started yet. UTXOs from the new address range are never discovered.

#### Impact on UTXO Discovery

Without the fix:
- ❌ Incomplete UTXO discovery (new addresses' UTXOs missed)
- ❌ latestSpendableUTXO algorithm has incomplete data to work with
- ❌ Coin selection may fail or select wrong UTXO
- ❌ Identity creation fails due to "insufficient funds" (funds exist but not discovered)

With the fix:
- ✅ Complete UTXO discovery (all addresses scanned properly)
- ✅ latestSpendableUTXO algorithm has accurate data
- ✅ Coin selection works reliably
- ✅ Identity creation succeeds

### 5.2 The Solution: Dual-Check Strategy

**Files:**
- `packages/wallet-lib/src/plugins/Workers/TransactionsSyncWorker/TransactionsReader.js` (lines 121-275)
- Implementation in: `subscribeWithRetries` HOF

#### Fix: Prevent Premature Completion Signal

```javascript
// STEP 1: Track restart state BEFORE restart
// Location: Line 125
let restartInProgress = false;

// STEP 2: When expanding bloom filter (line 203-204)
if (newAddresses.length) {
  restartInProgress = true;  // ← SET FLAG BEFORE RESTART
  this.cancelStream(stream);
  // ... initiate new stream creation ...
  subscribeWithRetries(...).then((newStream) => {
    this.historicalSyncStream = newStream;
    restartInProgress = false;  // ← CLEAR FLAG WHEN COMPLETE
  }).catch(...);
}

// STEP 3: Modified endHandler (lines 250-274)
const endHandler = () => {
  // CRITICAL FIX: Check TWO conditions before emitting completion:

  // Condition 1: This stream is still active (not superseded)
  if (this.historicalSyncStream !== stream) {
    return;  // ← Stream was replaced, don't signal completion
  }

  // Condition 2: No restart operation pending
  if (restartInProgress) {
    return;  // ← Restart pending, don't signal completion yet
  }

  // Only emit when BOTH conditions are true
  this.emit(EVENTS.HISTORICAL_DATA_OBTAINED);
};
```

#### Why This Works

1. **restartInProgress flag** - Set BEFORE any restart operation begins
2. **historicalSyncStream reference** - Always points to the currently active stream
3. **Dual validation** - Only old streams that are superseded AND have restarts pending are suppressed
4. **Result** - Only the final, active stream (with no pending operations) emits completion

### 5.3 Integration with LatestSpendableUTXO

The bloom filter fix directly enables the latestSpendableUTXO algorithm:

**Algorithm Requirement:** Complete UTXO discovery
**Dependency:** All addresses must be synced including those discovered during sync

**The Chain:**
```
1. TransactionSyncer starts with initial addresses
2. During sync, new addresses discovered → bloom filter expanded
3. Stream MUST be restarted to include new addresses
4. [BUG WITHOUT FIX] Old stream ends → incomplete sync signal
5. [WITH FIX] Old stream ends → but not completed (flag prevents it)
6. New stream starts → completes sync → only then signals completion
7. latestSpendableUTXO receives complete UTXO list
8. Algorithm sorts by blockHeight → blockTime → satoshis
9. Selects most recent UTXO → SUCCESS
```

### 5.4 Sorting Key Correctness (Complementary Fix)

**File:** `packages/wallet-lib/src/utils/coinSelections/strategies/latestSpendableUTXO.js`

**Problem:** Using blockTime as primary sort key
- ❌ blockTime can be manipulated (miners can set timestamps)
- ❌ Timestamps within a block are not ordered
- ❌ "Latest" becomes ambiguous (by time? by actual blockchain position?)

**Solution:** Use blockHeight as primary sort key
```javascript
// Lines 59-73: Correct sorting order
const chronologicallySortedUTXOs = spendableUTXOs.sort((a, b) => {
  // PRIMARY: Block height descending (immutable blockchain order)
  if (a.blockHeight !== b.blockHeight) {
    return b.blockHeight - a.blockHeight;  // Higher block = later = newer
  }
  // SECONDARY: Block time descending (for UTXOs in same block)
  if (a.blockTime !== b.blockTime) {
    return b.blockTime - a.blockTime;      // Fallback to timestamp
  }
  // TERTIARY: Value descending (prefer larger amounts)
  return b.satoshis - a.satoshis;
});
```

**Why blockHeight is authoritative:**
- ✅ Immutable - part of blockchain consensus
- ✅ Unique - each block has unique height
- ✅ Ordered - strictly increasing with time
- ✅ Canonical - this is what "latest" means in blockchain terms

---

## 6. Configuration

### 5.1 .env File Format

```bash
# ============================================
# DASH UTXO FINDER CONFIGURATION
# ============================================

# Network selection
NETWORK=testnet                           # or 'mainnet'

# ============================================
# ADDRESS SOURCE: Choose ONE of the following
# ============================================

# Option 1: Derive from mnemonic (full control)
MNEMONIC="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
ACCOUNT_INDEX=0
EXTERNAL_ADDRESS_COUNT=20
INTERNAL_ADDRESS_COUNT=20

# Option 2: Pre-derived address list (paste comma-separated)
# ADDRESSES=yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj,yAnother...,yMore...

# Option 3: Extended public key (watch-only)
# HDPUBLIC_KEY=tpub6D4BDPcP2GT577Vv...

# ============================================
# SYNCHRONIZATION PARAMETERS
# ============================================

# Starting block height for sync
FROM_HEIGHT=1330000

# (Optional) Ending block height, default is current height
# TO_HEIGHT=1331000

# Minimum UTXO amount in satoshis (0.002 DASH = 200000 satoshis)
REQUIRED_AMOUNT=200000

# ============================================
# STORAGE & PERSISTENCE
# ============================================

# Enable caching of discovered UTXOs
ENABLE_STORAGE=false                     # true to cache, false for stateless

# Storage type (only if ENABLE_STORAGE=true)
# STORAGE_TYPE=memory|indexeddb|localstorage|custom

# ============================================
# NETWORK & CONNECTIVITY
# ============================================

# DAPI server (if using custom DAPI instead of mainnet/testnet)
# DAPI_SERVER=localhost:2443

# Connection timeout in milliseconds
DAPI_TIMEOUT=30000

# Maximum DAPI connection retries
DAPI_MAX_RETRIES=3

# ============================================
# LOGGING & DEBUG
# ============================================

# Log level: 'error', 'warn', 'info', 'debug'
LOG_LEVEL=info

# Enable detailed event logging
LOG_EVENTS=false

# ============================================
# INTERNAL PARAMETERS (usually don't change)
# ============================================

# Number of blocks to scan per batch
BATCH_SIZE=100

# Timeout for individual sync operations in milliseconds
SYNC_TIMEOUT=300000

# Checkpoint save frequency (every N transactions)
CHECKPOINT_FREQUENCY=100
```

### 5.2 Runtime Configuration

```typescript
// Override .env settings at runtime
const finder = new UTXOFinder(dapiClient, 'testnet', {
  // Network (if different from .env)
  network: 'mainnet',

  // Storage backend (pluggable)
  storageAdapter: new IndexedDBStorage(),

  // Custom logger
  logger: customLogger,

  // Timeout overrides
  timeout: 60000
});

// Or configure per operation
const result = await finder.findLatestUTXOFromMnemonic(mnemonic, {
  accountIndex: 1,        // Override default
  externalCount: 30,      // Derive more addresses
  fromHeight: 1000000,
  requiredAmount: 500000,
  onProgress: (progress) => {
    console.log(`${progress.progress.toFixed(1)}%`);
  }
});
```

---

## 6. Error Handling & Fault Tolerance

### 6.1 Error Taxonomy

#### Network Errors (Recoverable)

```typescript
// Sync interrupted - can resume from checkpoint
{
  code: 'SYNC_INTERRUPTED',
  message: 'Connection lost during sync',
  recoverable: true,
  suggestedAction: 'Call resumeSync() with checkpoint'
}

// Timeout during sync - can retry or resume
{
  code: 'DAPI_TIMEOUT',
  message: 'DAPI request exceeded 30000ms',
  recoverable: true,
  suggestedAction: 'Retry or use resumeSync()'
}

// DAPI unavailable - retry with backoff
{
  code: 'DAPI_UNAVAILABLE',
  message: 'All DAPI servers unreachable',
  recoverable: true,
  suggestedAction: 'Retry after delay or check network'
}

// Partial sync failure - some blocks failed
{
  code: 'PARTIAL_SYNC_FAILURE',
  message: 'Failed to sync blocks 1000100-1000110',
  recoverable: true,
  suggestedAction: 'Resume sync or skip failed range'
}
```

#### Blockchain Errors (Recoverable)

```typescript
// Block reorg detected - resync affected range
{
  code: 'BLOCKCHAIN_REORG',
  message: 'Reorg at height 1000050, depth 3 blocks',
  recoverable: true,
  suggestedAction: 'Clear UTXOs after 1000050, resync'
}

// Invalid header sequence - stop and report
{
  code: 'CHAIN_CONTINUITY_BROKEN',
  message: 'Block hash mismatch at height 1000050',
  recoverable: true,
  suggestedAction: 'Resync from earlier height'
}

// Insufficient confirmations (unconfirmed tx)
{
  code: 'UTXO_UNCONFIRMED',
  message: 'UTXO at height 0 - not yet confirmed',
  recoverable: true,
  suggestedAction: 'Wait for confirmation or use ChainLock/InstantLock'
}
```

#### Input Validation Errors (Non-recoverable)

```typescript
// Invalid mnemonic format
{
  code: 'INVALID_MNEMONIC',
  message: 'Mnemonic must be 12 or 24 words',
  recoverable: false
}

// Invalid address format
{
  code: 'INVALID_ADDRESS',
  message: 'Address yXXX... is not a valid Dash testnet address',
  recoverable: false
}

// Invalid height range
{
  code: 'INVALID_HEIGHT_RANGE',
  message: 'fromHeight (1000000) > toHeight (500000)',
  recoverable: false
}

// No spendable UTXOs found
{
  code: 'NO_SPENDABLE_UTXOS',
  message: 'No UTXOs found for addresses in height range',
  recoverable: true,  // Try different height range
  suggestedAction: 'Expand height range or check address'
}

// Insufficient funds
{
  code: 'INSUFFICIENT_FUNDS',
  message: 'Total UTXOs 100000 sats < required 200000 sats',
  recoverable: true,  // User can wait for more funds
  suggestedAction: 'Wait for incoming payments or check address'
}
```

### 6.2 Fault Tolerance Strategies

#### Strategy: Sync Interruption Recovery

**Scenario:** Sync at block 1000500/1001000 when connection drops

**Implementation:**
```typescript
// Sync was interrupted
try {
  const result = await finder.findLatestSpendableUTXO(addresses, {
    fromHeight: 1000000,
    toHeight: 1001000
  });
} catch (error) {
  if (error.code === 'SYNC_INTERRUPTED') {
    // Get checkpoint from storage or event listener
    const checkpoint = syncCheckpoint;  // Saved during 'progress' events

    // Resume from where we left off
    const result = await syncer.resumeSync(checkpoint);
    console.log(`Resumed: ${result.blocksSynced} more blocks synced`);
  }
}

// Checkpoint structure
interface SyncCheckpoint {
  lastBlockHeight: number  // 1000500
  lastBlockHash: string
  transactionIds: string[] // Deduplication
  timestamp: number
}
```

#### Strategy: Blockchain Reorg Handling

**Scenario:** Blockchain reorg at height 1000050, depth 3

**Implementation:**
```typescript
finder.on('error', async (error) => {
  if (error.code === 'BLOCKCHAIN_REORG') {
    const affectedHeight = error.affectedHeight;  // 1000050
    const reorgDepth = error.reorgDepth;          // 3

    // Clear UTXOs after reorg point
    await storage.clear('testnet');  // Or selectively

    // Resync from height before reorg
    const resyncHeight = affectedHeight - (reorgDepth + 1);
    const result = await finder.findLatestSpendableUTXO(addresses, {
      fromHeight: resyncHeight
    });

    console.log(`Recovered from reorg: ${result.satoshis} sats available`);
  }
});
```

#### Strategy: Timeout Recovery

**Scenario:** Single DAPI request times out

**Implementation:**
```typescript
async function findUTXOWithRetry(finder, addresses, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await finder.findLatestSpendableUTXO(addresses, options);
    } catch (error) {
      if (error.code === 'DAPI_TIMEOUT' && attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`Timeout - retrying in ${backoffMs}ms`);
        await new Promise(r => setTimeout(r, backoffMs));
      } else {
        throw error;
      }
    }
  }
}
```

#### Strategy: Partial Sync Failure

**Scenario:** Sync fails on blocks 1000100-1000110

**Implementation:**
```typescript
finder.on('error', async (error) => {
  if (error.code === 'PARTIAL_SYNC_FAILURE') {
    // Option 1: Skip failed range and continue
    const failedRange = error.failedRange;  // [1000100, 1000110]

    const result = await finder.findLatestSpendableUTXO(addresses, {
      fromHeight: 1000000,
      toHeight: failedRange.from - 1  // Skip failed part
    });

    console.log(`Found UTXOs: ${result.satoshis} sats`);

    // Option 2: Resync failed range after delay
    setTimeout(async () => {
      const retryResult = await finder.findLatestSpendableUTXO(addresses, {
        fromHeight: failedRange.from,
        toHeight: failedRange.to
      });
      console.log(`Recovered from failed range: ${retryResult.satoshis} sats`);
    }, 5000);
  }
});
```

### 6.3 User-Facing Error Messages

```typescript
// Map internal errors to user-friendly messages
const userMessages = {
  'INVALID_MNEMONIC': {
    title: 'Invalid Wallet Words',
    message: 'Your 12 or 24 wallet words are not in the correct format',
    action: 'Please check your input and try again'
  },
  'INSUFFICIENT_FUNDS': {
    title: 'Insufficient Balance',
    message: `Your wallet doesn't have enough DASH for this operation`,
    action: 'Receive more DASH at: <address>'
  },
  'DAPI_UNAVAILABLE': {
    title: 'Network Unavailable',
    message: 'Cannot connect to Dash network',
    action: 'Check your internet connection and retry'
  },
  'NO_SPENDABLE_UTXOS': {
    title: 'No Transactions Found',
    message: 'Your wallet address has no spendable transactions',
    action: 'Send DASH to your address: <address>'
  }
};

// Usage in UI
try {
  const utxo = await finder.findLatestSpendableUTXO(addresses, options);
} catch (error) {
  const msg = userMessages[error.code] || {
    title: 'Unknown Error',
    message: error.message,
    action: 'Try again or contact support'
  };
  showErrorModal(msg);
}
```

---

## 7. Complete Usage Examples

### 7.1 Simple UTXO Finding from Mnemonic

```typescript
import { UTXOFinder } from '@dashevo/dash-utxo-finder';
import DAPIClient from '@dashevo/dapi-client';

async function findUTXO() {
  // 1. Initialize DAPI client
  const dapiClient = new DAPIClient({ network: 'testnet' });

  // 2. Create finder
  const finder = new UTXOFinder(dapiClient, 'testnet');

  // 3. Monitor progress
  finder.on('progress', (event) => {
    console.log(`Progress: ${event.progress.toFixed(1)}%`);
  });

  // 4. Find latest UTXO from mnemonic
  const result = await finder.findLatestUTXOFromMnemonic(
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    {
      accountIndex: 0,
      externalCount: 20,
      internalCount: 20,
      fromHeight: 1330000,
      requiredAmount: 200000  // 0.002 DASH
    }
  );

  console.log('Latest UTXO:', result.latestUTXO);
  console.log('Address:', result.addressData.address);
  console.log('Private Key:', result.addressData.privateKey);

  return result;
}

findUTXO().catch(console.error);
```

### 7.2 Watch-Only Wallet from xpub

```typescript
import { UTXOFinder, AddressDerivation } from '@dashevo/dash-utxo-finder';

async function monitorWatchOnlyWallet() {
  const dapiClient = new DAPIClient({ network: 'testnet' });
  const finder = new UTXOFinder(dapiClient, 'testnet');

  // 1. Get xpub from mnemonic
  const xpub = AddressDerivation.getHDPublicKeyFromMnemonic(
    'abandon abandon ...',  // Your seed
    'testnet',
    0
  );

  // 2. Share xpub with watch-only app (NO private keys!)
  console.log('Share with watch-only app:', xpub);

  // 3. In watch-only app: Derive addresses from xpub
  const { external, internal } = AddressDerivation.fromHDPublicKey(
    xpub,
    'testnet',
    { externalCount: 10, internalCount: 10 }
  );

  const addresses = [
    ...external.map(a => a.address),
    ...internal.map(a => a.address)
  ];

  // 4. Find UTXOs (without access to private keys)
  const utxos = await finder.findAllUTXOs(addresses, {
    fromHeight: 1330000
  });

  console.log(`Found ${utxos.length} UTXOs`);
  utxos.forEach(u => {
    console.log(`  ${u.satoshis} sats at height ${u.blockHeight}`);
  });
}

monitorWatchOnlyWallet().catch(console.error);
```

### 7.3 End-to-End Identity Creation Workflow

```typescript
import { UTXOFinder } from '@dashevo/dash-utxo-finder';
import { EvoSDK } from '@dashevo/evo-sdk';

async function createIdentityWorkflow() {
  const dapiClient = new DAPIClient({ network: 'testnet' });
  const finder = new UTXOFinder(dapiClient, 'testnet');
  const sdk = new EvoSDK({ network: 'testnet' });

  // 1. Derive addresses from mnemonic
  const result = await finder.findLatestUTXOFromMnemonic(
    'abandon abandon ...',
    { fromHeight: 1330000, requiredAmount: 200000 }
  );

  console.log('Found UTXO:', result.latestUTXO);
  console.log('Change address:', result.internalAddresses[0].address);

  // 2. Build identity creation transaction
  const transactionBuilder = new TransactionBuilder();
  const tx = transactionBuilder
    .from(result.latestUTXO)
    .to(identityAddress, 200000)                           // Identity funding
    .change(result.internalAddresses[0].address)           // Change back
    .sign(result.addressData.privateKey);

  // 3. Broadcast transaction
  await dapiClient.core.broadcastTransaction(tx.serialize());
  console.log('Transaction broadcasted:', tx.id);

  // 4. Wait for InstantLock or confirmation
  const lock = await waitForInstantLock(tx.id);

  // 5. Create identity in Platform
  const identity = await sdk.identities.createWithWallet({
    transaction: tx,
    proof: lock  // InstantLock proof
  });

  console.log('Identity created:', identity.id);
  return identity;
}

createIdentityWorkflow().catch(console.error);
```

### 7.4 Hybrid Configuration (Mnemonic + Pre-derived)

```typescript
async function hybridAddresConfiguration() {
  // Some addresses from mnemonic, some pre-generated
  const externalAddresses = [
    // From mnemonic derivation
    'yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj',
    'yAnother...',
    'yMore...',

    // Plus some pre-generated elsewhere
    'yWalletAddress...',
    'yHardwareWalletAddress...'
  ];

  const finder = new UTXOFinder(dapiClient, 'testnet');

  // Find UTXOs across all addresses
  const utxos = await finder.findAllUTXOs(externalAddresses, {
    fromHeight: 1330000
  });

  console.log(`Found ${utxos.length} UTXOs across ${externalAddresses.length} addresses`);
}
```

### 7.5 Custom Storage Backend

```typescript
// Example: IndexedDB storage for browser
class IndexedDBStorage {
  async saveUTXOs(network, address, utxos) {
    const db = await this.openDB();
    const tx = db.transaction(['utxos'], 'readwrite');
    const store = tx.objectStore('utxos');
    await store.put({ network, address, utxos, timestamp: Date.now() });
  }

  async getUTXOs(network, address) {
    const db = await this.openDB();
    const result = await db.get('utxos', [network, address]);
    return result ? result.utxos : [];
  }

  // ... more methods
}

// Use custom storage
const storage = new IndexedDBStorage();
const finder = new UTXOFinder(dapiClient, 'testnet', {
  storageAdapter: storage
});
```

### 7.6 Error Handling & Recovery

```typescript
async function robustUTXOFinding() {
  const finder = new UTXOFinder(dapiClient, 'testnet');

  finder.on('error', async (error) => {
    console.error('Error code:', error.code);

    if (error.recoverable) {
      console.log('Suggested action:', error.suggestedAction);

      if (error.code === 'DAPI_TIMEOUT') {
        // Retry with exponential backoff
        await new Promise(r => setTimeout(r, 2000));
        retry();
      } else if (error.code === 'BLOCKCHAIN_REORG') {
        // Clear cache and resync from before reorg
        await storage.clear('testnet');
        retry();
      }
    }
  });

  try {
    return await finder.findLatestSpendableUTXO(addresses, {
      fromHeight: 1330000
    });
  } catch (error) {
    console.error('Unrecoverable error:', error.message);
  }
}
```

---

## 8. Architecture Diagrams

### 8.1 Component Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                     UTXOFinder (Public API)                │
│  findLatestUTXO | findAllUTXOs | findUTXOsForAmount        │
└──────────────────────────┬─────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌─────────────────┐
│ Address      │  │ Transaction  │  │ UTXO            │
│ Derivation   │  │ Syncer       │  │ Selector        │
│              │  │              │  │ & Extractor     │
├──────────────┤  ├──────────────┤  ├─────────────────┤
│ BIP44        │  │ DAPI Stream  │  │ Sort by height  │
│ Key Gen      │  │ Bloom Filter │  │ Filter spendable│
│ Watch-only   │  │ Progress     │  │ Custom strategy │
└──────┬───────┘  └──────┬───────┘  └────────┬────────┘
       │                 │                  │
       │                 ▼                  │
       │         ┌──────────────────┐       │
       │         │ Block Validator  │       │
       │         │ & Metadata       │       │
       │         │ Enricher         │       │
       │         └────────┬─────────┘       │
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
                 ┌────────▼────────┐
                 │ UTXO Objects    │
                 │ with Metadata   │
                 └────────┬────────┘
                          │
                 ┌────────▼────────────┐
                 │ Storage Adapter     │
                 │ (Optional/Pluggable)│
                 └─────────────────────┘
```

### 8.2 Data Flow Sequence Diagram

```
Application          UTXOFinder       AddressDerivation    TransactionSyncer
    │                    │                   │                    │
    │ findLatestUTXO()    │                   │                    │
    ├───────────────────►│                   │                    │
    │                    │ deriveAddresses() │                    │
    │                    ├──────────────────►│                    │
    │                    │                   │ return addresses   │
    │                    │◄──────────────────┤                    │
    │                    │ startSync()       │                    │
    │                    ├─────────────────────────────────────►│
    │                    │                   │   streaming...     │
    │                    │◄─────────────────────────────────────┤
    │                    │ (progress event)  │                    │
    │◄───────────────────┤                   │                    │
    │ showProgress()     │                   │                    │
    │                    │                   │   (more blocks)    │
    │                    │◄─────────────────────────────────────┤
    │ (update UI)        │ (found event)     │                    │
    │                    ├──────────────┐    │                    │
    │                    │ selectUTXO() │    │                    │
    │                    └──────────────┤    │                    │
    │                    │ return UTXO  │    │                    │
    │◄────────────────────────────────┤     │                    │
    │ (use UTXO)         │            │     │                    │

Application creates transaction → broadcasts → watches for confirmation
```

---

## 9. Integration Points

### 9.1 Integration with js-evo-sdk

```typescript
// js-evo-sdk uses dash-utxo-finder for identity creation
import { UTXOFinder } from '@dashevo/dash-utxo-finder';
import { EvoSDK } from '@dashevo/evo-sdk';

const finder = new UTXOFinder(dapiClient, 'testnet');
const sdk = new EvoSDK({ network: 'testnet' });

// Find UTXO
const { latestUTXO, addressData } = await finder.findLatestUTXOFromMnemonic(
  mnemonic,
  { fromHeight: 1330000 }
);

// Use in identity creation
const identity = await sdk.identities.createWithWallet({
  mnemonic,  // Or use latestUTXO + addressData
  amount: 200000
});
```

### 9.2 Integration with Transaction Building

```typescript
// Use selected UTXO in transaction
const txBuilder = new TransactionBuilder();
const tx = txBuilder
  .from(latestUTXO)            // From finder
  .to(targetAddress, amount)
  .change(changeAddress)        // From finder
  .sign(privateKey);            // From finder

await broadcastTransaction(tx);
```

### 9.3 Integration with Web Applications

```html
<!-- Browser app using dash-utxo-finder -->
<script src="dash-utxo-finder.js"></script>

<script>
  const finder = new UTXOFinder(dapiClient, 'testnet');

  async function onCreateIdentity() {
    finder.on('progress', (e) => {
      document.querySelector('.progress').value = e.progress;
    });

    try {
      const result = await finder.findLatestUTXOFromMnemonic(
        mnemonicInput.value,
        { fromHeight: startHeightInput.value }
      );

      showSuccess(`Found UTXO: ${result.latestUTXO.satoshis} sats`);
    } catch (error) {
      showError(error.message);
    }
  }
</script>
```

---

## 10. Testing Strategy

### 10.1 Unit Testing

**Files:** `tests/unit/`

```typescript
// Test AddressDerivation
describe('AddressDerivation', () => {
  it('should derive correct BIP44 paths', () => {
    const addr = AddressDerivation.deriveAddress(
      mnemonic,
      'testnet',
      0, 0, false
    );
    expect(addr.path).toBe("m/44'/1'/0'/0/0");
  });
});

// Test LatestUTXOSelector
describe('LatestUTXOSelector', () => {
  it('should select most recent UTXO', () => {
    const utxos = [
      { blockHeight: 1000, satoshis: 50000 },
      { blockHeight: 1001, satoshis: 30000 },
      { blockHeight: 999, satoshis: 100000 }
    ];
    const selected = LatestUTXOSelector.select(utxos);
    expect(selected.blockHeight).toBe(1001);
  });
});
```

### 10.2 Integration Testing

**Files:** `tests/integration/`

```typescript
// Test with mock DAPI
describe('UTXOFinder Integration', () => {
  it('should find UTXOs from mnemonic', async () => {
    const finder = new UTXOFinder(mockDapiClient, 'testnet');

    const result = await finder.findLatestUTXOFromMnemonic(testMnemonic, {
      fromHeight: 1330000,
      requiredAmount: 200000
    });

    expect(result.latestUTXO).toBeDefined();
    expect(result.latestUTXO.satoshis).toBeGreaterThanOrEqual(200000);
  });
});
```

### 10.3 Regtest E2E Testing

**Files:** `tests/e2e/`

```typescript
// Full end-to-end testing with real local Dashmate
describe('End-to-End UTXO Finding', () => {
  it('should find real UTXOs on regtest', async () => {
    // Setup: Generate test transaction
    await regtestHelper.sendTransaction(testAddress, 0.05);

    // Test: Find UTXO
    const finder = new UTXOFinder(dapiClient, 'regtest');
    const result = await finder.findLatestSpendableUTXO([testAddress], {
      fromHeight: 1
    });

    expect(result.satoshis).toBeGreaterThan(0);
    expect(result.address).toBe(testAddress);
  });
});
```

### 10.4 Fault Injection Testing

**Files:** `tests/fault-injection/`

```typescript
// Test error recovery
describe('Error Recovery', () => {
  it('should recover from DAPI timeout', async () => {
    const mockDapi = new MockDAPIClient({
      shouldTimeout: true,
      timeoutAfterBlocks: 50
    });

    const finder = new UTXOFinder(mockDapi, 'testnet');

    // Should emit error event
    let errorCaught = false;
    finder.on('error', (e) => {
      errorCaught = true;
      expect(e.code).toBe('DAPI_TIMEOUT');
    });

    // Should eventually recover
    const result = await finder.findLatestSpendableUTXO(addresses, {
      fromHeight: 1330000
    });

    expect(errorCaught).toBe(true);
    expect(result).toBeDefined();
  });
});
```

### 10.5 RPC Verification Testing

**Purpose:** Verify UTXO finder results match Dash Core RPC (ground truth validation).

#### Setup

```bash
# Ensure dashd/dash-qt running with RPC enabled
# For testnet, ensure using port 19998 with platformcli wallet

# Test address with known UTXOs
ADDRESS="yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy"
```

#### Verification Steps

**1. Get UTXOs via RPC (Ground Truth):**

```bash
# Using dash-cli (if available)
dash-cli -testnet -rpcwallet=platformcli listunspent 1 9999999 "[\"$ADDRESS\"]"

# Using curl (HTTP RPC)
curl -u dash:dash \
  -d '{"jsonrpc":"2.0","id":"test","method":"listunspent","params":[1,9999999,["'$ADDRESS'"]]}' \
  -H "Content-Type: application/json" \
  http://localhost:19998/wallet/platformcli
```

**2. Get UTXOs via UTXO Finder:**

```typescript
const utxos = await utxoFinder.findAllUTXOs([address], {
  fromHeight: 1353325
});

console.log('Finder results:', JSON.stringify(utxos, null, 2));
```

**3. Compare Results:**

```javascript
// scripts/verify-against-rpc.js
const rpcUtxos = [/* from RPC call */];
const finderUtxos = [/* from UTXO finder */];

// Check counts match
assert.equal(finderUtxos.length, rpcUtxos.length,
  `UTXO count mismatch: RPC has ${rpcUtxos.length}, Finder has ${finderUtxos.length}`);

// Check each UTXO
finderUtxos.forEach(fu => {
  const match = rpcUtxos.find(ru =>
    ru.txid === fu.txId && ru.vout === fu.vout
  );

  assert(match, `UTXO not found in RPC: ${fu.txId}:${fu.vout}`);

  // Verify amounts (RPC uses DASH, multiply by 1e8 for satoshis)
  const rpcSatoshis = Math.floor(match.amount * 1e8);
  assert.equal(fu.satoshis, rpcSatoshis,
    `Amount mismatch for ${fu.txId}:${fu.vout}`);

  assert.equal(fu.address, match.address, 'Address mismatch');
});

console.log('✓ All UTXOs verified against RPC');
```

#### Common Discrepancies and Causes

| Discrepancy | Cause | Solution |
|-------------|-------|----------|
| More UTXOs in RPC | Unconfirmed txs (RPC minconf=0) | Increase minconf or wait |
| More UTXOs in Finder | Change addresses not in wallet | Normal - finder scans all derived |
| Amount mismatch | Satoshi conversion | RPC in DASH, multiply by 1e8 |
| Missing UTXOs | Wrong address derivation | Verify derivation path |
| Different block heights | Re-org or sync delay | Verify both at same chain tip |

#### Example Verification Script

See `packages/dash-utxo-finder/scripts/check-address-via-rpc.js` for complete implementation:

```javascript
// Verify specific UTXO matches RPC
async function verifyUTXO(utxo) {
  const rpcTx = await rpcCall('getrawtransaction', [utxo.txId, true], true);

  console.log('Verification:', {
    txid: utxo.txId === rpcTx.txid ? '✅' : '❌',
    blockHeight: utxo.blockHeight === rpcTx.height ? '✅' : '❌',
    blockHash: utxo.blockHash === rpcTx.blockhash ? '✅' : '❌',
  });
}
```

---

## 11. Implementation Checklist

### Phase 1: Core Components

- [ ] `AddressDerivation` - BIP44 derivation, key generation
- [ ] `BloomFilterBuilder` - SPV filter creation
- [ ] `UTXOExtractor` - Transaction parsing
- [ ] `LatestUTXOSelector` - Selection algorithm
- [ ] `BlockValidator` - Header validation

### Phase 2: Synchronization

- [ ] `TransactionSyncer` - DAPI streaming
- [ ] `MetadataEnricher` - Lock status extraction
- [ ] `StorageAdapter` interface - Pluggable storage
- [ ] `InMemoryStorage` - Default implementation
- [ ] Sync checkpoint management

### Phase 3: Orchestration

- [ ] `UTXOFinder` - Main API class
- [ ] Event emission system
- [ ] Error handling & recovery
- [ ] Timeout management

### Phase 4: Integration

- [ ] js-evo-sdk integration
- [ ] Test suite (unit + integration + E2E)
- [ ] Documentation & examples
- [ ] Browser compatibility

### Phase 5: Polish

- [ ] Performance benchmarking
- [ ] Security audit
- [ ] Test coverage >90%
- [ ] Production release

---

## 12. Performance Considerations

### 12.1 Optimization Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Address derivation (100 addrs) | <100ms | Batch generation |
| Bloom filter creation | <50ms | Size-based optimization |
| Sync 1000 blocks | <30s | Parallel header validation |
| UTXO selection (1000 UTXOs) | <10ms | In-memory sorting |
| Single API call | <5s | DAPI timeout |

### 12.2 Optimization Strategies

1. **Bloom Filter Sizing** - Accurate size based on address count
2. **Parallel Validation** - Validate multiple headers concurrently
3. **Streaming Processing** - Handle transactions as they arrive
4. **Memory Efficiency** - Don't load all blocks into memory
5. **Cache Strategy** - Optional caching for repeated queries

---

## 13. Security Considerations

### 13.1 Private Key Handling

- ✅ Private keys only accessible in full-control mode (with mnemonic)
- ✅ Watch-only mode (xpub) explicitly excludes private keys
- ✅ No storage of private keys unless explicitly requested
- ✅ Memory cleanup after use (developer responsibility)

### 13.2 Address Privacy

- ✅ Bloom filters minimize address exposure to DAPI servers
- ✅ Optional: Batching address queries to reduce linkability
- ✅ Watch-only mode supports privacy-preserving monitoring

### 13.3 Network Security

- ✅ HTTPS/TLS for all DAPI connections
- ✅ Server rotation and failover built-in
- ✅ Timeout protection against hanging connections
- ✅ No data logging by default (silent operation)

---

## 14. Known Limitations

1. **Single-signature only** - No multi-sig support (future enhancement)
2. **No hardware wallet integration** - Developers must implement wrapper
3. **No market data** - Fee estimation is basic (network-based only)
4. **No transaction history** - Finder returns current state only
5. **No coin mixing** - Privacy is minimal (for users needing more, use other tools)

---

## 15. Future Enhancements

1. **Hardware Wallet Support** - Integration with Ledger, Trezor
2. **Multi-Sig Addresses** - Support for M-of-N wallets
3. **Advanced Fee Estimation** - Market-based fee prediction
4. **Transaction History** - Query past transactions
5. **Coin Mixing** - Privacy-preserving UTXO management
6. **Hierarchical Deterministic Accounts** - Account-level organization
7. **BIP47 Reusable Payment Codes** - Better address privacy

---

## References

### Related Documentation

- **Dash Platform Docs:** https://docs.dash.org/
- **BIP44 Specification:** https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki
- **BIP39 Specification:** https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
- **DAPI Protocol:** https://docs.dash.org/developers/dash-sdk/wallet-lib/
- **InstantSend:** https://docs.dash.org/developers/platform/explanation/consensus/#instantsend
- **ChainLock:** https://docs.dash.org/developers/platform/explanation/consensus/#chainlock

### Implementation References

- **js-evo-sdk:** `/packages/js-evo-sdk/` - Primary integration point
- **wallet-lib:** `@dashevo/wallet-lib` - HD wallet reference
- **WASM SDK:** `@dashevo/wasm-sdk` - Platform operations
- **dashcore-lib:** `@dashevo/dashcore-lib` - Transaction serialization

---

## Appendix A: Type Definitions

```typescript
// Core types referenced throughout

interface UTXO {
  txId: string
  vout: number
  satoshis: number
  script: string
  address: string
  blockHeight: number
  blockTime: number
  blockHash: string | null
  isChainLocked: boolean
  isInstantLocked: boolean
}

interface DerivedAddress {
  index: number
  address: string
  path: string
  privateKey?: any
}

interface ProgressEvent {
  progress: number              // 0-100
  syncedBlocks: number
  totalBlocks: number
  currentHeight: number
  estimatedTimeRemaining?: number
}

interface SyncCheckpoint {
  lastBlockHeight: number
  lastBlockHash: string
  transactionIds: string[]
  timestamp: number
}

interface ValidationError {
  code: string
  message: string
  height?: number
  blockHash?: string
}

interface BlockState {
  height: number
  hash: string
  previousHash: string
}
```

---

## Appendix B: Bloom Filter Race Condition Fix - Complete Implementation Guide

### B.1 Broken Implementation (What NOT to do)

**Location:** Upstream wallet-lib code (v2.1-dev) before fix

```javascript
// ❌ BROKEN: Unconditional completion signal
const endHandler = () => {
  this.logger.debug('[TransactionsReader] Historical data updated');
  this.emit(EVENTS.HISTORICAL_DATA_OBTAINED);  // ← Fired during stream restart!
};

// Stream restart happens here (lines 203-210)
if (newAddresses.length) {
  this.cancelStream(stream);  // ← Triggers end event immediately
  // ... async new stream creation ...
}

// PROBLEM:
// 1. cancelStream() fires stream.on('end') event
// 2. endHandler() runs before new stream is ready
// 3. HISTORICAL_DATA_OBTAINED emitted prematurely
// 4. Wallet thinks sync is complete
// 5. New stream starts but wallet ignores it
```

### B.2 Fixed Implementation (What TO do)

**Location:** Current branch (fix/instant-lock-timing-and-wasm-isolation)
**File:** `packages/wallet-lib/src/plugins/Workers/TransactionsSyncWorker/TransactionsReader.js`

```javascript
// ✅ CORRECT: Track restart state and check conditions

// Line 125: Track restart state
let restartInProgress = false;

// Lines 203-231: Restart with proper flag management
if (newAddresses.length) {
  restartInProgress = true;  // ← SET BEFORE RESTART
  this.cancelStream(stream);
  this.historicalSyncStream = null;

  restartArgs = {
    fromBlockHeight: merkleBlockHeight + 1,
    count: remainingCount,
    addresses: [...addresses, ...newAddresses],
  };

  subscribeWithRetries(
    restartArgs.fromBlockHeight,
    restartArgs.count,
    restartArgs.addresses,
  ).then((newStream) => {
    this.historicalSyncStream = newStream;
    restartInProgress = false;  // ← CLEAR WHEN NEW STREAM READY
  }).catch((e) => {
    restartInProgress = false;
    this.emit(EVENTS.ERROR, e);
  });
}

// Lines 250-274: Guarded completion signal
const endHandler = () => {
  // CONDITION 1: This stream is still the active one
  if (this.historicalSyncStream !== stream) {
    return;  // ← Stream was replaced, don't emit
  }

  // CONDITION 2: No restart operation in progress
  if (restartInProgress) {
    return;  // ← Restart pending, don't emit
  }

  // ONLY EMIT when both conditions are true
  this.logger.debug('[TransactionsReader] Historical data obtained - sync complete');
  this.emit(EVENTS.HISTORICAL_DATA_OBTAINED);
};
```

### B.3 Implementation Checklist for Developers

**Before implementing TransactionSyncer, verify:**

- [ ] **Restart tracking flag exists** - `let restartInProgress = false;`
- [ ] **Flag set BEFORE canceling stream** - Flag set before `cancelStream()`
- [ ] **Flag cleared AFTER new stream ready** - Flag cleared in `.then()` AND `.catch()`
- [ ] **endHandler checks stream reference** - `if (this.historicalSyncStream !== stream) return;`
- [ ] **endHandler checks restart flag** - `if (restartInProgress) return;`
- [ ] **historicalSyncStream kept in sync** - Updated when new stream ready
- [ ] **No other code emits HISTORICAL_DATA_OBTAINED** - Only from final endHandler
- [ ] **Error paths clear the flag** - Always reset flag in `.catch()` blocks

**Validation:**
```javascript
// Verify the fix is in place:
if (!restartInProgress) {
  throw new Error('Missing restartInProgress flag');
}
if (endHandler.toString().indexOf('historicalSyncStream !== stream') === -1) {
  throw new Error('Missing stream reference check');
}
if (endHandler.toString().indexOf('restartInProgress') === -1) {
  throw new Error('Missing restart flag check in endHandler');
}
```

### B.4 Testing Requirements for Stream Restart

**Unit Test: Verify race condition is fixed**

```javascript
describe('Stream Restart Race Condition Fix', () => {
  it('should NOT emit HISTORICAL_DATA_OBTAINED during stream restart', async () => {
    const syncer = new TransactionSyncer(mockDapiClient, 'testnet');

    // Track events
    const events = [];
    syncer.on(EVENTS.HISTORICAL_DATA_OBTAINED, () => {
      events.push('HISTORICAL_DATA_OBTAINED');
    });
    syncer.on(EVENTS.NEW_TRANSACTIONS, (tx) => {
      events.push('TRANSACTION');
    });

    // Start sync
    const promise = syncer.startSync({
      addresses: ['yAddr1'],
      fromHeight: 1000000
    });

    // Simulate discovering new addresses (triggers restart)
    await new Promise(r => setTimeout(r, 100));
    mockDapiClient.emit('newAddresses', ['yAddr2', 'yAddr3']);

    // Complete sync
    mockDapiClient.emit('end');

    await promise;

    // Verification: HISTORICAL_DATA_OBTAINED only at the END
    const obtainedIndex = events.indexOf('HISTORICAL_DATA_OBTAINED');
    const transactionCount = events.slice(0, obtainedIndex).filter(e => e === 'TRANSACTION').length;

    expect(obtainedIndex).toBeGreaterThan(0);
    expect(obtainedIndex).toBeLast(); // ← Should be last event
    expect(transactionCount).toBeGreaterThan(0); // ← Should have transactions BEFORE completion
  });

  it('should complete only after stream restart is fully ready', async () => {
    const syncer = new TransactionSyncer(mockDapiClient, 'testnet');

    let completionEmitted = false;
    syncer.on(EVENTS.HISTORICAL_DATA_OBTAINED, () => {
      // At this point, new stream must be fully initialized
      expect(syncer.historicalSyncStream).toBeDefined();
      expect(syncer.historicalSyncStream.isInitialized).toBe(true);
      completionEmitted = true;
    });

    await syncer.startSync({
      addresses: ['yAddr1'],
      fromHeight: 1000000
    });

    expect(completionEmitted).toBe(true);
  });

  it('should handle multiple address discovery events', async () => {
    const syncer = new TransactionSyncer(mockDapiClient, 'testnet');

    let completionCount = 0;
    syncer.on(EVENTS.HISTORICAL_DATA_OBTAINED, () => {
      completionCount++;
    });

    // Simulate: discover addresses → restart → discover more addresses → restart → complete
    await syncer.startSync({
      addresses: ['yAddr1'],
      fromHeight: 1000000
    });

    // Trigger restarts
    mockDapiClient.emit('newAddresses', ['yAddr2']);
    await new Promise(r => setTimeout(r, 50));

    mockDapiClient.emit('newAddresses', ['yAddr3']);
    await new Promise(r => setTimeout(r, 50));

    mockDapiClient.emit('end');

    // Only ONE completion signal, at the very end
    expect(completionCount).toBe(1);
  });
});
```

**Integration Test: Verify UTXO discovery completeness**

```javascript
describe('UTXO Discovery Completeness (Bloom Filter Fix)', () => {
  it('should discover all UTXOs including those after address expansion', async () => {
    // Setup: Create test data
    // - Block 1000000: UTXO for yAddr1 (200000 sats)
    // - Block 1000010: Transaction reveals yAddr2 (needs to trigger address expansion)
    // - Block 1000020: UTXO for yAddr2 (300000 sats) ← Would be missed without fix

    const syncer = new TransactionSyncer(dapiClient, 'testnet');
    const discoveredUTXOs = [];

    syncer.on('UTXO_FOUND', (utxo) => {
      discoveredUTXOs.push(utxo);
    });

    // Start with only yAddr1
    await syncer.startSync({
      addresses: ['yAddr1'],
      fromHeight: 1000000,
      toHeight: 1000030
    });

    // Verify: Both UTXOs found (yAddr1 AND yAddr2 after expansion)
    expect(discoveredUTXOs).toHaveLength(2);
    expect(discoveredUTXOs.map(u => u.address)).toContain('yAddr1');
    expect(discoveredUTXOs.map(u => u.address)).toContain('yAddr2');

    // The yAddr2 UTXO is at height 1000020 (would be missed without the fix)
    const yAddr2UTXO = discoveredUTXOs.find(u => u.address === 'yAddr2');
    expect(yAddr2UTXO.blockHeight).toBe(1000020);
  });
});
```

### B.5 Future-Proofing: Similar Issues to Watch For

This race condition can occur whenever:
1. **Async stream creation** - Stream created asynchronously, old stream ends synchronously
2. **State-dependent completion signals** - Signal depends on persistent state that gets updated asynchronously
3. **No guard conditions** - No checks to verify completion conditions before emitting

**Prevention pattern for similar issues:**
```javascript
// ❌ VULNERABLE PATTERN
doAsyncOperation().then(updateState);
const handler = () => {
  if (someCondition) {
    emit('COMPLETE');  // ← Race: someCondition might not be updated yet
  }
};

// ✅ SAFE PATTERN
let operationInProgress = false;
doAsyncOperation().then(() => {
  updateState();
  operationInProgress = false;
}).catch(() => {
  operationInProgress = false;
});

const handler = () => {
  if (operationInProgress) return;  // ← Guard against incomplete state
  if (stateReference !== currentState) return;  // ← Verify not superseded
  emit('COMPLETE');  // ← Only when all conditions met
};
```

---

## Appendix C: DAPI Integration Guide - Low-Level Implementation Details

**Purpose:** This appendix provides complete implementation guidance for DAPI integration, documenting critical details that caused the metadata extraction bug during initial development.

### C.1 Why This Matters

The metadata extraction bug (blockHeight = 0 → UTXOs marked unspendable) was caused by undocumented DAPI behaviors:

1. **DAPI returns raw buffers**, not parsed objects with fields
2. **Stream messages use protobuf getters**, not plain properties
3. **Merkle blocks lack height/time** information
4. **Header pre-sync is required** for instant metadata lookup

Without this knowledge, developers will encounter the same 4+ hour debugging cycle we experienced.

### C.2 Complete Working Implementation

```typescript
import { Block, MerkleBlock, Transaction } from '@dashevo/dashcore-lib';

class TransactionSyncer {
  private headerCache = new Map<string, { height: number; time: number }>();

  async syncTransactions(
    bloomFilter: BloomFilterParams,
    fromHeight: number,
    toHeight: number
  ): Promise<TransactionWithMetadata[]> {

    // ========================================
    // PHASE 1: Pre-Sync Block Headers
    // ========================================
    console.log('Phase 1: Pre-syncing headers...');

    const core = await this.getCore();
    const BATCH_SIZE = 100;

    for (let h = fromHeight; h <= toHeight; h += BATCH_SIZE) {
      const batchEnd = Math.min(h + BATCH_SIZE - 1, toHeight);
      const headerPromises = [];

      // Request blocks by height
      for (let height = h; height <= batchEnd; height++) {
        headerPromises.push({
          height,
          promise: core.getBlockByHeight(height).catch(() => null)
        });
      }

      const buffers = await Promise.all(headerPromises.map(hp => hp.promise));

      // Parse raw block buffers to extract metadata
      buffers.forEach((buffer, index) => {
        if (buffer) {
          // CRITICAL: Parse raw buffer with dashcore-lib
          const block = new Block(buffer);

          this.headerCache.set(block.header.hash, {
            height: headerPromises[index].height,  // From our request
            time: block.header.time
          });
        }
      });
    }

    console.log(`Cached ${this.headerCache.size} headers`);

    // ========================================
    // PHASE 2: Sync Transactions
    // ========================================
    console.log('Phase 2: Syncing transactions...');

    const transactions: TransactionWithMetadata[] = [];

    const stream = core.subscribeToTransactionsWithProofs(bloomFilter, {
      fromBlockHeight: fromHeight,
      count: toHeight - fromHeight,
      timeout: undefined
    });

    for await (const msg of stream) {
      // CRITICAL: Use protobuf getter methods
      const rawTxs = typeof msg.getRawTransactions === 'function'
        ? msg.getRawTransactions()
        : msg.rawTransactions;  // Fallback for mocks

      const rawMerkle = typeof msg.getRawMerkleBlock === 'function'
        ? msg.getRawMerkleBlock()
        : msg.rawMerkleBlock;

      // Process transactions
      if (rawTxs) {
        // CRITICAL: Handle nested protobuf wrapper
        const txList = typeof rawTxs.getTransactionsList === 'function'
          ? rawTxs.getTransactionsList()
          : (Array.isArray(rawTxs) ? rawTxs : null);

        if (txList) {
          const txs = txList.map(buf => new Transaction(Buffer.from(buf)));
          txs.forEach(tx => {
            transactions.push({ tx, metadata: null });
          });
        }
      }

      // Process merkle block with cached metadata lookup
      if (rawMerkle) {
        const merkleBlock = new MerkleBlock(Buffer.from(rawMerkle));

        // CRITICAL: Instant cache lookup (NOT async getBlockByHash!)
        const cachedHeader = this.headerCache.get(merkleBlock.header.hash);

        if (cachedHeader) {
          const metadata = {
            blockHash: merkleBlock.header.hash,
            height: cachedHeader.height,  // ✅ From cache
            time: new Date(cachedHeader.time * 1000),
            isChainLocked: false,
            isInstantLocked: false
          };

          // Match transactions to this block
          const txHashesInBlock = new Set(
            merkleBlock.hashes.map(h => {
              return Buffer.from(String(h), 'hex').reverse().toString('hex');
            })
          );

          transactions
            .filter(({ tx }) => txHashesInBlock.has(tx.hash))
            .forEach(txData => {
              txData.metadata = metadata;
            });
        }
      }
    }

    return transactions;
  }
}
```

### C.3 Common Mistakes and Solutions

#### Mistake 1: Assuming Parsed Responses

```typescript
// ❌ WRONG - block is a raw buffer
const block = await core.getBlockByHeight(height);
const hash = block.hash;  // undefined!

// ✅ CORRECT - parse buffer first
const buffer = await core.getBlockByHeight(height);
const block = new Block(buffer);
const hash = block.header.hash;  // Works!
```

#### Mistake 2: Using Property Access on Protobuf

```typescript
// ❌ WRONG - protobuf uses getters
const rawTxs = msg.rawTransactions;  // undefined!

// ✅ CORRECT - use getter methods
const rawTxs = msg.getRawTransactions();  // Works!
```

#### Mistake 3: Async Lookups During Streaming

```typescript
// ❌ SLOW/UNRELIABLE - async calls block stream processing
stream.on('data', async (msg) => {
  const merkleBlock = new MerkleBlock(msg.getRawMerkleBlock());
  const block = await core.getBlockByHash(merkleBlock.header.hash);  // Slow!
  const height = block.height;  // May timeout/fail
});

// ✅ FAST - pre-synced cache with instant lookup
await this.syncHeaders(from, to);  // Once, upfront
stream.on('data', (msg) => {
  const merkleBlock = new MerkleBlock(msg.getRawMerkleBlock());
  const metadata = this.headerCache.get(merkleBlock.header.hash);  // Instant!
  const height = metadata.height;  // ✅ Always available
});
```

#### Mistake 4: Missing Buffer.from() Conversions

```typescript
// ❌ WRONG - may fail if rawMerkle is Uint8Array
const merkleBlock = new MerkleBlock(rawMerkle);

// ✅ CORRECT - ensure Buffer type
const merkleBlock = new MerkleBlock(Buffer.from(rawMerkle));
```

### C.4 Testing with Mocks

Test mocks may not use protobuf. Support both patterns:

```typescript
// Dual-mode accessor for production and tests
const rawTxs = typeof msg.getRawTransactions === 'function'
  ? msg.getRawTransactions()      // Production: protobuf getter
  : msg.rawTransactions;           // Tests: plain property

// Same for all message fields
const rawMerkle = typeof msg.getRawMerkleBlock === 'function'
  ? msg.getRawMerkleBlock()
  : msg.rawMerkleBlock;

const instantLocks = typeof msg.getInstantSendLockMessages === 'function'
  ? msg.getInstantSendLockMessages()
  : msg.instantSendLockMessages;
```

**Benefits:**
- Production code works with real DAPI protobuf
- Test code works with plain object mocks
- No need for complex mock setup

### C.5 Performance Considerations

**Header Pre-Sync Timing:**
- 100 blocks: ~1-2 seconds
- 1000 blocks: ~5-10 seconds
- 10000 blocks: ~60-120 seconds

**Optimization Strategies:**

1. **Batch Size Tuning:**
```typescript
const BATCH_SIZE = 100;  // Good balance
// Too small (10): Many sequential requests
// Too large (1000): Risk of timeout
```

2. **Parallel Batch Processing:**
```typescript
// Process multiple batches in parallel
const batchPromises = [];
for (let h = fromHeight; h <= toHeight; h += BATCH_SIZE) {
  batchPromises.push(this.syncHeaderBatch(h, Math.min(h + BATCH_SIZE - 1, toHeight)));
}
await Promise.all(batchPromises);  // Faster for large ranges
```

3. **Cache Reuse:**
```typescript
// Reuse cache across multiple findUTXO calls if range overlaps
if (this.headerCache.size > 0) {
  // Only sync new headers not in cache
}
```

### C.6 Debugging Tips

**Enable Diagnostic Logging:**
```typescript
console.log('[TransactionSyncer] Header cache size:', this.headerCache.size);
console.log('[TransactionSyncer] Message is protobuf:', typeof msg.getRawTransactions === 'function');
console.log('[TransactionSyncer] Block height from cache:', cachedHeader?.height || 'MISSING');
```

**Validate Header Cache:**
```typescript
// After syncHeaders(), verify cache is populated
if (this.headerCache.size === 0) {
  throw new Error('Header cache is empty - getBlockByHeight() may be failing');
}
```

**Check Message Structure:**
```typescript
// Log first message to understand structure
console.log('Message keys:', Object.keys(msg));
console.log('Has getRawTransactions:', typeof msg.getRawTransactions);
```

### C.6.2 Common DAPI Error Messages

**Error: "Invalid block height" (Code 3: INVALID_ARGUMENT)**

Occurs when requesting blocks beyond the current chain tip.

```typescript
// ❌ WRONG - May request blocks that don't exist yet
const stream = core.subscribeToBlockHeadersWithChainLocks({
  fromBlockHeight: 1000000,
  count: 100000  // Chain tip might be at 1050000
});

// ✅ CORRECT - Clamp to chain tip
const status = await core.getBlockchainStatus();
const chainTip = status?.chain?.blocksCount || status?.blocks || 0;
const safeCount = Math.min(count, chainTip - fromBlockHeight);

const stream = core.subscribeToBlockHeadersWithChainLocks({
  fromBlockHeight: 1000000,
  count: safeCount  // Won't exceed chain tip
});
```

**Error: "No connection established" (Code 14: UNAVAILABLE)**

Occurs when DAPI node is down or unreachable.

```typescript
// Add retries for transient failures
let retries = 3;
while (retries > 0) {
  try {
    const stream = await core.subscribeToTransactionsWithProofs(...);
    break;  // Success
  } catch (error) {
    if (error.code === 14 && retries > 0) {
      console.log(`Connection failed, retrying... (${retries} left)`);
      retries--;
      await new Promise(r => setTimeout(r, 1000));
    } else {
      throw error;
    }
  }
}
```

**Error: "Deadline exceeded" (Code 4: DEADLINE_EXCEEDED)**

Occurs when DAPI request times out.

```typescript
// Increase timeout for slow public testnet
const dapiClient = new DAPIClient({
  network: 'testnet',
  timeout: 60000  // 60 seconds instead of default 30
});
```

### C.7 Reference Implementation Files

**This Package (dash-utxo-finder):**
- `src/TransactionSyncer.ts` (lines 158-227): Header pre-sync implementation
- `src/TransactionSyncer.ts` (lines 353-394): Protobuf getter handling
- `src/TransactionSyncer.ts` (lines 397-469): Merkle block processing with cache

**Reference (wallet-lib):**
- `BlockHeadersSyncWorker.js` (lines 143-157): Header sync worker
- `TransactionsSyncWorker.js` (lines 409-422): Metadata lookup from cache
- `TransactionsReader.js` (lines 165-166): Protobuf getter usage

---

## Appendix D: Error Codes Reference

```
UTXO_FINDER_CODES:
  ✓ UTXO_FINDING_SUCCESS
  ✗ NO_SPENDABLE_UTXOS
  ✗ INSUFFICIENT_FUNDS
  ✗ INVALID_AMOUNT
  ✗ INVALID_ADDRESS
  ✗ INVALID_MNEMONIC
  ✗ INVALID_NETWORK

SYNC_CODES:
  ✗ SYNC_INTERRUPTED
  ✗ SYNC_TIMEOUT
  ✗ PARTIAL_SYNC_FAILURE

NETWORK_CODES:
  ✗ DAPI_TIMEOUT
  ✗ DAPI_UNAVAILABLE
  ✗ DAPI_ERROR
  ✗ CONNECTION_LOST

BLOCKCHAIN_CODES:
  ✗ BLOCKCHAIN_REORG
  ✗ CHAIN_CONTINUITY_BROKEN
  ✗ INVALID_HEADER
  ✗ UTXO_UNCONFIRMED

VALIDATION_CODES:
  ✗ VALIDATION_FAILED
  ✗ STORAGE_ERROR
```

---

**Document Version:** 1.3
**Last Updated:** 2025-10-30
**Status:** Ready for Implementation (Complete with debug methodology and verification guides)
**Estimated Effort:** 3-4 weeks (Phase 1-3) + 1-2 weeks (testing & polish)
**Critical Fixes:**
- Bloom filter race condition (Section 5 + Appendix B)
- DAPI low-level integration (Section 2.4 + Appendix C)
- Message ordering pattern (Section 2.4.3)
**Changelog:**
- v1.3 (2025-10-30): Added critical message ordering pattern (Section 2.4.3), DAPI error handling (Appendix C.6.2), and RPC verification methodology (Section 10.5)
- v1.2 (2025-10-30): Added Section 2.4 (Low-Level DAPI Integration) and Appendix C (DAPI Integration Guide) with critical implementation details for buffer parsing, protobuf getters, and two-phase header sync pattern
- v1.1 (2025-10-24): Initial specification
