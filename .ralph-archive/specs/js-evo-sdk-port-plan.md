# js-evo-sdk Port Plan

## Quick Start: Ralph Setup

This port uses Ralph Wiggum for autonomous execution. **Start here.**

### Step 1: Install Ralph

```bash
# Clone the repository
git clone https://github.com/frankbria/ralph-claude-code.git
cd ralph-claude-code

# Run installer
./install.sh
```

This installs: `ralph`, `ralph-monitor`, `ralph-setup`, `ralph-import`, `ralph-migrate`

### Step 2: Initialize Project

```bash
cd /Users/user/Sync/Code/Dash/platform-v3.0-dev

# Initialize ralph in the project
ralph-setup

# Import this spec
ralph-import /Users/user/.claude/plans/nifty-weaving-honey.md
```

### Step 3: Create PROMPT.md

Create `/Users/user/Sync/Code/Dash/platform-v3.0-dev/PROMPT.md`:

```markdown
# js-evo-sdk Port Implementation

Read the full spec at /Users/user/.claude/plans/nifty-weaving-honey.md

## Current Task
Execute the "Execution Steps (Phase 1: js-evo-sdk Targeted Copy)" section.

## Verification
After each step:
1. Verify files copied correctly
2. Run: `cd packages/js-evo-sdk && npm install`
3. Run: `npm run build` (may fail initially - that's ok)
4. Commit progress: `git add -A && git commit -m "step X complete"`

## Completion Criteria
- [ ] identities/ copied (16 files)
- [ ] utils/, types/ copied
- [ ] errors.ts, util.ts copied
- [ ] workers/ copied (11 files)
- [ ] tests copied
- [ ] package.json updated
- [ ] npm install succeeds
- [ ] npm run build succeeds (or documents remaining issues)

When ALL criteria met, write to .ralph/status.md:
EXIT_SIGNAL: true
```

### Step 4: Run Ralph

```bash
# Standard run (up to 25 iterations)
ralph --max-iterations 25

# With monitoring dashboard
ralph --max-iterations 25 --monitor --verbose

# Check status anytime
ralph-monitor
```

---

## Project Overview

**Goal**: Port js-evo-sdk ecosystem from `platform-feat-js-evo-sdk-identities` to `platform-v3.0-dev` as a full Platform SDK replacement, with zero dependence on `wallet-lib`.

**Branch**: `feat/js-evo-sdk-v3.0-dev`
**Package**: `@dashevo/js-evo-sdk`
**Timeline**: ASAP / High Priority

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Consumer Application                         │
│              (Browser / Node.js / React Native)                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                       @dashevo/js-evo-sdk                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │  Identity   │ │    DPNS     │ │  Documents  │ │  DashPay   │ │
│  │  Facade     │ │   Facade    │ │   Facade    │ │   Facade   │ │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └─────┬──────┘ │
│         │               │               │              │        │
│  ┌──────▼───────────────▼───────────────▼──────────────▼──────┐ │
│  │                    Worker Manager                           │ │
│  │              (Mandatory WASM Isolation)                     │ │
│  └──────────────────────┬──────────────────────────────────────┘ │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      Web Workers                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │identity-create│ │identity-topup│  │  documents   │   ...    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          │                 │                 │
┌─────────▼─────────────────▼─────────────────▼───────────────────┐
│                        @dashevo/wasm-sdk                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ identityCreatePrepare() │ identityTopUpPrepare()            │ │
│  │ prepareIdentityTopUp()  │ Wallet functions (key derivation) │ │
│  │ Documents/DPNS/Tokens   │ Platform queries                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────┐              ┌─────────────────────┐
│ transaction-finder  │              │       DAPI          │
│ (UTXO + IS/CL)      │              │   (Platform ops)    │
└─────────────────────┘              └─────────────────────┘
```

---

## Wallet Architecture (No wallet-lib)

```
┌─────────────────────────────────────────────────────────────┐
│                   Wallet Replacement Strategy                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  KEY DERIVATION (wasm-sdk)                                  │
│  ├── Mnemonic generation/validation                         │
│  ├── BIP44/DIP9 HD key derivation                          │
│  └── Key pair management                                    │
│                                                             │
│  UTXO MANAGEMENT (transaction-finder via DAPI)              │
│  ├── Historic: finder.findUTXOs() - block scanning         │
│  └── Realtime: finder.monitorAddresses() - IS/CL streams   │
│                                                             │
│  TRANSACTION BUILDING (existing JS deps from feature branch)│
│  ├── Asset lock transaction creation                        │
│  ├── Transaction signing                                    │
│  └── Broadcast via DAPI                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Feature Scope

### Identity Operations
| Feature | Entry Point | Implementation |
|---------|-------------|----------------|
| Create (high-level) | `sdk.identities.createWithMnemonic(mnemonic, fundingTx)` | Full flow: derive keys → asset lock → create |
| Create (low-level) | `sdk.identities.create(assetLockProof, keys)` | Direct with pre-built proof |
| Top-up (high-level) | `sdk.identities.topUpWithMnemonic(identityId, mnemonic, amount)` | Full funding flow |
| Top-up (low-level) | `sdk.identities.topUp(identityId, assetLockProof)` | Direct with pre-built proof |
| Credit transfer | `sdk.identities.transferCredits(from, to, amount)` | Identity-to-identity |
| Get identity | `sdk.identities.get(identityId)` | Query by ID |
| Update keys | `sdk.identities.updateKeys(identity, changes)` | Add/disable keys |

