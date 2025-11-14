# Local Testnet Node Setup Guide

**Purpose**: Set up a local Dash testnet node for RPC testing
**Audience**: Developers running UTXO Finder integration tests
**Last Updated**: October 27, 2025

---

## Table of Contents

1. [Why a Local Node?](#why-a-local-node)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Starting the Node](#starting-the-node)
5. [Verification](#verification)
6. [Testing with UTXO Finder](#testing-with-utxo-finder)
7. [Troubleshooting](#troubleshooting)

---

## Why a Local Node?

### What Needs a Local Node

- **RPC Tests**: Tests that call `sendtoaddress`, `generateblocks`, etc.
- **Transaction Creation**: Creating and broadcasting test transactions
- **Block Mining**: Generating blocks for transaction confirmations

### What Doesn't Need a Local Node

- **Unit Tests**: Pure logic tests (no infrastructure)
- **Testnet Integration Tests**: Use public DAPI infrastructure
- **Regtest Tests**: Use remote regtest via SSH tunnel

### Benefits of Local Node

✅ Full control over testnet environment
✅ Fast RPC operations (no network latency)
✅ No rate limiting
✅ Can generate blocks on demand
✅ Privacy (no external RPC calls)

---

## Installation

### Option 1: Official Binaries

1. **Download Dash Core**:
   ```bash
   # Visit https://dashcore.org/downloads
   # Download latest version for your OS
   ```

2. **Extract**:
   ```bash
   tar -xzf dashcore-*.tar.gz
   cd dashcore-*/bin
   ```

3. **Install** (optional):
   ```bash
   sudo cp dashd dash-cli /usr/local/bin/
   ```

### Option 2: Build from Source

```bash
# Clone repository
git clone https://github.com/dashpay/dash.git
cd dash

# Install dependencies (Ubuntu/Debian)
sudo apt-get install build-essential libtool autotools-dev automake \
  pkg-config libssl-dev libevent-dev bsdmainutils libboost-all-dev

# Build
./autogen.sh
./configure
make
sudo make install
```

### Option 3: Package Manager

**macOS (Homebrew)**:
```bash
# Not officially available, use binaries
```

**Ubuntu/Debian**:
```bash
# Add Dash repository
sudo add-apt-repository ppa:dash/stable
sudo apt-get update
sudo apt-get install dashcore
```

---

## Configuration

### 1. Create Configuration Directory

```bash
mkdir -p ~/.dashcore
```

### 2. Create Configuration File

**File**: `~/.dashcore/dash.conf`

```ini
# Network
testnet=1

# RPC Server
server=1
rpcuser=dash
rpcpassword=dashpass
rpcport=18332
rpcallowip=127.0.0.1
rpcbind=127.0.0.1

# Wallet (needed for sendtoaddress)
wallet=wallet.dat

# Performance
maxconnections=125
maxuploadtarget=5000

# Logging (optional, for debugging)
debug=rpc
debug=net

# Data directory (optional)
# datadir=/path/to/custom/dir
```

### 3. Configure Environment Variables

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
# Dash testnet RPC
export TESTNET_RPC_ENDPOINT=http://localhost:18332
export TESTNET_RPC_USERNAME=dash
export TESTNET_RPC_PASSWORD=dashpass
```

Reload shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

---

## Starting the Node

### Start in Daemon Mode

```bash
dashd -testnet -daemon
```

**Expected output**:
```
Dash Core starting
```

### Check if Running

```bash
# Check process
ps aux | grep dashd

# Check with RPC
dash-cli -testnet getblockcount
```

### Monitor Logs

```bash
# Follow debug log
tail -f ~/.dashcore/testnet3/debug.log

# Check for errors
grep ERROR ~/.dashcore/testnet3/debug.log
```

### Stop the Node

```bash
dash-cli -testnet stop
```

---

## Verification

### 1. RPC Connectivity

**Test with dash-cli**:
```bash
dash-cli -testnet getblockcount
```

**Expected**: Current block height (e.g., `1346789`)

**Test with curl**:
```bash
curl -u dash:dashpass \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}' \
  -H "Content-Type: application/json" \
  http://localhost:18332
```

**Expected**:
```json
{"result":1346789,"error":null,"id":1}
```

### 2. Wallet Functionality

**Get new address**:
```bash
dash-cli -testnet getnewaddress
```

**Expected**: Testnet address (starts with `y`)

**Check balance**:
```bash
dash-cli -testnet getbalance
```

**Expected**: Balance in DASH (may be 0 if new wallet)

### 3. Sync Status

**Check blockchain info**:
```bash
dash-cli -testnet getblockchaininfo
```

**Look for**:
- `"chain": "test"`
- `"blocks": <number>`
- `"initialblockdownload": false` (when synced)
- `"verificationprogress": 0.9999...` (when synced)

**Sync takes time!** Full testnet sync can take 1-2 hours.

---

## Testing with UTXO Finder

### 1. Configure Environment

Create `.env.local`:
```bash
TESTNET_RPC_ENDPOINT=http://localhost:18332
TESTNET_RPC_USERNAME=dash
TESTNET_RPC_PASSWORD=dashpass
SKIP_RPC_TESTS=false
```

### 2. Run RPC Tests

```bash
cd packages/dash-utxo-finder
npm test -- __tests__/integration/UTXOFinder.e2e-with-rpc.test.ts
```

### 3. Expected Results

**RPC tests should**:
- Connect to local node
- Send test transactions
- Generate blocks
- Query UTXOs
- All pass (5/5 tests)

### 4. Example Test Flow

```
1. Generate test address
   └─ RPC: getnewaddress → yXXXXXXXXXX

2. Send funds to address
   └─ RPC: sendtoaddress yXXX 1.0 → <txid>

3. Generate blocks
   └─ RPC: generateblocks 3 → [<hash1>, <hash2>, <hash3>]

4. Query UTXO via DAPI
   └─ DAPI: subscribeToTransactionsWithProofs
   └─ Find UTXO for address

5. Verify UTXO
   └─ Check: amount, confirmations, lock status
```

---

## Troubleshooting

### Node Won't Start

**Symptom**: `dashd` exits immediately

**Check**:
```bash
# Check debug log for errors
tail -20 ~/.dashcore/testnet3/debug.log

# Check if another instance is running
ps aux | grep dashd

# Check if ports are in use
lsof -i :18332
lsof -i :18333
```

**Common Issues**:
- Another instance running: Stop it first
- Port already in use: Change `rpcport` in config
- Corrupted blockchain: Remove and resync
- Insufficient disk space: Need 10-20 GB

**Solutions**:
```bash
# Stop existing instance
dash-cli -testnet stop
pkill dashd

# Remove and resync (destructive!)
rm -rf ~/.dashcore/testnet3
dashd -testnet -daemon
```

### RPC Connection Refused

**Symptom**:
```
Error: connect ECONNREFUSED 127.0.0.1:18332
```

**Causes**:
- Node not running
- Wrong port
- RPC not enabled
- Wrong credentials

**Diagnose**:
```bash
# Check if running
ps aux | grep dashd

# Check port
lsof -i :18332

# Test connection
nc -zv localhost 18332

# Check config
cat ~/.dashcore/dash.conf | grep rpc
```

**Solutions**:
1. Start node: `dashd -testnet -daemon`
2. Check `server=1` in dash.conf
3. Verify port `18332` (testnet default)
4. Verify credentials in dash.conf

### RPC Authentication Failed

**Symptom**:
```
Error: RPC Error 401: Unauthorized
```

**Causes**:
- Wrong username/password
- Credentials not set in dash.conf
- Cookie auth vs password auth mismatch

**Solutions**:

1. **Set explicit credentials** in `dash.conf`:
   ```ini
   rpcuser=dash
   rpcpassword=dashpass
   ```

2. **Restart node** after config change:
   ```bash
   dash-cli -testnet stop
   dashd -testnet -daemon
   ```

3. **Update test environment**:
   ```bash
   TESTNET_RPC_USERNAME=dash TESTNET_RPC_PASSWORD=dashpass npm test
   ```

### Node Not Syncing

**Symptom**: `getblockcount` stays at low number

**Check**:
```bash
# Check connections
dash-cli -testnet getconnectioncount

# Check sync status
dash-cli -testnet getblockchaininfo | grep progress
```

**Solutions**:
1. **Wait**: Sync takes time (1-2 hours for full testnet)
2. **Add peers** in dash.conf:
   ```ini
   addnode=testnet-seed.dashdot.io
   addnode=testnet-seed.masternode.io
   ```
3. **Check firewall**: Allow port 18333 (P2P)

### Wallet Locked

**Symptom**:
```
Error: Error: Please enter the wallet passphrase with walletpassphrase first
```

**Solution**:
```bash
# Unlock wallet (if encrypted)
dash-cli -testnet walletpassphrase "your_passphrase" 600

# Or create new unencrypted wallet for testing
```

### Insufficient Funds

**Symptom**:
```
Error: Insufficient funds
```

**Solutions**:

1. **Get testnet funds** from faucet:
   - Visit testnet faucet (search "dash testnet faucet")
   - Enter your address from `getnewaddress`
   - Wait for confirmation

2. **Check balance**:
   ```bash
   dash-cli -testnet getbalance
   dash-cli -testnet listunspent
   ```

3. **Wait for confirmation**:
   - Testnet blocks ~2.5 minutes
   - Need 1 confirmation for spending

---

## Advanced Configuration

### Performance Tuning

```ini
# Faster sync
dbcache=2048
maxmempool=500

# More connections
maxconnections=200

# Faster block relay
blocksonly=0
```

### Debugging

```ini
# Enable RPC logging
debug=rpc
debug=net
debug=http

# Log to console
printtoconsole=1
```

### Resource Limits

```ini
# Limit bandwidth
maxuploadtarget=1000

# Limit memory
maxmempool=300

# Limit connections
maxconnections=50
```

---

## Maintenance

### Regular Tasks

**Check sync status** (weekly):
```bash
dash-cli -testnet getblockchaininfo
```

**Backup wallet** (monthly):
```bash
cp ~/.dashcore/testnet3/wallet.dat ~/wallet-backup-$(date +%Y%m%d).dat
```

**Update software** (when new version released):
```bash
dash-cli -testnet stop
# Download new version
# Extract and replace binaries
dashd -testnet -daemon
```

### Disk Space Management

Testnet blockchain size: ~15-20 GB

**Check space**:
```bash
du -sh ~/.dashcore/testnet3
```

**Prune old blocks** (optional):
```ini
# In dash.conf
prune=550  # Keep only last 550 MB
```

---

## Quick Reference

### Common Commands

```bash
# Status
dash-cli -testnet getblockchaininfo
dash-cli -testnet getnetworkinfo
dash-cli -testnet getwalletinfo

# Wallet
dash-cli -testnet getnewaddress
dash-cli -testnet getbalance
dash-cli -testnet listunspent

# Transactions
dash-cli -testnet sendtoaddress <address> <amount>
dash-cli -testnet gettransaction <txid>

# Blocks
dash-cli -testnet getblockcount
dash-cli -testnet getbestblockhash
dash-cli -testnet getblock <hash>

# Control
dashd -testnet -daemon      # Start
dash-cli -testnet stop       # Stop
dash-cli -testnet help       # List all commands
```

### File Locations

**Configuration**:
- Config file: `~/.dashcore/dash.conf`
- Data directory: `~/.dashcore/testnet3/`

**Blockchain Data**:
- Blocks: `~/.dashcore/testnet3/blocks/`
- Chainstate: `~/.dashcore/testnet3/chainstate/`

**Wallet**:
- Wallet file: `~/.dashcore/testnet3/wallet.dat`
- Wallet backup: Make copies of this file!

**Logs**:
- Debug log: `~/.dashcore/testnet3/debug.log`

### Ports

- **RPC**: 18332 (HTTP JSON-RPC)
- **P2P**: 18333 (Peer-to-peer network)

---

## Integration with UTXO Finder

### Environment Setup

1. **Ensure node is running and synced**:
   ```bash
   dash-cli -testnet getblockchaininfo | grep verificationprogress
   # Should be close to 1.0
   ```

2. **Create test environment** (`.env.local`):
   ```bash
   TESTNET_RPC_ENDPOINT=http://localhost:18332
   TESTNET_RPC_USERNAME=dash
   TESTNET_RPC_PASSWORD=dashpass
   SKIP_RPC_TESTS=false
   ```

3. **Run RPC tests**:
   ```bash
   cd packages/dash-utxo-finder
   npm test -- __tests__/integration/UTXOFinder.e2e-with-rpc.test.ts
   ```

### Expected Test Flow

The RPC tests will:

1. **Connect to your local node** via JSON-RPC
2. **Generate test addresses** via `getnewaddress`
3. **Send funds** via `sendtoaddress` (requires wallet funds)
4. **Mine blocks** via `generateblocks` (testnet mining is possible)
5. **Query UTXOs** via DAPI + RPC
6. **Verify results** match expectations

### Getting Testnet Funds

Your wallet needs funds for `sendtoaddress`:

1. **Generate address**:
   ```bash
   dash-cli -testnet getnewaddress
   ```

2. **Get funds from faucet**:
   - Search "dash testnet faucet"
   - Enter your address
   - Wait for transaction

3. **Wait for confirmation**:
   ```bash
   # Check balance (updates after confirmation)
   dash-cli -testnet getbalance

   # Check pending
   dash-cli -testnet getunconfirmedbalance
   ```

4. **Verify**:
   ```bash
   # Should show confirmed balance
   dash-cli -testnet getbalance
   # Should show UTXOs
   dash-cli -testnet listunspent
   ```

---

## Troubleshooting

### Sync Taking Forever

**Normal**: Full testnet sync takes 1-2 hours

**Speed up**:
1. **Increase dbcache**:
   ```ini
   dbcache=4096
   ```

2. **More connections**:
   ```ini
   maxconnections=200
   ```

3. **Check peers**:
   ```bash
   dash-cli -testnet getpeerinfo | grep addr
   ```

### Tests Fail with "Insufficient Funds"

**Solution**: Get testnet coins from faucet (see above)

### Tests Fail with "Connection Refused"

**Check**:
```bash
# Is node running?
ps aux | grep dashd

# Is RPC listening?
lsof -i :18332

# Test connection
curl -u dash:dashpass \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}' \
  http://localhost:18332
```

### Node Crashes or Hangs

**Diagnose**:
```bash
# Check debug log
tail -100 ~/.dashcore/testnet3/debug.log

# Check system resources
top | grep dashd
df -h  # Disk space
```

**Solutions**:
- Restart: `dash-cli -testnet stop && dashd -testnet -daemon`
- Reduce resource usage in dash.conf
- Check for corrupted blockchain
- Increase system resources (RAM, disk)

---

## Best Practices

### 1. Keep Node Running

For active development:
```bash
# Add to startup (systemd on Linux)
sudo systemctl enable dashd-testnet

# Or use process manager (PM2)
pm2 start dashd -- -testnet
```

### 2. Regular Backups

```bash
# Backup wallet weekly
cp ~/.dashcore/testnet3/wallet.dat ~/backups/wallet-$(date +%Y%m%d).dat

# Encrypt backup
gpg -c ~/backups/wallet-*.dat
```

### 3. Monitor Disk Space

```bash
# Check size
du -sh ~/.dashcore/testnet3

# Enable pruning if needed
echo "prune=550" >> ~/.dashcore/dash.conf
```

### 4. Update Regularly

Keep Dash Core up to date:
- Security fixes
- Performance improvements
- New features
- Compatibility

### 5. Test RPC Before Integration Tests

```bash
# Quick RPC test
dash-cli -testnet getblockcount
dash-cli -testnet getbalance

# Then run tests
npm test
```

---

## Alternative: Docker Setup (Optional)

### Using Docker for Testnet Node

**Dockerfile**:
```dockerfile
FROM dashpay/dashd:latest

ENV NETWORK=testnet

COPY dash.conf /root/.dashcore/dash.conf

EXPOSE 18332 18333

CMD ["dashd", "-testnet", "-printtoconsole"]
```

**docker-compose.yml**:
```yaml
version: '3'
services:
  dashd-testnet:
    build: .
    ports:
      - "18332:18332"
      - "18333:18333"
    volumes:
      - testnet-data:/root/.dashcore/testnet3
    restart: unless-stopped

volumes:
  testnet-data:
```

**Usage**:
```bash
# Start
docker-compose up -d

# Check logs
docker-compose logs -f

# RPC commands
docker exec <container> dash-cli -testnet getblockcount

# Stop
docker-compose down
```

**Note**: You still need Docker installed, but this is cleaner than manual setup.

---

## Summary

### Minimum Setup

1. Install Dash Core
2. Create `~/.dashcore/dash.conf` with testnet + RPC config
3. Start: `dashd -testnet -daemon`
4. Wait for sync
5. Get testnet funds from faucet
6. Run tests: `npm test`

### Verification Checklist

- [ ] Node running: `ps aux | grep dashd`
- [ ] RPC accessible: `curl http://localhost:18332`
- [ ] Node synced: `dash-cli -testnet getblockchaininfo`
- [ ] Wallet has funds: `dash-cli -testnet getbalance`
- [ ] Tests pass: `npm test -- __tests__/integration/UTXOFinder.e2e-with-rpc.test.ts`

### When You're Done

Keep node running for development, or stop to save resources:
```bash
dash-cli -testnet stop
```

---

**Need Help?**

- Dash Core documentation: https://docs.dash.org
- Dash Core GitHub: https://github.com/dashpay/dash
- Dash Discord: https://discord.gg/dash

---

**Last Updated**: October 27, 2025
**Related Guides**: TESTING_GUIDE.md, DNS_RESOLUTION_TESTING.md
