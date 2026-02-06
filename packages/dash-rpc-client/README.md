# @dashevo/dash-rpc-client

Simple RPC client for Dash Core nodes on testnet and mainnet.

## Features

- TypeScript-first with full type definitions
- Supports testnet and mainnet networks
- Low-level RPC access via `DashRpcClient`
- High-level transaction broadcasting via `TransactionBroadcaster`
- Wallet-specific endpoint support
- Comprehensive error handling

## Installation

```bash
npm install @dashevo/dash-rpc-client
```

## Prerequisites

You must have a Dash Core node running with RPC enabled:

### Testnet Node Setup

1. Install Dash Core from https://dash.org/downloads
2. Configure `dash.conf`:
```conf
testnet=1
server=1
rpcuser=dashrpc
rpcpassword=your_secure_password
rpcallowip=127.0.0.1
rpcport=19998
```

3. Start Dash Core:
```bash
dashd -testnet
```

4. Create/load wallet:
```bash
dash-cli -testnet createwallet "test_wallet"
# or load existing wallet
dash-cli -testnet loadwallet "test_wallet"
```

### Mainnet Node Setup

Same as testnet, but remove `testnet=1` and use port `9998`.

## Quick Start

### Basic RPC Client

```typescript
import { DashRpcClient } from '@dashevo/dash-rpc-client';

const client = new DashRpcClient({
  network: 'testnet',
  url: 'http://localhost:19998',
  user: 'dashrpc',
  pass: 'your_secure_password',
  wallet: 'test_wallet'  // optional
});

// Test connection
const connected = await client.testConnection();
console.log('Connected:', connected);

// Get blockchain info
const height = await client.getBlockCount();
console.log('Current height:', height);

// Get wallet balance
const balance = await client.getBalance();
console.log('Balance:', balance, 'DASH');
```

### Transaction Broadcasting

```typescript
import { DashRpcClient, TransactionBroadcaster } from '@dashevo/dash-rpc-client';

const client = new DashRpcClient({
  network: 'testnet',
  url: 'http://localhost:19998',
  user: 'dashrpc',
  pass: 'your_secure_password',
  wallet: 'test_wallet'
});

const broadcaster = new TransactionBroadcaster(client);

// Simple send
const result = await broadcaster.sendToAddress(
  'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy',  // destination
  0.001  // amount in DASH
);

console.log('Transaction sent:', result.txid);
```

## API Reference

### DashRpcClient

Main RPC client class.

#### Constructor

```typescript
new DashRpcClient(config: RpcClientConfig)
```

**Config options:**
- `network`: `'testnet' | 'mainnet'` (required)
- `url`: RPC endpoint URL (required)
- `user`: RPC username (required)
- `pass`: RPC password (required)
- `wallet`: Wallet name for wallet-specific calls (optional)
- `timeout`: Connection timeout in ms (default: 10000)

#### Low-Level Methods

**call(method, params)**
```typescript
// Generic RPC call
const result = await client.call('getblockcount');
const txRaw = await client.call('getrawtransaction', ['txid', true]);
```

**callWallet(method, params)**
```typescript
// Wallet-specific RPC call (requires wallet in config)
const balance = await client.callWallet('getbalance');
```

#### Blockchain Methods

```typescript
// Get current blockchain height
await client.getBlockCount(): Promise<number>

// Get block hash by height
await client.getBlockHash(height: number): Promise<string>

// Get block info
await client.getBlock(hash: string): Promise<BlockInfo>

// Get raw transaction
await client.getRawTransaction(txid: string, verbose?: boolean): Promise<any>

// Get network info
await client.getNetworkInfo(): Promise<NetworkInfo>
```

#### Wallet Methods

```typescript
// Get new receiving address
await client.getNewAddress(label?: string, addressType?: string): Promise<string>

// Get wallet balance
await client.getBalance(): Promise<number>

// List unspent outputs
await client.listUnspent(
  minconf?: number,
  maxconf?: number,
  addresses?: string[]
): Promise<UTXO[]>

// Get wallet info
await client.getWalletInfo(): Promise<WalletInfo>

// List loaded wallets
await client.listWallets(): Promise<string[]>
```