### DPNS Operations (Full + Voting)
| Feature | Method |
|---------|--------|
| Register name | `sdk.dpns.register(name, identity)` |
| Resolve name | `sdk.dpns.resolve(name)` |
| Search names | `sdk.dpns.search(query)` |
| Contested names | `sdk.dpns.getContestedNames()` |
| Vote on name | `sdk.dpns.vote(name, identityId)` |

### Document Operations (Full CRUD + Queries)
| Feature | Method |
|---------|--------|
| Create | `sdk.documents.create(contract, type, data)` |
| Read | `sdk.documents.get(contract, type, id)` |
| Update | `sdk.documents.replace(document, changes)` |
| Delete | `sdk.documents.delete(document)` |
| Query | `sdk.documents.query(contract, type, where, orderBy, limit)` |

### DashPay Operations (Full)
| Feature | Method |
|---------|--------|
| Create profile | `sdk.dashpay.createProfile(identity, displayName, bio, avatar)` |
| Get profile | `sdk.dashpay.getProfile(identityId)` |
| Send contact request | `sdk.dashpay.sendContactRequest(from, to)` |
| Accept contact | `sdk.dashpay.acceptContactRequest(request)` |
| Get contacts | `sdk.dashpay.getContacts(identityId)` |

### Token Operations (Full)
| Feature | Method |
|---------|--------|
| Mint | `sdk.tokens.mint(tokenId, amount)` |
| Burn | `sdk.tokens.burn(tokenId, amount)` |
| Transfer | `sdk.tokens.transfer(tokenId, to, amount)` |
| Freeze | `sdk.tokens.freeze(tokenId, identityId)` |
| Unfreeze | `sdk.tokens.unfreeze(tokenId, identityId)` |
| Get balance | `sdk.tokens.getBalance(tokenId, identityId)` |

### System Contracts Support
- DPNS Contract
- DashPay Contract
- Withdrawals Contract
- Masternode Reward Shares Contract
- Feature Flags Contract

### Data Contract Operations (Match wasm-sdk)
| Feature | Method |
|---------|--------|
| Create | `sdk.contracts.create(ownerId, schema, options)` |
| Update | `sdk.contracts.update(contractId, changes, signingKey)` |
| Get | `sdk.contracts.get(contractId)` |
| Get history | `sdk.contracts.getHistory(contractId)` |
| Validate schema | `sdk.contracts.validate(schema)` |

### Withdrawal Operations (Match wasm-sdk)
| Feature | Method |
|---------|--------|
| Request withdrawal | `sdk.withdrawals.request(identityId, amount, toAddress, signingKey)` |
| Get withdrawal status | `sdk.withdrawals.getStatus(withdrawalId)` |
| Get pending | `sdk.withdrawals.getPending(identityId)` |
| Get completed | `sdk.withdrawals.getCompleted(identityId)` |

---

## State Proof Verification

### Auto-Verification (Default)
All Platform responses are automatically verified against state proofs.

```
┌─────────────────────────────────────────────────────────────┐
│                  Proof Verification Flow                     │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   DAPI       │ ──▶ │  Response +  │ ──▶ │  Verify      │
│   Request    │     │  Proof       │     │  Proof       │
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
                            ┌───────────────────┼───────────────────┐
                            ▼                   ▼                   ▼
                      ┌──────────┐        ┌──────────┐        ┌──────────┐
                      │  Valid   │        │ Invalid  │        │ Missing  │
                      │  → Return│        │  → Error │        │  → Error │
                      └──────────┘        └──────────┘        └──────────┘
```

### Verification Configuration
```typescript
interface VerificationConfig {
  enabled: boolean;              // Enable/disable (default: true)
  strictMode: boolean;           // Fail on any verification error (default: true)
  allowMissingProofs: boolean;   // Accept responses without proofs (default: false)
}

// SDK initialization
const sdk = new EvoSDK({
  network: 'testnet',
  verification: {
    enabled: true,
    strictMode: true,
    allowMissingProofs: false
  }
});
```

### Verification API
```typescript
// Manual verification (if needed)
const result = await sdk.verify.proof(response, proof);
// { valid: true, rootHash: '...', timestamp: 1234567890 }

// Get proof for debugging
const proof = await sdk.identities.get(id, { includeProof: true });
// proof.data = identity, proof.proof = raw proof bytes

// Disable verification for single request (advanced)
const identity = await sdk.identities.get(id, { skipVerification: true });
```

---

## Identity Operations (Detailed)

### Supported Key Types
Match wasm-sdk and js-dash-sdk supported types:

| Key Type | Value | Use Case |
|----------|-------|----------|
| ECDSA_SECP256K1 | 0 | Standard authentication, signing |
| BLS12_381 | 1 | Threshold signatures, masternodes |
| ECDSA_HASH160 | 2 | Compact key representation |
| BIP13_SCRIPT_HASH | 3 | Script-based authentication |
| EDDSA_25519_HASH160 | 4 | EdDSA signatures |

