# js-evo-sdk Usage Examples

Practical code examples for common Dash Platform operations.

## Table of Contents

- [Getting Started](#getting-started)
- [Identity Operations](#identity-operations)
- [DPNS Names](#dpns-names)
- [Documents](#documents)
- [DashPay](#dashpay)
- [Tokens](#tokens)
- [Error Handling](#error-handling)
- [CLI Demo](#cli-demo)

---

## Getting Started

### Basic Setup

```typescript
import { EvoSDK } from '@dashevo/evo-sdk';

// Create and connect to testnet
const sdk = new EvoSDK({
  network: 'testnet',
  trusted: true,
  logs: 'error',
});

await sdk.connect();
console.log('Connected to Dash Platform');
```

### Mainnet Setup

```typescript
const sdk = new EvoSDK({
  network: 'mainnet',
  trusted: true,
});
await sdk.connect();
```

### Custom Node Setup

```typescript
const sdk = new EvoSDK({
  addresses: [
    'https://node1.testnet.example.com:1443',
    'https://node2.testnet.example.com:1443',
  ],
  network: 'testnet',
});
await sdk.connect();
```

---

## Identity Operations

### Fetch an Identity

```typescript
const identityId = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk';

const identity = await sdk.identities.fetch(identityId);
console.log('Identity ID:', identity.id.toString());
console.log('Balance:', identity.balance);
```

### Create a New Identity

```typescript
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const amount = 200000; // 0.002 DASH in duffs

const result = await sdk.identities.createWithWallet(
  mnemonic,
  amount,
  {
    onProgress: (event) => {
      console.log(`[${event.phase}] ${event.message}`);
    },
  }
);

console.log('New Identity ID:', result.identityId);
console.log('Private Key WIF:', result.privateKeyWif);
// Save the private key securely!
```

### Top Up Identity Balance

```typescript
const result = await sdk.identities.topUpWithWallet(
  identityId,
  50000, // 0.0005 DASH
  mnemonic,
  {
    onProgress: (event) => {
      console.log(event.message);
    },
  }
);

console.log('New balance:', result.newBalance);
```

### Transfer Credits

```typescript
await sdk.identities.creditTransfer({
  senderId: 'sender-identity-id',
  recipientId: 'recipient-identity-id',
  amount: 10000n, // 10,000 credits
  privateKeyWif: 'cSender...PrivateKey',
});

console.log('Credits transferred successfully');
```

### Discover Identities from Wallet

```typescript
const identityIds = await sdk.identities.getIdentityIds(mnemonic);

console.log(`Found ${identityIds.length} identities:`);
for (const id of identityIds) {
  const identity = await sdk.identities.fetch(id);
  console.log(`  ${id}: ${identity.balance} credits`);
}
```

### Get Identity Balance

```typescript
const balance = await sdk.identities.balance(identityId);
console.log(`Balance: ${balance} credits (${Number(balance) / 100000000} DASH)`);
```

---

## DPNS Names

### Resolve a Name

```typescript
const name = 'alice.dash';
const identityId = await sdk.dpns.resolveName(name);

if (identityId) {
  console.log(`${name} → ${identityId}`);
} else {
  console.log(`${name} not found`);
}
```

### Check Name Availability

```typescript
const label = 'myname';
const available = await sdk.dpns.isNameAvailable(label);

if (available) {
  console.log(`${label}.dash is available!`);
} else {
  console.log(`${label}.dash is taken`);
}
```

### Register a Name

```typescript
const result = await sdk.dpns.registerName({
  label: 'myname',
  identityId: 'your-identity-id',
  privateKeyWif: 'your-private-key-wif',
});

console.log('Name registered:', result);
```

### Get Username for Identity

```typescript
const username = await sdk.dpns.username(identityId);
if (username) {
  console.log(`Identity has username: ${username}`);
}
```

### Search Usernames

```typescript
const usernames = await sdk.dpns.usernames({
  startsWith: 'ali',
  limit: 10,
});

console.log('Matching usernames:', usernames);
```

### Validate Username

```typescript
const isValid = await sdk.dpns.isValidUsername('myname');
const isContested = await sdk.dpns.isContestedUsername('dash');

console.log('Valid:', isValid);
console.log('Contested:', isContested);
```

---

## Documents

### Query Documents

```typescript
// Query DPNS domain documents
const docs = await sdk.documents.query({
  dataContractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
  documentTypeName: 'domain',
  where: [['normalizedParentDomainName', '==', 'dash']],
  orderBy: [['normalizedLabel', 'asc']],
  limit: 10,
});

docs.forEach((doc, id) => {
  if (doc) {
    console.log(id.toString(), doc.toJSON());
  }
});
```

### Get Single Document

```typescript
const doc = await sdk.documents.get(
  contractId,
  'note',
  documentId
);

if (doc) {
  const data = doc.toJSON();
  console.log('Document:', data);
}
```

### Create Document

```typescript
await sdk.documents.create({
  document: {
    $type: 'note',
    $dataContractId: contractId,
    $ownerId: identityId,
    message: 'Hello, Dash Platform!',
  },
  identityKey: identity.publicKeys[0],
  signer: mySigner,
});
```

---

## DashPay

### Get Profile

```typescript
const profile = await sdk.dashpay.getProfile(identityId);

if (profile) {
  const data = profile.toJSON();
  console.log('Display Name:', data.displayName);
  console.log('Public Message:', data.publicMessage);
  console.log('Avatar URL:', data.avatarUrl);
}
```

### Create Profile

```typescript
await sdk.dashpay.createProfile({
  identityId,
  displayName: 'Alice',
  publicMessage: 'Hello from Dash Platform!',
  avatarUrl: 'https://example.com/avatar.png',
  privateKeyWif,
});

console.log('Profile created!');
```

### Update Profile

```typescript
await sdk.dashpay.updateProfile({
  identityId,
  displayName: 'Alice Updated',
  publicMessage: 'New message!',
  privateKeyWif,
});
```

### Get Contact Requests

```typescript
// Sent requests
const sent = await sdk.dashpay.getContactRequestsSent(identityId, { limit: 50 });
console.log(`Sent ${sent.length} contact requests`);

// Received requests
const received = await sdk.dashpay.getContactRequestsReceived(identityId, { limit: 50 });
console.log(`Received ${received.length} contact requests`);
```

### Send Contact Request

```typescript
await sdk.dashpay.sendContactRequest({
  senderIdentityId: myIdentityId,
  recipientIdentityId: theirIdentityId,
  privateKeyWif,
});
```

---

## Tokens

### Get Token Balance

```typescript
const balance = await sdk.tokens.balance(identityId, tokenId);
console.log(`Token balance: ${balance}`);
```

### Get Token Supply

```typescript
const supply = await sdk.tokens.supply(tokenId);
console.log(`Total supply: ${supply}`);
```

### Transfer Tokens

```typescript
await sdk.tokens.transfer({
  fromIdentityId: myIdentityId,
  toIdentityId: recipientId,
  tokenId,
  amount: 100n,
  privateKeyWif,
});
```

---

## Error Handling

### Comprehensive Error Handling

```typescript
import { EvoSDK } from '@dashevo/evo-sdk';

async function createIdentitySafely(mnemonic: string, amount: number) {
  const sdk = new EvoSDK({ network: 'testnet' });

  try {
    await sdk.connect();

    const result = await sdk.identities.createWithWallet(mnemonic, amount, {
      onProgress: (e) => console.log(e.message),
    });

    return result;

  } catch (error) {
    if (error.message.includes('Invalid mnemonic')) {
      console.error('The mnemonic phrase is invalid');
    } else if (error.message.includes('Insufficient')) {
      console.error('Not enough DASH in wallet');
    } else if (error.message.includes('timeout')) {
      console.error('Network timeout - try again later');
    } else {
      console.error('Unexpected error:', error.message);
    }
    throw error;
  }
}
```

### Retry Logic

```typescript
async function fetchWithRetry(sdk: EvoSDK, identityId: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sdk.identities.fetch(identityId);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.log(`Attempt ${attempt} failed, retrying...`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}
```

---

## CLI Demo

The SDK includes a CLI demo. Run it with:

```bash
yarn demo:cli --help
```

### Identity Commands

```bash
# Discover identities from wallet
yarn demo:cli identity discover --mnemonic "your twelve word mnemonic phrase here"

# Get identity info
yarn demo:cli identity get --id 5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk

# Create new identity
yarn demo:cli identity create --mnemonic "your mnemonic" --amount 200000
```

### DPNS Commands

```bash
# Resolve a name
yarn demo:cli dpns resolve --name alice.dash

# Check availability
yarn demo:cli dpns available --name myname

# Search names
yarn demo:cli dpns search --prefix ali
```

### Full Onboarding

```bash
# Complete onboarding: create identity + register name + create profile
yarn demo:cli onboard \
  --mnemonic "your twelve word mnemonic" \
  --name myname \
  --display-name "My Display Name" \
  --amount 200000
```

---

## Browser Usage

### With Webpack/Bundler

```typescript
import { EvoSDK } from '@dashevo/evo-sdk';

async function init() {
  const sdk = new EvoSDK({
    network: 'testnet',
    trusted: true,
  });

  await sdk.connect();

  // Now use the SDK
  const identity = await sdk.identities.fetch(id);
}

init().catch(console.error);
```

### Buffer Polyfill

Some bundlers may need a Buffer polyfill:

```typescript
// Add before using SDK
if (typeof window !== 'undefined' && !window.Buffer) {
  window.Buffer = require('buffer/').Buffer;
}
```

---

## Advanced Usage

### Custom WASM SDK Instance

```typescript
import init, * as wasmSdk from '@dashevo/wasm-sdk';

// Initialize WASM manually
await init();
const builder = wasmSdk.WasmSdkBuilder.testnetTrusted();
const wasm = builder.build();

// Create EvoSDK from WASM
const sdk = EvoSDK.fromWasm(wasm);
```

### Progress Tracking with UI

```typescript
interface ProgressState {
  phase: string;
  message: string;
  progress?: number;
}

function IdentityCreator() {
  const [state, setState] = useState<ProgressState | null>(null);

  async function create() {
    await sdk.identities.createWithWallet(mnemonic, amount, {
      onProgress: (event) => {
        setState({
          phase: event.phase,
          message: event.message,
          progress: event.progress,
        });
      },
    });
  }

  return (
    <div>
      {state && (
        <div>
          <h3>{state.phase}</h3>
          <p>{state.message}</p>
          {state.progress && <progress value={state.progress} max={100} />}
        </div>
      )}
      <button onClick={create}>Create Identity</button>
    </div>
  );
}
```

---

## Common Patterns

### Singleton SDK Instance

```typescript
// sdk-instance.ts
import { EvoSDK } from '@dashevo/evo-sdk';

let sdk: EvoSDK | null = null;

export async function getSDK(): Promise<EvoSDK> {
  if (!sdk) {
    sdk = new EvoSDK({
      network: 'testnet',
      trusted: true,
    });
    await sdk.connect();
  }
  return sdk;
}
```

### Caching Identity Data

```typescript
const identityCache = new Map<string, any>();

async function getCachedIdentity(sdk: EvoSDK, id: string) {
  if (identityCache.has(id)) {
    return identityCache.get(id);
  }

  const identity = await sdk.identities.fetch(id);
  identityCache.set(id, identity);
  return identity;
}
```

---

## Related Documentation

- [API Reference](./API.md)
- [Testing Guide](../TESTING.md)
- [Identity Architecture](../IDENTITY_ARCHITECTURE.md)