#### Transaction Methods

```typescript
// Create raw transaction
await client.createRawTransaction(
  inputs: Array<{txid: string, vout: number}>,
  outputs: Record<string, number>
): Promise<string>

// Sign raw transaction
await client.signRawTransactionWithWallet(hexstring: string): Promise<{
  hex: string;
  complete: boolean;
}>

// Broadcast raw transaction
await client.sendRawTransaction(hexstring: string): Promise<string>

// Simple send
await client.sendToAddress(
  address: string,
  amount: number,
  comment?: string
): Promise<string>
```

#### Utility Methods

```typescript
// Test RPC connection
await client.testConnection(): Promise<boolean>

// Get config (without password)
client.getConfig(): Omit<RpcClientConfig, 'pass'>
```

### TransactionBroadcaster

High-level transaction management.

#### Constructor

```typescript
new TransactionBroadcaster(client: DashRpcClient)
```

#### Methods

```typescript
// Simple send (uses wallet RPC)
await broadcaster.sendToAddress(
  address: string,
  amount: number,
  comment?: string
): Promise<BroadcastResult>

// List UTXOs
await broadcaster.listUnspent(
  minconf?: number,
  maxconf?: number,
  addresses?: string[]
): Promise<UTXO[]>

// Create raw transaction
await broadcaster.createRawTransaction(
  inputs: TransactionInput[],
  outputs: TransactionOutputs
): Promise<string>

// Sign transaction
await broadcaster.signTransaction(rawTx: string): Promise<string>

// Broadcast transaction
await broadcaster.broadcast(signedTx: string): Promise<string>

// Consolidate UTXOs (useful for testing)
await broadcaster.consolidateUTXOs(
  utxos: UTXO[],
  toAddress: string,
  feePerKb?: number
): Promise<BroadcastResult>

// Get wallet balance
await broadcaster.getBalance(): Promise<number>

// Get new address
await broadcaster.getNewAddress(label?: string): Promise<string>
```

## Usage Examples

### Environment Configuration

Create `.env` file:
```bash
TESTNET_RPC_URL=http://localhost:19998
TESTNET_RPC_USER=dashrpc
TESTNET_RPC_PASS=your_secure_password
TESTNET_WALLET=test_wallet
```

Load in code:
```typescript
import dotenv from 'dotenv';
dotenv.config();

const client = new DashRpcClient({
  network: 'testnet',
  url: process.env.TESTNET_RPC_URL!,
  user: process.env.TESTNET_RPC_USER!,
  pass: process.env.TESTNET_RPC_PASS!,
  wallet: process.env.TESTNET_WALLET,
});
```

### Check Connection and Balance

```typescript
const client = new DashRpcClient({...});

// Test connection
if (!await client.testConnection()) {
  console.error('Cannot connect to Dash Core');
  process.exit(1);
}

// Get info
const height = await client.getBlockCount();
const balance = await client.getBalance();
const wallets = await client.listWallets();

console.log(`Connected to testnet at height ${height}`);
console.log(`Loaded wallets: ${wallets.join(', ')}`);
console.log(`Balance: ${balance} DASH`);
```

### Send Transaction and Monitor

```typescript
import { DashRpcClient, TransactionBroadcaster } from '@dashevo/dash-rpc-client';
import { PaymentMonitor } from '@dashevo/payment-monitor';

// Setup RPC client
const client = new DashRpcClient({
  network: 'testnet',
  url: 'http://localhost:19998',
  user: 'dashrpc',
  pass: 'password',
  wallet: 'test_wallet'
});

const broadcaster = new TransactionBroadcaster(client);

// Setup payment monitor
const monitor = new PaymentMonitor({
  network: 'testnet'
});

// Generate address to monitor
const address = await broadcaster.getNewAddress();
console.log('Monitoring address:', address);

// Start monitoring
await monitor.watchAddresses(address, {
  onTransaction: (tx) => console.log('Transaction:', tx.txid),
  onInstantLock: (lock) => console.log('InstantLocked in', lock.latency, 'ms'),
  onChainLock: (cl) => console.log('ChainLocked at height', cl.blockHeight)
});

// Send transaction
const result = await broadcaster.sendToAddress(address, 0.001);
console.log('Sent transaction:', result.txid);

// Wait for confirmations...
```

