# @dashevo/evo-sdk

JavaScript SDK for Dash Platform - build decentralized applications on the Dash network.

## Features

- **Identities** - Create, manage, and discover Dash Platform identities
- **DPNS** - Register and resolve human-readable names on Dash Platform
- **Documents** - Store and query application data
- **DashPay** - Social payments with profiles and contacts
- **Tokens** - Query and transfer tokens
- **Cross-Platform** - Works in Node.js and browsers

## Installation

```bash
npm install @dashevo/evo-sdk
# or
yarn add @dashevo/evo-sdk
```

## Quick Start

```typescript
import { EvoSDK } from '@dashevo/evo-sdk';

// Create SDK instance
const sdk = new EvoSDK({
  network: 'testnet',  // 'testnet' | 'mainnet' | 'local'
  trusted: true,       // Use trusted mode for faster queries
});

// Connect to Dash Platform
await sdk.connect();

// Fetch an identity
const identity = await sdk.identities.fetch('5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk');
console.log('Balance:', identity.balance);

// Resolve a DPNS name
const identityId = await sdk.dpns.resolveName('alice.dash');
console.log('alice.dash →', identityId);
```

## Core Operations

### Create an Identity

```typescript
const result = await sdk.identities.createWithWallet(
  'your twelve word mnemonic phrase here',
  200000,  // Amount in duffs (0.002 DASH)
  {
    onProgress: (event) => {
      console.log(`[${event.phase}] ${event.message}`);
    },
  }
);

console.log('Identity ID:', result.identityId);
console.log('Private Key:', result.privateKeyWif);
```

### Register a DPNS Name

```typescript
// Check availability
const available = await sdk.dpns.isNameAvailable('myname');

if (available) {
  await sdk.dpns.registerName({
    label: 'myname',
    identityId: 'your-identity-id',
    privateKeyWif: 'your-private-key-wif',
  });
}
```

### Query Documents

```typescript
const docs = await sdk.documents.query({
  dataContractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
  documentTypeName: 'domain',
  where: [['normalizedParentDomainName', '==', 'dash']],
  limit: 10,
});
```

### DashPay Profile

```typescript
// Get profile
const profile = await sdk.dashpay.getProfile(identityId);

// Create profile
await sdk.dashpay.createProfile({
  identityId,
  displayName: 'Alice',
  publicMessage: 'Hello!',
  privateKeyWif,
});
```

## Available Facades

| Facade | Description |
|--------|-------------|
| `sdk.identities` | Identity creation, management, credit operations |
| `sdk.dpns` | DPNS name registration and resolution |
| `sdk.documents` | Document CRUD operations |
| `sdk.contracts` | Data contract queries |
| `sdk.tokens` | Token balances and transfers |
| `sdk.dashpay` | DashPay profiles and contacts |
| `sdk.system` | Platform status |
| `sdk.epoch` | Epoch information |
| `sdk.protocol` | Protocol version |
| `sdk.addresses` | Address-based queries |
| `sdk.group` | Group operations |
| `sdk.voting` | Voting operations |

## CLI Demo

The SDK includes a command-line demo:

```bash
# Show help
yarn demo:cli --help

# Discover identities from wallet
yarn demo:cli identity discover --mnemonic "your mnemonic"

# Resolve DPNS name
yarn demo:cli dpns resolve --name alice.dash

# Full onboarding (create identity + register name + create profile)
yarn demo:cli onboard --mnemonic "your mnemonic" --name myname --amount 200000
```

## Configuration

### Network Options

```typescript
// Testnet (default)
new EvoSDK({ network: 'testnet' })

// Mainnet
new EvoSDK({ network: 'mainnet' })

// Local development
new EvoSDK({ network: 'local' })

// Custom nodes
new EvoSDK({
  addresses: ['https://node1.example.com:1443'],
  network: 'testnet',
})
```

### Connection Settings

```typescript
new EvoSDK({
  network: 'testnet',
  trusted: true,  // Faster queries without full verification
  logs: 'error',  // 'off' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
  settings: {
    connectTimeoutMs: 10000,
    timeoutMs: 30000,
    retries: 3,
  },
})
```

## Documentation

- [API Reference](./docs/API.md) - Complete API documentation
- [Usage Examples](./docs/EXAMPLES.md) - Practical code examples
- [Testing Guide](./TESTING.md) - How to run tests
- [Integration Tests](./INTEGRATION_TESTS.md) - Integration test documentation
- [Identity Architecture](./IDENTITY_ARCHITECTURE.md) - Identity operations architecture

## Development

### Build

```bash
yarn build
```

### Test

```bash
# Unit tests
yarn test:unit

# Integration tests (requires testnet)
yarn test:integration

# All tests
yarn test:all
```

### CLI Demo

```bash
yarn demo:cli --help
```

## Requirements

- Node.js >= 18.18
- Modern browser with WebAssembly support

## License

MIT

## Related Projects

- [Dash Platform](https://github.com/dashpay/platform) - Dash Platform monorepo
- [WASM SDK](../wasm-sdk) - WebAssembly SDK bindings
- [DAPI Client](../dapi-client) - Decentralized API client