### Key Purpose
| Purpose | Value | Description |
|---------|-------|-------------|
| AUTHENTICATION | 0 | Sign state transitions |
| ENCRYPTION | 1 | Encrypt/decrypt data |
| DECRYPTION | 2 | Decrypt data |
| TRANSFER | 3 | Credit transfers |
| SYSTEM | 4 | System operations |
| VOTING | 5 | Governance voting |

### Identity Create Flow (Detailed)

```
┌─────────────────────────────────────────────────────────────┐
│                Identity Creation Flow                        │
└─────────────────────────────────────────────────────────────┘

HIGH-LEVEL (with mnemonic):
┌──────────┐   ┌─────────────┐   ┌─────────────┐   ┌──────────┐
│ Mnemonic │ → │ Derive Keys │ → │ Fund Address│ → │ Create   │
│          │   │ (BIP44/DIP9)│   │ (detect TX) │   │ Identity │
└──────────┘   └─────────────┘   └─────────────┘   └──────────┘
                     │                   │               │
                     ▼                   ▼               ▼
               wasm-sdk          transaction-finder  wasm-sdk
              keyDerive()         findUTXOs()     identityCreatePrepare()

LOW-LEVEL (with proof):
┌─────────────────┐   ┌────────────────┐   ┌──────────────────┐
│ Asset Lock Proof│ → │ Private Key(s) │ → │ Create Identity  │
│ (pre-built)     │   │ (WIF format)   │   │ State Transition │
└─────────────────┘   └────────────────┘   └──────────────────┘
                                                    │
                                                    ▼
                                           wasm-sdk broadcast
```

### Full API Signatures

```typescript
// Identity Creation
sdk.identities.createWithMnemonic(
  mnemonic: string,
  options?: {
    fundingAmount?: number;      // Credits to fund (default: 100000)
    keyCount?: number;           // Number of keys to create (default: 3)
    keyTypes?: KeyType[];        // Key types to create
    waitForConfirmation?: boolean; // Wait for IS/CL (default: true)
  }
): Promise<Identity>

sdk.identities.create(
  assetLockProof: AssetLockProof,
  publicKeys: IdentityPublicKeyInput[],
  privateKey: string  // WIF format
): Promise<Identity>

// Identity Top-up
sdk.identities.topUpWithMnemonic(
  identityId: string,
  mnemonic: string,
  amount: number,      // Credits to add
  options?: {
    keyIndex?: number;  // Key index to use for signing
  }
): Promise<TopUpResult>

sdk.identities.topUp(
  identityId: string,
  assetLockProof: AssetLockProof,
  privateKey: string   // WIF format
): Promise<TopUpResult>

// Credit Transfer
sdk.identities.transferCredits(
  fromIdentityId: string,
  toIdentityId: string,
  amount: number,       // Credits to transfer
  privateKey: string    // WIF of signing key
): Promise<TransferResult>

// Identity Query
sdk.identities.get(identityId: string): Promise<Identity | null>
sdk.identities.getByPublicKeyHash(hash: Buffer): Promise<Identity | null>

// Key Management
sdk.identities.addKey(
  identityId: string,
  newKey: IdentityPublicKeyInput,
  signingKey: string    // WIF of existing auth key
): Promise<Identity>

sdk.identities.disableKey(
  identityId: string,
  keyId: number,
  signingKey: string
): Promise<Identity>
```

---

## TypeScript Types

### Approach: Hybrid
- **Core types**: Hand-written for SDK interfaces
- **Contract types**: Generated from JSON schemas

### Core Type Definitions

```typescript
// Identity
interface Identity {
  id: string;                    // Base58 identifier
  publicKeys: IdentityPublicKey[];
  balance: number;               // Credits (NOT duffs!)
  revision: number;
}

interface IdentityPublicKey {
  id: number;
  type: KeyType;
  purpose: KeyPurpose;
  securityLevel: SecurityLevel;
  data: Uint8Array;
  readOnly: boolean;
  disabledAt?: number;
}

interface IdentityPublicKeyInput {
  type: KeyType;
  purpose: KeyPurpose;
  securityLevel: SecurityLevel;
  privateKeyHex: string;  // For derivation
}

// Asset Lock
interface AssetLockProof {
  type: 'instant' | 'chain';
  instantLock?: Uint8Array;
  transaction: Uint8Array;
  outputIndex: number;
}

// Documents
interface Document {
  $id: string;
  $ownerId: string;
  $dataContractId: string;
  $type: string;
  $revision: number;
  $createdAt?: number;
  $updatedAt?: number;
  [key: string]: any;
}

// Data Contract
interface DataContract {
  $id: string;
  $ownerId: string;
  $schema: string;
  $version: number;
  documents: Record<string, DocumentSchema>;
}

// SDK Configuration
interface SDKConfig {
  network: 'testnet' | 'mainnet' | NetworkConfig;
  autoDiscover?: boolean;
  logging?: LogLevel;
  cache?: CacheConfig;
}

interface NetworkConfig {
  network: string;
  dapiAddresses: string[];
}
```