### Advanced: Manual Transaction Building

```typescript
const broadcaster = new TransactionBroadcaster(client);

// 1. Get UTXOs
const utxos = await broadcaster.listUnspent(0, 9999999);
console.log('Available UTXOs:', utxos.length);

// 2. Select inputs (use first UTXO for example)
const inputs = [{
  txid: utxos[0].txid,
  vout: utxos[0].vout
}];

// 3. Create outputs
const toAddress = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
const sendAmount = 0.001;  // DASH
const fee = 0.00001;  // DASH
const change = utxos[0].amount - sendAmount - fee;

const outputs = {
  [toAddress]: sendAmount,
  [utxos[0].address]: change  // change back to self
};

// 4. Create, sign, broadcast
const rawTx = await broadcaster.createRawTransaction(inputs, outputs);
const signedTx = await broadcaster.signTransaction(rawTx);
const txid = await broadcaster.broadcast(signedTx);

console.log('Transaction broadcast:', txid);
```

### Testing Helper: UTXO Consolidation

```typescript
// Consolidate all UTXOs for an address into a single UTXO
const broadcaster = new TransactionBroadcaster(client);

const testAddress = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
const utxos = await broadcaster.listUnspent(0, 9999999, [testAddress]);

if (utxos.length > 1) {
  console.log(`Consolidating ${utxos.length} UTXOs...`);

  const result = await broadcaster.consolidateUTXOs(
    utxos,
    testAddress,  // send back to same address
    0.00001  // fee per KB
  );

  console.log('Consolidated into tx:', result.txid);
  console.log('Total amount:', result.amount, 'DASH');
}
```

## Error Handling

```typescript
import { DashRpcClient } from '@dashevo/dash-rpc-client';

const client = new DashRpcClient({...});

try {
  const balance = await client.getBalance();
  console.log('Balance:', balance);
} catch (error) {
  if (error.message.includes('RPC Error')) {
    // RPC-specific error (e.g., wallet not loaded)
    console.error('RPC Error:', error.message);
  } else if (error.message.includes('No response from server')) {
    // Connection error
    console.error('Cannot connect to Dash Core');
  } else {
    // Other errors
    console.error('Unexpected error:', error.message);
  }
}
```

## TypeScript Types

```typescript
import type {
  Network,
  RpcClientConfig,
  UTXO,
  TransactionInput,
  TransactionOutputs,
  BroadcastResult,
  BlockInfo,
  NetworkInfo,
  WalletInfo
} from '@dashevo/dash-rpc-client';
```

## Security Notes

- Never commit RPC credentials to version control
- Use environment variables for sensitive configuration
- Ensure RPC is only accessible from localhost
- Use strong passwords for RPC authentication
- For mainnet, use extra caution with transaction amounts

## Troubleshooting

### "Connection refused"
- Ensure Dash Core is running (`dashd` process)
- Check RPC port is correct (19998 for testnet, 9998 for mainnet)
- Verify `rpcallowip=127.0.0.1` in `dash.conf`

### "RPC Error -18: Wallet not found"
- Load wallet: `dash-cli -testnet loadwallet "wallet_name"`
- Or create wallet: `dash-cli -testnet createwallet "wallet_name"`
- Ensure wallet name matches config

### "RPC Error -5: Invalid or non-wallet transaction id"
- Transaction may not exist on this network
- Verify you're on correct network (testnet vs mainnet)

### "Insufficient funds"
- Get testnet coins from faucet: https://testnet-faucet.dash.org
- Check balance: `dash-cli -testnet getbalance`

## License

MIT

## Contributing

Part of the Dash Platform SDK ecosystem. See main repository for contributing guidelines.
