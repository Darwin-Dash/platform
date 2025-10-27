# Regtest Integration Testing Guide

This guide explains how to set up and run regtest integration tests for `dash-utxo-finder`.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [SSH Tunnel Setup](#ssh-tunnel-setup)
4. [Running Tests](#running-tests)
5. [Test Architecture](#test-architecture)
6. [Troubleshooting](#troubleshooting)
7. [Environment Variables](#environment-variables)

## Overview

The regtest integration tests verify the complete UTXO discovery workflow:

```
1. Derive address from mnemonic (BIP44)
   ↓
2. Send transaction via RPC to derived address
   ↓
3. Generate blocks to confirm transaction
   ↓
4. Use UTXOFinder to discover UTXO via DAPI
   ↓
5. Verify UTXO details match transaction
   ↓
6. Report timing metrics
```

### What Makes This Different from Unit Tests

- **Real Network**: Tests run against actual regtest DAPI and RPC
- **Real Transactions**: Funds are actually sent and mined on the blockchain
- **End-to-End**: Tests the complete integration from address derivation to UTXO discovery
- **Performance**: Includes timing metrics for discovery latency

## Prerequisites

### Local Requirements

- Node.js 16+ with npm or yarn
- SSH client (OpenSSH)
- `dash-utxo-finder` source code

### Remote Requirements

- Access to remote Dashmate regtest server
- SSH key authentication set up
- Docker running on remote server with Dash seed node

## SSH Tunnel Setup

### Single Tunnel (DAPI + RPC)

For most use cases, you only need one SSH tunnel since RPC commands are run via SSH directly.

```bash
# Open SSH tunnel for DAPI
ssh -L 2443:localhost:2443 ruald@10.0.0.119
```

This forwards:
- `localhost:2443` → Remote DAPI gRPC endpoint

The RPC connection is handled directly via SSH commands, so no additional tunnel is needed.

### Advanced: Separate Tunnels

If you prefer direct RPC access (optional):

```bash
# Terminal 1: DAPI tunnel
ssh -L 2443:localhost:2443 ruald@10.0.0.119

# Terminal 2: RPC tunnel (optional)
ssh -L 20002:localhost:20002 ruald@10.0.0.119
```

### Persistent Tunnel Script

Create `start-regtest-tunnels.sh`:

```bash
#!/bin/bash

# Start SSH tunnels for regtest development
SSH_SERVER="ruald@10.0.0.119"
DAPI_PORT=2443
RPC_PORT=20002

echo "Starting SSH tunnels to $SSH_SERVER..."

# Kill any existing tunnels
pkill -f "ssh.*-L.*$DAPI_PORT"
pkill -f "ssh.*-L.*$RPC_PORT"

# Start tunnels
ssh -L $DAPI_PORT:localhost:$DAPI_PORT $SSH_SERVER -N &
DAPI_PID=$!

ssh -L $RPC_PORT:localhost:$RPC_PORT $SSH_SERVER -N &
RPC_PID=$!

echo "DAPI tunnel started (PID: $DAPI_PID)"
echo "RPC tunnel started (PID: $RPC_PID)"

trap "kill $DAPI_PID $RPC_PID" EXIT

wait
```

Usage:
```bash
chmod +x start-regtest-tunnels.sh
./start-regtest-tunnels.sh
```

## Running Tests

### Quick Start

```bash
# Terminal 1: Start SSH tunnel
ssh -L 2443:localhost:2443 ruald@10.0.0.119

# Terminal 2: Run tests
cd packages/dash-utxo-finder
npm run test:regtest
```

### Test Commands

#### Full Test Suite
```bash
npm run test:regtest
```

Runs all integration tests in `__tests__/integration/regtest-utxo-discovery.test.ts`

#### Standalone Manual Test
```bash
npm run test:regtest:manual
```

Runs a standalone Node.js script (not vitest) with detailed logging and pre-flight checks.

#### Quick Smoke Test
```bash
npm run test:regtest:quick
```

Same as `test:regtest:manual` but with single transaction (faster).

#### With Custom Parameters
```bash
# Send 5 transactions, 0.1 DASH each, debug logging
NUM_TRANSACTIONS=5 TX_AMOUNT=0.1 LOG_LEVEL=debug npm run test:regtest:manual

# Custom SSH server
DASHMATE_SERVER=user@example.com npm run test:regtest:quick
```

## Test Architecture

### Integration Test File

**Location**: `__tests__/integration/regtest-utxo-discovery.test.ts`

Uses Vitest framework. Key test suites:

1. **Transaction Sending and UTXO Discovery**
   - Derives address from mnemonic
   - Sends transaction
   - Discovers UTXO via UTXOFinder
   - Verifies UTXO details match

2. **UTXO Sorting and Selection**
   - Verifies UTXOs are returned sorted by block height
   - Tests latest-first ordering

3. **Error Handling**
   - Invalid addresses
   - No UTXOs found
   - Network errors

### Standalone Test Script

**Location**: `scripts/test-regtest-utxo-finder.js`

Standalone Node.js script (not test framework). Features:

- Pre-flight checks (DAPI and RPC connectivity)
- Color-coded logging with timestamps
- Real-time progress reporting
- Summary report with timing metrics
- No test framework dependencies

### Helper Functions

**Location**: `__tests__/helpers/regtest.ts`

Key functions for regtest interaction:

```typescript
// DAPI connection
export async function connectToRegtest(address): Promise<DAPIClient>
export async function getRegtestBlockHeight(client): Promise<number>
export async function isRegtestAvailable(address): Promise<boolean>

// RPC operations (SSH + docker)
export async function sendToAddress(address, amount): Promise<string>
export async function generateBlocks(blockCount): Promise<string[]>
export async function getBlockCount(): Promise<number>
export async function getTransactionDetails(txid): Promise<any>
export async function getNewAddress(): Promise<string>
export async function waitForTransaction(txid, timeout): Promise<any>
```

## Troubleshooting

### "Cannot reach DAPI on localhost:2443"

**Problem**: SSH tunnel not active

**Solution**:
```bash
# Verify SSH connection works
ssh ruald@10.0.0.119 echo "SSH OK"

# Start tunnel
ssh -L 2443:localhost:2443 ruald@10.0.0.119
```

### "Cannot reach RPC on ruald@10.0.0.119"

**Problem**: Docker container not running or SSH issue

**Solution**:
```bash
# Check SSH access
ssh ruald@10.0.0.119

# Check Docker container
ssh ruald@10.0.0.119 docker ps | grep dashmate

# Verify dash-cli works
ssh ruald@10.0.0.119 docker exec dashmate_36324776_local_seed-core-1 dash-cli getblockcount
```

### "Failed to send transaction"

**Problem**: RPC command failed

**Solutions**:
1. Check wallet has sufficient funds
2. Verify address format is correct (testnet = y prefix)
3. Check Docker container is running: `docker ps`

### Tests Hang/Timeout

**Problem**: UTXO discovery taking too long

**Solutions**:
1. Check DAPI is responding: `netcat -v localhost 2443`
2. Verify blocks are being generated: `getblockcount` via RPC
3. Check network latency to remote server

### Port Already in Use

**Problem**: `Address already in use` error

**Solution**:
```bash
# Kill existing tunnel
pkill -f "ssh.*-L.*2443"

# Start fresh tunnel
ssh -L 2443:localhost:2443 ruald@10.0.0.119
```

## Environment Variables

### Configuration Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHMATE_SERVER` | `ruald@10.0.0.119` | SSH server address |
| `SEED_CONTAINER` | `dashmate_36324776_local_seed-core-1` | Docker container name |
| `DAPI_PORT` | `2443` | Local DAPI tunnel port |
| `RPC_PORT` | `20002` | Local RPC tunnel port |
| `NUM_TRANSACTIONS` | `3` | Number of test transactions |
| `TX_AMOUNT` | `0.05` | DASH per transaction |
| `LOG_LEVEL` | `info` | Logging: debug, info, warn, error |

### Test Skip Variables

| Variable | Effect |
|----------|--------|
| `SKIP_INTEGRATION_TESTS=true` | Skip all integration tests |
| `REGTEST_REQUIRED=true` | Fail if regtest not available |

### Examples

```bash
# Debug logging
LOG_LEVEL=debug npm run test:regtest:manual

# Many transactions for load testing
NUM_TRANSACTIONS=10 TX_AMOUNT=0.1 npm run test:regtest:manual

# Different Dashmate server
DASHMATE_SERVER=user@staging.example.com npm run test:regtest:quick

# Skip all integration tests
SKIP_INTEGRATION_TESTS=true npm test
```

## Development Workflow

### Typical Development Loop

1. **Setup** (once):
   ```bash
   # Start SSH tunnel
   ssh -L 2443:localhost:2443 ruald@10.0.0.119 &

   # Install deps
   npm install
   ```

2. **Develop**:
   ```bash
   # Make changes to src/
   npm run build
   ```

3. **Test**:
   ```bash
   # Unit tests (fast, no network)
   npm test

   # Integration tests (requires tunnel)
   npm run test:regtest
   ```

4. **Debug**:
   ```bash
   # Run standalone script with debug logging
   LOG_LEVEL=debug npm run test:regtest:manual
   ```

### Performance Testing

```bash
# Test with many transactions
NUM_TRANSACTIONS=20 TX_AMOUNT=0.01 npm run test:regtest:manual

# Test with large amounts
NUM_TRANSACTIONS=3 TX_AMOUNT=1.0 npm run test:regtest:manual

# Measure discovery latency
LOG_LEVEL=debug npm run test:regtest:manual | grep "Discovery"
```

## CI/CD Integration

For automated CI/CD pipelines:

```bash
# Set required environment
export REGTEST_REQUIRED=true
export DASHMATE_SERVER="ci-server@regtest.example.com"

# Run tests (will fail if regtest not available)
npm run test:regtest
```

## Advanced Topics

### Using Custom Addresses

Instead of derived addresses, test with specific addresses:

```javascript
// In test file
const testAddress = 'yPrrnSqAqR3p6uRhDcR47TbRLWGzVkK4Xb';

// Send and discover
const txid = await sendToAddress(testAddress, 0.05);
const utxo = await finder.findLatestSpendableUTXO([testAddress], {
  fromHeight: blockHeight,
});
```

### Monitoring Block Generation

```bash
# In separate terminal, watch block height
while true; do
  ssh ruald@10.0.0.119 docker exec dashmate_36324776_local_seed-core-1 dash-cli getblockcount
  sleep 2
done
```

### RPC Debugging

```bash
# Check wallet balance
ssh ruald@10.0.0.119 docker exec dashmate_36324776_local_seed-core-1 dash-cli getbalance

# List recent transactions
ssh ruald@10.0.0.119 docker exec dashmate_36324776_local_seed-core-1 dash-cli listtransactions "" 10

# Get address info
ssh ruald@10.0.0.119 docker exec dashmate_36324776_local_seed-core-1 dash-cli getaddressinfo <address>
```

## Support

For issues or questions:

1. **Check Tunnel**: Verify SSH tunnels are active
2. **Check Network**: Confirm DAPI and RPC are reachable
3. **Check Logs**: Run with `LOG_LEVEL=debug` for detailed output
4. **Check Blocks**: Verify blocks are being generated
5. **Check Container**: Verify Docker container is running on remote server

See main [README.md](../README.md) for general documentation.