### Generated Contract Types
Auto-generated from contract schemas for type-safe document operations:

```typescript
// Example: DPNS types (generated)
interface DPNSDomain {
  label: string;
  normalizedLabel: string;
  normalizedParentDomainName: string;
  preorderSalt: Uint8Array;
  records: DPNSRecords;
  subdomainRules: SubdomainRules;
}

// Example: DashPay types (generated)
interface DashPayProfile {
  displayName: string;
  publicMessage?: string;
  avatarUrl?: string;
  avatarHash?: Uint8Array;
  avatarFingerprint?: Uint8Array;
}
```

---

## Event System

### Event Types

```typescript
type SDKEventType =
  // Transaction Events
  | 'transaction:broadcast'
  | 'transaction:instantLock'
  | 'transaction:chainLock'
  | 'transaction:confirmed'
  | 'transaction:failed'

  // State Events
  | 'identity:created'
  | 'identity:updated'
  | 'identity:topup'
  | 'identity:balanceChanged'
  | 'document:created'
  | 'document:updated'
  | 'document:deleted'
  | 'name:registered'
  | 'name:resolved'

  // Connection Events
  | 'connection:connected'
  | 'connection:disconnected'
  | 'connection:nodeChanged'
  | 'connection:error';
```

### Event Emitter Pattern

```typescript
// Subscribe to events
sdk.on('identity:created', (identity: Identity) => {
  console.log('New identity:', identity.id);
});

sdk.on('transaction:instantLock', (event: InstantLockEvent) => {
  console.log('IS received for:', event.txid);
});

sdk.on('connection:nodeChanged', (event: NodeChangeEvent) => {
  console.log('Switched to node:', event.newNode);
});

// Unsubscribe
const handler = (identity: Identity) => { ... };
sdk.on('identity:created', handler);
sdk.off('identity:created', handler);

// One-time listener
sdk.once('identity:created', (identity) => { ... });
```

### Event Payloads

```typescript
interface InstantLockEvent {
  txid: string;
  instantLockHex: string;
  timestamp: number;
}

interface ChainLockEvent {
  txid: string;
  blockHeight: number;
  blockHash: string;
}

interface NodeChangeEvent {
  previousNode: string | null;
  newNode: string;
  reason: 'timeout' | 'error' | 'rotation';
}

interface BalanceChangedEvent {
  identityId: string;
  previousBalance: number;
  newBalance: number;
  change: number;
  reason: 'topup' | 'transfer' | 'fee';
}
```

---

## Caching Strategy

### Cache All Queries
All Platform query responses are cached locally for performance.

```
┌─────────────────────────────────────────────────────────────┐
│                     Cache Architecture                       │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Identity   │     │   Document   │     │   Contract   │
│    Cache     │     │    Cache     │     │    Cache     │
│  (by ID)     │     │  (by query)  │     │  (by ID)     │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                    ┌───────▼───────┐
                    │  CacheManager │
                    │  - TTL logic  │
                    │  - LRU evict  │
                    │  - Invalidate │
                    └───────────────┘
```

### Cache Configuration

```typescript
interface CacheConfig {
  enabled: boolean;           // Enable/disable caching
  ttl: {
    identity: number;         // ms (default: 60000)
    document: number;         // ms (default: 30000)
    contract: number;         // ms (default: 300000)
    dpns: number;             // ms (default: 120000)
  };
  maxSize: {
    identity: number;         // Max cached identities (default: 100)
    document: number;         // Max cached documents (default: 500)
    contract: number;         // Max cached contracts (default: 50)
  };
}
```

### Cache Invalidation

| Event | Cache Invalidation |
|-------|-------------------|
| Identity created | Add to identity cache |
| Identity updated | Invalidate identity entry |
| Document created | Add to document cache, invalidate query cache |
| Document updated | Invalidate document entry and related queries |
| Top-up | Invalidate identity entry (balance changed) |
| Credit transfer | Invalidate both sender and recipient |

### Manual Cache Control

```typescript
// Clear all caches
sdk.cache.clear();

// Clear specific cache
sdk.cache.clear('identity');
sdk.cache.clear('document');

// Invalidate specific entry
sdk.cache.invalidate('identity', identityId);

// Disable cache temporarily
sdk.cache.disable();
sdk.cache.enable();

// Check cache status
const stats = sdk.cache.stats();
// { hits: 150, misses: 30, size: 45, maxSize: 100 }
```

---

## Technical Requirements

### Platform Support
| Platform | Status | Notes |
|----------|--------|-------|
| Browser | Primary | Webpack bundled, ESM |
| Node.js | Primary | Native ESM |
| React Native | Investigate | WASM compatibility TBD |

### Worker Architecture (Mandatory)

**Single Worker Model**: One dedicated worker handles all WASM operations sequentially.

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Thread                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   WorkerManager                          ││
│  │  - Message queue (FIFO)                                  ││
│  │  - Promise resolution map                                ││
│  │  - Worker lifecycle management                           ││
│  └──────────────────────┬──────────────────────────────────┘│
└─────────────────────────┼───────────────────────────────────┘
                          │ postMessage / onmessage
