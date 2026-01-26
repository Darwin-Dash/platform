# js-evo-sdk API Reference

Complete API reference for the js-evo-sdk package.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [EvoSDK Class](#evosdk-class)
- [Identities Facade](#identities-facade)
- [DPNS Facade](#dpns-facade)
- [Documents Facade](#documents-facade)
- [Contracts Facade](#contracts-facade)
- [Tokens Facade](#tokens-facade)
- [DashPay Facade](#dashpay-facade)
- [System Facade](#system-facade)
- [Epoch Facade](#epoch-facade)
- [Protocol Facade](#protocol-facade)
- [Addresses Facade](#addresses-facade)
- [Group Facade](#group-facade)
- [Voting Facade](#voting-facade)
- [Error Handling](#error-handling)
- [Type Definitions](#type-definitions)

---

## Installation

```bash
npm install @dashevo/evo-sdk
# or
yarn add @dashevo/evo-sdk
```

---

## Quick Start

```typescript
import { EvoSDK } from '@dashevo/evo-sdk';

// Create SDK instance
const sdk = new EvoSDK({
  network: 'testnet',
  trusted: true,
  logs: 'error',
});

// Connect to Platform
await sdk.connect();

// Fetch an identity
const identity = await sdk.identities.fetch('5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk');

// Resolve a DPNS name
const identityId = await sdk.dpns.resolveName('alice.dash');
```

---

## EvoSDK Class

Main entry point for all SDK operations.

### Constructor

```typescript
new EvoSDK(options?: EvoSDKOptions)
```

### Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `network` | `'testnet' \| 'mainnet' \| 'local'` | `'testnet'` | Network to connect to |
| `trusted` | `boolean` | `false` | Use trusted mode for faster queries |
| `logs` | `string` | - | Logging level: 'off', 'error', 'warn', 'info', 'debug', 'trace' |
| `addresses` | `string[]` | - | Custom masternode addresses (overrides network) |
| `proofs` | `boolean` | - | Request proofs with responses |
| `settings.connectTimeoutMs` | `number` | - | Connection timeout in milliseconds |
| `settings.timeoutMs` | `number` | - | Request timeout in milliseconds |
| `settings.retries` | `number` | - | Number of retries for failed requests |

### Methods

#### `connect(): Promise<void>`
Establish connection to Dash Platform.

```typescript
await sdk.connect();
```

#### `isConnected: boolean`
Check if SDK is connected.

```typescript
if (sdk.isConnected) {
  // SDK is ready
}
```

#### `networkConfig: { network: string }`
Get current network configuration.

```typescript
const { network } = sdk.networkConfig;
```

#### `static fromWasm(wasmSdk): EvoSDK`
Create SDK from an existing WASM SDK instance.

```typescript
const sdk = EvoSDK.fromWasm(existingWasmSdk);
```

### Facades

| Property | Type | Description |
|----------|------|-------------|
| `identities` | `IdentitiesFacade` | Identity operations |
| `dpns` | `DpnsFacade` | DPNS name operations |
| `documents` | `DocumentsFacade` | Document operations |
| `contracts` | `ContractsFacade` | Data contract operations |
| `tokens` | `TokensFacade` | Token operations |
| `dashpay` | `DashPayFacade` | DashPay profiles and contacts |
| `system` | `SystemFacade` | System information |
| `epoch` | `EpochFacade` | Epoch information |
| `protocol` | `ProtocolFacade` | Protocol information |
| `addresses` | `AddressesFacade` | Address-based operations |
| `group` | `GroupFacade` | Group operations |
| `voting` | `VotingFacade` | Voting operations |

---

## Identities Facade

Access via `sdk.identities`.

### Read Operations

#### `fetch(identityId: string): Promise<Identity>`
Fetch identity by ID.

```typescript
const identity = await sdk.identities.fetch('5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk');
```

#### `get(identityId: string): Promise<Identity>`
Alias for `fetch()`.

#### `fetchWithProof(identityId: string): Promise<IdentityWithProof>`
Fetch identity with cryptographic proof.

```typescript
const { identity, proof } = await sdk.identities.fetchWithProof(identityId);
```

#### `fetchUnproved(identityId: string): Promise<Identity>`
Fast fetch without proof verification.

#### `getKeys(args: GetKeysArgs): Promise<Keys>`
Get identity public keys.

```typescript
const keys = await sdk.identities.getKeys({
  identityId,
  keyIds: [0, 1, 2],  // Optional: specific key IDs
});
```

#### `getKey(identityId: string, keyId: number): Promise<Key>`
Get specific identity key.

#### `listKeys(identityId: string, limit?: number, offset?: number): Promise<Key[]>`
List identity keys with pagination.

#### `balance(identityId: string): Promise<bigint>`
Get identity credit balance.

```typescript
const balance = await sdk.identities.balance(identityId);
console.log(`Balance: ${balance} credits`);
```

#### `nonce(identityId: string): Promise<number>`
Get identity nonce.

### Write Operations

#### `createWithWallet(mnemonic: string, amount: number, options?): Promise<IdentityCreationResult>`
Create a new identity using a wallet mnemonic.

```typescript
const result = await sdk.identities.createWithWallet(
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  200000,  // Amount in duffs (minimum 200,000)
  {
    startHeight: 1000000,  // Optional: start scanning from height
    onProgress: (event) => {
      console.log(`[${event.phase}] ${event.message}`);
    },
  }
);

console.log('Identity ID:', result.identityId);
console.log('Private Key WIF:', result.privateKeyWif);
```

**Progress Phases:**
- `wallet_setup` - Setting up wallet and DAPI connection
- `identity_discovery` - Discovering existing identities
- `transaction_creation` - Creating asset lock transaction
- `transaction_broadcast` - Broadcasting to network
- `confirmation_wait` - Waiting for confirmation
- `identity_creation` - Submitting to Platform

**Minimum Amount:** 200,000 duffs (0.002 DASH)

#### `topUpWithWallet(identityId: string, amount: number, mnemonic: string, options?): Promise<IdentityTopUpResult>`
Top up an existing identity's credit balance.

```typescript
const result = await sdk.identities.topUpWithWallet(
  identityId,
  50000,  // Amount in duffs
  mnemonic,
  {
    onProgress: (event) => console.log(event.message),
  }
);
```

**Minimum Amount:** 100,000 duffs (0.001 DASH)

#### `creditTransfer(args: CreditTransferArgs): Promise<void>`
Transfer credits between identities.

```typescript
await sdk.identities.creditTransfer({
  senderId: 'sender-identity-id',
  recipientId: 'recipient-identity-id',
  amount: 100000,  // Credits to transfer
  privateKeyWif: 'sender-private-key-wif',
  keyId: 0,  // Optional: specific key to use
});
```

#### `creditWithdrawal(args: CreditWithdrawalArgs): Promise<void>`
Withdraw credits to a blockchain address.

```typescript
await sdk.identities.creditWithdrawal({
  identityId: 'your-identity-id',
  toAddress: 'yXdMp...', // Dash address
  amount: 50000,
  privateKeyWif: 'your-private-key-wif',
  coreFeePerByte: 1,  // Optional
});
```

### Discovery Operations

#### `discoverByHash(publicKeyHashHex: string): Promise<Identity | null>`
Discover identity by public key hash.

```typescript
const identity = await sdk.identities.discoverByHash('a1b2c3d4e5f6...');
```

#### `discoverByHashBatch(hashes: string[]): Promise<Map<string, Identity>>`
Batch discover identities.

#### `getIdentityIds(mnemonic: string, options?): Promise<string[]>`
Get all identity IDs associated with a wallet.

```typescript
const identityIds = await sdk.identities.getIdentityIds(mnemonic, {
  startHeight: 1000000,
});
```

### UTXO Operations

#### `findSpendableUtxos(mnemonic: string, options?): Promise<SpendableUTXOResult>`
Find spendable UTXOs for identity operations.

```typescript
const { utxos, totalValue } = await sdk.identities.findSpendableUtxos(mnemonic, {
  minimumAmount: 200000,
  onProgress: (event) => console.log(event),
});
```

---

## DPNS Facade

Access via `sdk.dpns`. Dash Platform Naming Service operations.

### Query Operations

#### `resolveName(name: string): Promise<string | undefined>`
Resolve a DPNS name to an identity ID.

```typescript
const identityId = await sdk.dpns.resolveName('alice.dash');
if (identityId) {
  console.log('Found:', identityId);
}
```

#### `isNameAvailable(label: string): Promise<boolean>`
Check if a name is available for registration.

```typescript
const available = await sdk.dpns.isNameAvailable('myname');
if (available) {
  // Name can be registered
}
```

#### `username(identityId: IdentifierLike): Promise<string | undefined>`
Get the primary username for an identity.

```typescript
const username = await sdk.dpns.username(identityId);
```

#### `usernames(query: DpnsUsernamesQuery): Promise<string[]>`
Query usernames matching criteria.

#### `getUsernameByName(username: string): Promise<DpnsUsernameInfo | undefined>`
Get detailed username information.

### Validation

#### `isValidUsername(label: string): Promise<boolean>`
Check if a username is valid.

```typescript
const valid = await sdk.dpns.isValidUsername('myname');
```

#### `isContestedUsername(label: string): Promise<boolean>`
Check if a username is contested (requires voting).

#### `convertToHomographSafe(input: string): Promise<string>`
Convert string to homograph-safe format.

### Registration

#### `registerName(options: DpnsRegisterNameOptions): Promise<RegisterDpnsNameResult>`
Register a new DPNS name.

```typescript
const result = await sdk.dpns.registerName({
  label: 'myname',
  identityId: 'your-identity-id',
  privateKeyWif: 'your-private-key-wif',
});
```

---

## Documents Facade

Access via `sdk.documents`. Document CRUD operations.

### Query

#### `query(query: DocumentsQuery): Promise<Map<Identifier, Document | undefined>>`
Query documents matching criteria.

```typescript
const docs = await sdk.documents.query({
  dataContractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
  documentTypeName: 'note',
  where: [['authorId', '==', 'some-identity-id']],
  orderBy: [['createdAt', 'desc']],
  limit: 10,
});

docs.forEach((doc, id) => {
  console.log(id.toString(), doc);
});
```

#### `queryWithProof(query: DocumentsQuery): Promise<DocumentsWithProof>`
Query with proof verification.

#### `get(contractId, type, documentId): Promise<Document | undefined>`
Get a single document by ID.

```typescript
const doc = await sdk.documents.get(
  contractId,
  'note',
  documentId
);
```

#### `getWithProof(contractId, type, documentId): Promise<DocumentWithProof>`
Get document with proof.

### Write Operations

#### `create(options: CreateDocumentOptions): Promise<void>`
Create a new document.

```typescript
await sdk.documents.create({
  document: myDocument,
  identityKey: identity.publicKeys[0],
  signer: mySigner,
});
```

#### `update(options: UpdateDocumentOptions): Promise<void>`
Update an existing document.

#### `delete(options: DeleteDocumentOptions): Promise<void>`
Delete a document.

---

## Contracts Facade

Access via `sdk.contracts`. Data contract operations.

#### `get(contractId: string): Promise<DataContract | null>`
Fetch a data contract by ID.

```typescript
const contract = await sdk.contracts.get('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec');
console.log('Document types:', Object.keys(contract.documents));
```

#### `getWithProof(contractId: string): Promise<DataContractWithProof>`
Fetch contract with proof.

#### `getHistory(contractId: string): Promise<DataContract[]>`
Get contract version history.

---

## Tokens Facade

Access via `sdk.tokens`. Token operations.

#### `balance(identityId: string, tokenId: string): Promise<bigint>`
Get token balance for an identity.

```typescript
const balance = await sdk.tokens.balance(identityId, tokenId);
```

#### `supply(tokenId: string): Promise<bigint>`
Get total token supply.

#### `transfer(options: TokenTransferOptions): Promise<void>`
Transfer tokens between identities.

---

## DashPay Facade

Access via `sdk.dashpay`. DashPay profiles and contacts.

### Profiles

#### `getProfile(identityId: string): Promise<Document | null>`
Get DashPay profile for an identity.

```typescript
const profile = await sdk.dashpay.getProfile(identityId);
if (profile) {
  console.log('Display Name:', profile.data.displayName);
}
```

#### `createProfile(options: CreateProfileOptions): Promise<void>`
Create a DashPay profile.

```typescript
await sdk.dashpay.createProfile({
  identityId,
  displayName: 'Alice',
  publicMessage: 'Hello!',
  privateKeyWif,
});
```

#### `updateProfile(options: UpdateProfileOptions): Promise<void>`
Update an existing profile.

### Contacts

#### `getContactRequestsSent(identityId: string, options?): Promise<Document[]>`
Get contact requests sent by an identity.

#### `getContactRequestsReceived(identityId: string, options?): Promise<Document[]>`
Get contact requests received by an identity.

#### `sendContactRequest(options: ContactRequestOptions): Promise<void>`
Send a contact request.

---

## System Facade

Access via `sdk.system`. System information.

#### `status(): Promise<SystemStatus>`
Get platform status.

```typescript
const status = await sdk.system.status();
console.log('Block height:', status.height);
```

---

## Epoch Facade

Access via `sdk.epoch`. Epoch information.

#### `current(): Promise<Epoch>`
Get current epoch information.

```typescript
const epoch = await sdk.epoch.current();
console.log('Current epoch:', epoch.epochNumber);
```

#### `at(epochNumber: number): Promise<Epoch>`
Get specific epoch by number.

---

## Protocol Facade

Access via `sdk.protocol`. Protocol information.

#### `version(): Promise<number>`
Get current protocol version.

```typescript
const version = await sdk.protocol.version();
```

---

## Addresses Facade

Access via `sdk.addresses`. Address-based queries.

#### `identityByPaymentAddress(address: string): Promise<Identity | null>`
Find identity by payment address.

---

## Error Handling

### Error Types

```typescript
import {
  IdentityNotFoundError,
  InsufficientBalanceError,
  InvalidMnemonicError,
  NetworkError,
  TransactionError,
  ValidationError,
} from '@dashevo/evo-sdk';
```

### Error Handling Example

```typescript
try {
  await sdk.identities.createWithWallet(mnemonic, amount);
} catch (error) {
  if (error instanceof InvalidMnemonicError) {
    console.error('Invalid mnemonic format');
  } else if (error instanceof InsufficientBalanceError) {
    console.error('Not enough DASH in wallet');
  } else if (error instanceof NetworkError) {
    console.error('Network connection failed');
  } else {
    throw error;
  }
}
```

---

## Type Definitions

### IdentityCreationResult

```typescript
interface IdentityCreationResult {
  identityId: string;
  privateKeyWif: string;
  identity: Identity;
}
```

### IdentityTopUpResult

```typescript
interface IdentityTopUpResult {
  identityId: string;
  newBalance: bigint;
}
```

### DocumentsQuery

```typescript
interface DocumentsQuery {
  dataContractId: string;
  documentTypeName: string;
  where?: WhereClause[];
  orderBy?: OrderByClause[];
  limit?: number;
  startAt?: number;
  startAfter?: Identifier;
}
```

### OperationEvent

```typescript
interface OperationEvent {
  phase: string;
  message: string;
  progress?: number;
  data?: any;
}
```

---

## Network Configuration

### Testnet (Default)

```typescript
const sdk = new EvoSDK({ network: 'testnet' });
```

### Mainnet

```typescript
const sdk = new EvoSDK({ network: 'mainnet' });
```

### Local Development

```typescript
const sdk = new EvoSDK({ network: 'local' });
```

### Custom Nodes

```typescript
const sdk = new EvoSDK({
  addresses: ['https://node1.example.com:1443', 'https://node2.example.com:1443'],
  network: 'testnet',  // For quorum prefetch
});
```

---

## Best Practices

### 1. Always Call connect()

```typescript
const sdk = new EvoSDK({ network: 'testnet' });
await sdk.connect();  // Required before any operations
```

### 2. Use Progress Callbacks

For long-running operations like identity creation:

```typescript
await sdk.identities.createWithWallet(mnemonic, amount, {
  onProgress: (event) => {
    updateUI(event.phase, event.message);
  },
});
```

### 3. Handle Errors Appropriately

```typescript
try {
  const identity = await sdk.identities.fetch(id);
} catch (error) {
  if (error.message.includes('not found')) {
    // Identity doesn't exist
  } else {
    // Unexpected error
    throw error;
  }
}
```

### 4. Use Trusted Mode for Performance

```typescript
const sdk = new EvoSDK({
  network: 'testnet',
  trusted: true,  // Faster queries without full verification
});
```

---

## Related Documentation

- [IDENTITY_ARCHITECTURE.md](../IDENTITY_ARCHITECTURE.md) - Identity operations architecture
- [TESTING.md](../TESTING.md) - Testing guide
- [INTEGRATION_TESTS.md](../INTEGRATION_TESTS.md) - Integration test guide
