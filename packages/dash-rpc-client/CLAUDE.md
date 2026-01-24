# CLAUDE.md - dash-rpc-client Development Guide

## Purpose

**This package is for FUNDING addresses during testing, NOT for SDK operations.**

The `@dashevo/dash-rpc-client` provides Core RPC access to a local Dash Core node with a pre-funded wallet. It is used exclusively for:
- Sending DASH to mnemonic-derived addresses during testing
- Checking wallet balance during development
- Querying UTXOs from the Core node (as alternative to DAPI)

**CRITICAL: SDK operations (asset lock, identity creation, topup) NEVER use RPC - they ALWAYS use DAPI.**

## Available Methods

### Wallet Operations
```typescript
import { DashRpcClient } from '@dashevo/dash-rpc-client';

const rpcClient = new DashRpcClient({
  network: 'testnet',
  url: 'http://localhost:19998',
  user: 'dashrpc',
  pass: process.env.TESTNET_RPC_PASSWORD,
  wallet: 'test_wallet',  // Pre-funded wallet
});

// Check balance
const balance = await rpcClient.getBalance();

// List UTXOs
const utxos = await rpcClient.listUnspent(0, 9999999, [address]);

// Get new address
const newAddress = await rpcClient.getNewAddress('label');

// Send DASH to derived address (for funding)
const txid = await rpcClient.sendToAddress(derivedAddress, 0.001);
```

### High-Level Transaction Broadcaster
```typescript
import { TransactionBroadcaster } from '@dashevo/dash-rpc-client';

const broadcaster = new TransactionBroadcaster(rpcClient);
const result = await broadcaster.sendToAddress(address);
```

## Integration with TransactionFinder

After using RPC to fund an address, TransactionFinder detects the payment via DAPI:

```
1. RPC: rpcClient.sendToAddress(address, amount)
              ↓
2. DAPI: TransactionFinder.monitorAddresses() detects IS/CL
              ↓
3. DAPI: SDK creates asset lock
              ↓
4. DAPI: SDK creates identity
```

## Environment Variables

```bash
TESTNET_RPC_ENDPOINT=http://localhost:19998
TESTNET_RPC_USERNAME=dashrpc
TESTNET_RPC_PASSWORD=yourpassword
TESTNET_WALLET=funded_wallet  # Must already have DASH
```

## When NOT to Use This Package

- Identity creation (use SDK via DAPI)
- Identity topup (use SDK via DAPI)
- Credit transfers (use SDK via DAPI)
- Credit withdrawals (use SDK via DAPI)
- Platform state transitions (use SDK via DAPI)
- Asset lock broadcasting (use DAPI)

## When to Use This Package

- Fund addresses for testing (from pre-funded wallet)
- Verify wallet balance during development
- Query UTXOs directly from Core node (testing alternative)

---
*Last Updated: 2026-01-08*