┌─────────────────────────▼───────────────────────────────────┐
│                    WASM Worker                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  - wasm-sdk instance (singleton)                         ││
│  │  - Operation handlers                                    ││
│  │  - Synchronous prepare methods                           ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Worker Lifecycle**:
1. Lazy initialization on first SDK operation
2. WASM module loaded once, reused for all operations
3. Operations queued and executed sequentially (prevents RwLock conflicts)
4. Worker terminated on `sdk.disconnect()` or page unload

**Message Protocol**:
```typescript
// Request
{ id: string, operation: string, params: any[] }

// Response
{ id: string, success: boolean, result?: any, error?: SDKError }
```

### Network Configuration
```javascript
// Presets
sdk.connect('testnet');
sdk.connect('mainnet');

// Custom nodes
sdk.connect({
  network: 'testnet',
  dapiAddresses: ['node1.example.com', 'node2.example.com']
});

// Auto-discovery (healthy-nodes.json)
sdk.connect({
  network: 'testnet',
  autoDiscover: true
});
```

### Error Handling (Match Platform Errors)

**Error Structure** (mirrors Platform error format):
```typescript
interface SDKError {
  name: string;           // Error class name
  message: string;        // Human-readable message
  code: number;           // Platform error code
  data?: any;             // Additional context
  cause?: Error;          // Original error (from WASM)
  stack?: string;         // Stack trace
}
```

**Error Categories**:
| Category | Code Range | Examples |
|----------|------------|----------|
| Network | 1000-1999 | Connection timeout, node unavailable |
| Identity | 2000-2999 | Identity not found, insufficient balance |
| Document | 3000-3999 | Invalid document, contract not found |
| DPNS | 4000-4999 | Name taken, invalid name format |
| Token | 5000-5999 | Insufficient tokens, frozen account |
| Validation | 6000-6999 | Invalid input, schema violation |
| Internal | 9000-9999 | WASM error, worker crash |

**Error Classes**:
```typescript
class NetworkError extends SDKError { code: 1xxx }
class IdentityError extends SDKError { code: 2xxx }
class DocumentError extends SDKError { code: 3xxx }
class DPNSError extends SDKError { code: 4xxx }
class TokenError extends SDKError { code: 5xxx }
class ValidationError extends SDKError { code: 6xxx }
class InternalError extends SDKError { code: 9xxx }
```

### Logging
- Configurable debug levels: debug, info, warn, error
- Console output by default
- Custom logger support

---

## Packages to Port

### From Feature Branch → v3.0-dev

| Package | Action | Purpose |
|---------|--------|---------|
| `js-evo-sdk` | Replace (206 → ~15k+ lines) | Main SDK |
| `transaction-finder` | Copy new | UTXO discovery, IS/CL monitoring |
| `dash-rpc-client` | Copy new | Testing only (fund addresses) |
| `wasm-sdk` | Add prepare methods | Identity prepare functions |

### wasm-sdk Changes
```rust
// Add these methods:
identityCreatePrepare(assetLockProof, privateKey, publicKeys)
identityTopUpPrepare(identityId, assetLockProof, privateKey)
prepareIdentityTopUp(identityId, proofJson, wif, network) // standalone
```

---

## Investigation Items

### 1. DAPI Resilience (Priority: High)
**Problem**: Connection timeouts and random failures with bad nodes

**To Investigate**:
- Does wasm-sdk/rs-dapi-client have adequate retry logic?
- Current feature branch handling
- Need for JS-level retry layer

**Decision**: TBD after investigation

### 2. React Native Compatibility (Priority: Medium)
**To Investigate**:
- JSC/Hermes WASM support
- Required polyfills
- Separate build target needed?

**Decision**: TBD after investigation

---

## Testing Strategy (Comprehensive)

### Test Pyramid
```
         /\
        /E2E\         Real testnet operations
       /______\
      /        \
     /Integration\    Mocked platform + real DAPI
    /______________\
   /                \
  /    Unit Tests    \    Pure logic, no network
 /____________________\
```

### Test Directory Structure
```
packages/js-evo-sdk/
├── tests/
│   ├── unit/                    # Fast, no network
│   │   ├── identity/
│   │   │   ├── identity-facade.test.ts
│   │   │   ├── identity-creator.test.ts
│   │   │   └── identity-transformer.test.ts
│   │   ├── dpns/
│   │   │   └── dpns-facade.test.ts
│   │   ├── documents/
│   │   │   └── document-facade.test.ts
│   │   ├── utils/
│   │   │   ├── formatter.test.ts
│   │   │   └── validator.test.ts
│   │   └── workers/
│   │       └── worker-manager.test.ts
│   │
│   ├── integration/             # Mocked DAPI
│   │   ├── identity-create.test.ts
│   │   ├── identity-topup.test.ts
│   │   ├── dpns-registration.test.ts
│   │   └── document-crud.test.ts
│   │
│   ├── e2e/                     # Real testnet
│   │   ├── identity-flow.test.ts
│   │   ├── dpns-flow.test.ts
│   │   ├── dashpay-flow.test.ts
│   │   └── full-workflow.test.ts
│   │
│   ├── fixtures/                # Test data
│   │   ├── identities.json
│   │   ├── documents.json
│   │   ├── contracts.json
│   │   └── proofs.json
│   │
│   ├── mocks/                   # Mock implementations
│   │   ├── mock-wasm-sdk.ts
│   │   ├── mock-dapi-client.ts
│   │   ├── mock-transaction-finder.ts
│   │   └── mock-worker.ts
│   │
│   └── helpers/                 # Test utilities
│       ├── sdk-verification.ts  # Verify via real SDK
│       ├── test-wallet.ts       # Test wallet helpers
│       └── testnet-faucet.ts    # Funding helpers
```

### Test Commands
```bash
# Unit tests (fast, no network)
npm test                         # All unit tests
npm run test:unit               # Alias
npm test -- tests/unit/identity/ # Specific directory
npm test -- -t "should create"   # Pattern match

# Integration tests (mocked DAPI)
npm run test:integration
npm run test:integration -- --watch

# E2E tests (real testnet)
npm run test:e2e                 # Headless
npm run test:e2e:headed          # With browser (Playwright)
npm run test:e2e -- --grep "identity"

# Coverage
npm run test:coverage
npm run test:coverage:report     # HTML report
```

### Mock Strategies

#### 1. Mock wasm-sdk (Unit Tests)
```typescript
// tests/mocks/mock-wasm-sdk.ts
export const mockWasmSdk = {
  identityCreatePrepare: vi.fn().mockResolvedValue({
    stateTransition: 'serialized...',
    identityId: 'mockId123'
  }),
  identityTopUpPrepare: vi.fn().mockResolvedValue({
    stateTransition: 'serialized...'
  }),
  getIdentity: vi.fn().mockResolvedValue({
    id: 'mockId',
    balance: 100000,
    publicKeys: []
  })
};

// In test
vi.mock('@dashevo/wasm-sdk', () => mockWasmSdk);
```

#### 2. Mock DAPI Client (Integration Tests)
```typescript
// tests/mocks/mock-dapi-client.ts
export class MockDapiClient {
  platform = {
    getIdentity: vi.fn().mockResolvedValue(mockIdentity),
    broadcastStateTransition: vi.fn().mockResolvedValue({ ok: true }),
    getDocuments: vi.fn().mockResolvedValue([])
  };
  core = {
    broadcastTransaction: vi.fn().mockResolvedValue('txid123'),
    getStatus: vi.fn().mockResolvedValue({ ready: true })
  };
}
```

#### 3. Mock Transaction Finder (Integration Tests)
```typescript
// tests/mocks/mock-transaction-finder.ts
export class MockTransactionFinder {
  findUTXOs = vi.fn().mockResolvedValue([
    { txid: 'abc123', outputIndex: 0, satoshis: 100000000 }
  ]);

  waitForConfirmation = vi.fn().mockResolvedValue({
    confirmed: true,
    instantLockHex: '0x...'
  });

  monitorAddresses = vi.fn().mockImplementation((addresses, callbacks) => {
    // Simulate InstantLock after delay
    setTimeout(() => callbacks.onInstantLock({ txid: 'abc' }), 100);
    return { stop: vi.fn() };
  });
}
```

#### 4. Mock Worker (Unit Tests)
```typescript
// tests/mocks/mock-worker.ts
export class MockWorkerManager {
  private queue: Promise<any>[] = [];

  execute = vi.fn().mockImplementation(async (op, params) => {
    // Return mock results based on operation
    switch (op) {
      case 'identity-create':
        return { identityId: 'mock123', balance: 100000 };
      case 'identity-topup':
        return { success: true, newBalance: 200000 };
      default:
        throw new Error(`Unknown operation: ${op}`);
    }
  });
}
```

### E2E Test Setup

#### Environment Requirements
```bash
# .env.test
NETWORK=testnet
MNEMONIC=test mnemonic for e2e tests...
START_HEIGHT=1380000
TESTNET_RPC_ENDPOINT=http://localhost:19998  # Optional: for funding
TESTNET_RPC_USERNAME=dashrpc
TESTNET_RPC_PASSWORD=password
```

#### Test Wallet Management
```typescript
// tests/helpers/test-wallet.ts
export async function getTestWallet(): Promise<TestWallet> {
  const mnemonic = process.env.MNEMONIC;
  // Derive keys, check balance, etc.
  return { mnemonic, addresses, balance };
}

export async function fundTestAddress(address: string, amount: number) {
  if (process.env.TESTNET_RPC_ENDPOINT) {
    // Use RPC to fund from local node
    const rpc = new DashRpcClient(process.env.TESTNET_RPC_ENDPOINT);
    await rpc.sendToAddress(address, amount);
  } else {
    throw new Error('No funding source available');
  }
}
```

#### Testnet Fixtures
```typescript
// tests/fixtures/testnet-identities.ts
export const KNOWN_IDENTITIES = {
  // Pre-created identities for read tests
  testIdentity1: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
  testIdentity2: 'BmvBWPtE5gMN3Yf4FfnPZrXZJmkvdkH9QKLW8BqKdcpt',
};

export const KNOWN_DPNS_NAMES = {
  // Pre-registered names for resolve tests
  testName1: 'alice',
  testName2: 'bob',
};
```

### Test Naming Conventions
```
[facade].[method].[scenario].test.ts
identity.create.withMnemonic.success.test.ts
identity.create.withMnemonic.insufficientFunds.test.ts
identity.topup.withProof.success.test.ts
dpns.resolve.existingName.success.test.ts
dpns.resolve.nonExistent.returnsNull.test.ts
```

### Continuous Integration
```yaml
# .github/workflows/test.yml
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:unit

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - run: npm run test:e2e
    env:
      MNEMONIC: ${{ secrets.TESTNET_MNEMONIC }}
```

### Test Coverage Requirements
| Category | Minimum Coverage |
|----------|------------------|
| Unit Tests | 80% |
| Integration Tests | 60% |
| E2E Tests | Critical paths only |

### SDK-Based Verification (E2E)
```typescript
// tests/helpers/sdk-verification.ts
export async function verifyIdentityViaSDK(
  sdk: EvoSDK,
  identityId: string
): Promise<VerificationResult> {
  const identity = await sdk.identities.get(identityId);
  return {
    exists: identity !== null,
    balance: identity?.balance,
    keyCount: identity?.publicKeys.length
  };
}

export async function verifyDPNSNameViaSDK(
  sdk: EvoSDK,
  name: string
): Promise<VerificationResult> {
  const resolved = await sdk.dpns.resolve(name);
  return {
    exists: resolved !== null,
    ownerId: resolved?.ownerId
  };
}
```

---

## Implementation Priority

```
Phase 1: Identity (ASAP)
├── identityCreatePrepare in wasm-sdk
├── identityTopUpPrepare in wasm-sdk
├── Port js-evo-sdk identity facade
├── Port transaction-finder
└── Port dash-rpc-client (tests)

Phase 2: DPNS
├── Name registration
├── Name resolution
├── Contested names
└── Voting

Phase 3: Documents
├── CRUD operations
├── Query support
└── Contract-specific helpers

Phase 4: DashPay
├── Profiles
├── Contact requests
└── Contact management

Phase 5: Tokens
├── Transfer operations
├── Admin operations (mint/burn/freeze)
└── Balance queries
```

---

## Performance

**Approach**: Port first, benchmark, then optimize

**Metrics to Track**:
- Bundle size (minimize where possible)
- WASM initialization time
- Operation latency (identity create, document queries)
- Memory usage

---

## Relationship with Existing Packages

| Package | Relationship |
|---------|--------------|
| `js-dash-sdk` | Parallel existence (both available) |
| `wallet-lib` | Zero dependency |
| `wasm-sdk` | js-evo-sdk wraps (thin layer) |
| `dapi-client` | Used internally via wasm-sdk |

---

## Demo App

Include full demo app from feature branch as reference implementation:
- Identity management UI
- DPNS registration
- Document browser
- DashPay integration
- Network switching
- Mock mode for testing

---

## Files to Modify/Create

### New Packages (copy from feature branch)
```
packages/
├── transaction-finder/   # New - DONE
└── dash-rpc-client/      # New (testing) - DONE
```

### js-evo-sdk Targeted Copy (not full replacement)

Copy these directories/files from feature branch to v3.0-dev:

```
src/
├── identities/           # FULL directory - core identity implementation
│   ├── config/
│   ├── contracts/
│   ├── coordination/
│   ├── errors/
│   ├── facades/
│   ├── utils/
│   └── facade.ts
├── utils/                # NEW - logger, dapi-wrapper, wasm-queue
├── types/                # NEW - type definitions
├── errors.ts             # NEW - base error classes
└── util.ts               # NEW - utility functions

workers/                  # NEW - WASM worker operations

tests/                    # Copy relevant tests
```

**Keep existing v3.0-dev files:**
- `addresses/facade.ts` (not in feature branch)
- Other facades (contracts, documents, dpns, etc.) - may need merge
- `sdk.ts` - may need merge
- `wasm.ts` - may need merge
- `webpack.config.cjs`, `tsconfig.json`, `package.json` - may need merge

### wasm-sdk Modifications
```
packages/wasm-sdk/
├── Cargo.toml                           # Add simple-signer dep
├── src/
│   ├── lib.rs                           # Add prepareIdentityTopUp
│   └── state_transitions/
│       └── identity.rs                  # Add prepare methods
```

---

## Execution Steps (Phase 1: js-evo-sdk Targeted Copy)

### Step 1: Copy identities/ directory (16 files)
```bash
# Remove existing stub and copy full implementation
rm -rf /Users/user/Sync/Code/Dash/platform-v3.0-dev/packages/js-evo-sdk/src/identities
cp -r /Users/user/Sync/Code/Dash/platform-feat-js-evo-sdk-identities/packages/js-evo-sdk/src/identities \
      /Users/user/Sync/Code/Dash/platform-v3.0-dev/packages/js-evo-sdk/src/
```

Files being copied:
- `identities/facade.ts` - Main facade entry point
- `identities/config/operation-config.ts` - Operation configuration
- `identities/contracts/operation-events.ts` - Event definitions
- `identities/coordination/asset-lock-proof-manager.ts` - Asset lock proofs
- `identities/coordination/identity-key-generator.ts` - Key generation
- `identities/coordination/transaction-builder.ts` - TX building
- `identities/coordination/utxo-finder.ts` - UTXO discovery
- `identities/coordination/wallet-coordinator.ts` - Wallet coordination
- `identities/errors/identity-errors.ts` - Identity-specific errors
- `identities/facades/credit-operations.ts` - Credit transfers
- `identities/facades/identity-creator.ts` - Identity creation
- `identities/facades/identity-discovery.ts` - Identity discovery
- `identities/facades/identity-fetcher.ts` - Identity fetching
- `identities/facades/identity-updater.ts` - Identity updates
- `identities/utils/identity-logger.ts` - Logging utilities
- `identities/utils/wasm-worker-runner.ts` - Worker runner

### Step 2: Copy utils/ directory (3 files)
```bash
# Copy utils (merge with any existing)
cp -r /Users/user/Sync/Code/Dash/platform-feat-js-evo-sdk-identities/packages/js-evo-sdk/src/utils/* \
      /Users/user/Sync/Code/Dash/platform-v3.0-dev/packages/js-evo-sdk/src/utils/
```

Files:
- `utils/dapi-client-wrapper.ts` - DAPI client wrapper
- `utils/logger.ts` - SDK logger
- `utils/wasm-operation-queue.ts` - WASM operation queue

### Step 3: Copy types/ directory (1 file)
```bash
# Copy types (merge with any existing)
cp -r /Users/user/Sync/Code/Dash/platform-feat-js-evo-sdk-identities/packages/js-evo-sdk/src/types/* \
      /Users/user/Sync/Code/Dash/platform-v3.0-dev/packages/js-evo-sdk/src/types/
```

Files:
- `types/index.ts` - Type definitions

### Step 4: Copy base error and util files
```bash
# Copy errors.ts and util.ts
cp /Users/user/Sync/Code/Dash/platform-feat-js-evo-sdk-identities/packages/js-evo-sdk/src/errors.ts \
   /Users/user/Sync/Code/Dash/platform-v3.0-dev/packages/js-evo-sdk/src/
cp /Users/user/Sync/Code/Dash/platform-feat-js-evo-sdk-identities/packages/js-evo-sdk/src/util.ts \
   /Users/user/Sync/Code/Dash/platform-v3.0-dev/packages/js-evo-sdk/src/
```

### Step 5: Copy workers/ directory (11 files)
```bash
# Copy workers directory
cp -r /Users/user/Sync/Code/Dash/platform-feat-js-evo-sdk-identities/packages/js-evo-sdk/workers \
      /Users/user/Sync/Code/Dash/platform-v3.0-dev/packages/js-evo-sdk/
```

Files:
- `workers/wasm-operations.js` - Main WASM operations
- `workers/web-worker.js` - Web worker entry
- `workers/operations/index.js` - Operations index
- `workers/operations/identity-create.js` - Identity create operation
- `workers/operations/identity-topup.js` - Identity topup operation
- `workers/operations/identity-fetch.js` - Identity fetch operation
- `workers/operations/identity-fetch-with-proof.js` - Fetch with proof
- `workers/operations/identity-fetch-unproved.js` - Unproved fetch
- `workers/operations/identity-discover.js` - Identity discovery
- `workers/operations/identity-get-keys.js` - Get identity keys
- `workers/operations/proof-helper.js` - Proof utilities

### Step 6: Copy relevant tests
```bash
# Copy identity-related tests
cp -r /Users/user/Sync/Code/Dash/platform-feat-js-evo-sdk-identities/packages/js-evo-sdk/tests/unit/coordination \
      /Users/user/Sync/Code/Dash/platform-v3.0-dev/packages/js-evo-sdk/tests/unit/ 2>/dev/null || mkdir -p /Users/user/Sync/Code/Dash/platform-v3.0-dev/packages/js-evo-sdk/tests/unit && \
      cp -r /Users/user/Sync/Code/Dash/platform-feat-js-evo-sdk-identities/packages/js-evo-sdk/tests/unit/coordination \
            /Users/user/Sync/Code/Dash/platform-v3.0-dev/packages/js-evo-sdk/tests/unit/
```

### Step 7: Update package.json dependencies
May need to add these dependencies to v3.0-dev package.json:
- `@dashevo/transaction-finder` (workspace dependency)
- `@dashevo/dash-rpc-client` (workspace dependency, devDependency)

---

## Verification Checklist

- [ ] wasm-sdk builds: `./scripts/build.sh && node ./scripts/bundle.cjs`
- [ ] js-evo-sdk builds: `npm install && npm run build`
- [ ] Unit tests pass: `npm test`
- [ ] Demo app loads in browser
- [ ] Identity create works on testnet
- [ ] Identity top-up works on testnet
- [ ] DPNS resolve works
- [ ] Document queries work

---

*Generated from interview session - 2026-01-22*
