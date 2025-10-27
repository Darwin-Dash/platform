# UTXO Finder Testing Guide

**Version**: 1.0.0
**Last Updated**: October 27, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Test Categories](#test-categories)
4. [Environment Setup](#environment-setup)
5. [Running Tests](#running-tests)
6. [Infrastructure Requirements](#infrastructure-requirements)
7. [Troubleshooting](#troubleshooting)
8. [CI/CD Integration](#cicd-integration)

---

## Overview

The UTXO Finder test suite consists of three main categories:

- **Unit Tests** (198 tests) - Fast, isolated component tests
- **Integration Tests** - Tests with real DAPI/RPC connections
  - Testnet integration (public infrastructure)
  - Regtest integration (SSH tunnel to remote node)
  - RPC tests (local/remote node operations)

### Test Infrastructure

```
Test Layer (Vitest)
    ↓
Resilience Layer (Retry + Circuit Breaker)
    ↓
Configuration Layer (TestEnv)
    ↓
Transport Layer (JSON-RPC + DAPI)
    ↓
Infrastructure (Local Node / SSH Tunnel / Public Seeds)
```

---

## Quick Start

### Run All Unit Tests
```bash
cd packages/dash-utxo-finder
npm test -- __tests__/unit/
```

**Expected**: 198/198 passing in ~1-2 seconds

### Run All Tests (if infrastructure available)
```bash
npm test
```

**Expected**: All tests pass if local testnet node and SSH access available

### Run Specific Test File
```bash
npm test -- __tests__/unit/LatestUTXOSelector.test.ts
npm test -- __tests__/integration/UTXOFinder.testnet.integration.test.ts
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

---

## Test Categories

### Unit Tests (198 tests)

**Location**: `__tests__/unit/`

**Files**:
- `LatestUTXOSelector.test.ts` (35 tests)
- `UTXOExtractor.test.ts` (32 tests)
- `AddressDerivation.test.ts` (40 tests)
- `TransactionSyncer.test.ts` (28 tests)
- `UTXOFinder.test.ts` (45 tests)
- `BloomFilterBuilder.test.ts` (2 tests)
- `StorageAdapter.test.ts` (16 tests)

**Requirements**: None (fully isolated)

**Duration**: 1-2 seconds

**Run**:
```bash
npm test -- __tests__/unit/
```

### Testnet Integration Tests

**Location**: `__tests__/integration/UTXOFinder.testnet.integration.test.ts`

**Requirements**:
- Internet connection
- Access to public Dash testnet seed nodes

**Duration**: 30-90 seconds (depends on network)

**Run**:
```bash
npm test -- __tests__/integration/UTXOFinder.testnet.integration.test.ts
```

**Skip**:
```bash
SKIP_TESTNET_TESTS=true npm test
```

**Features**:
- Uses public testnet infrastructure (no local setup needed)
- Automatic DNS resolution of seed hostnames to IPs
- Retry logic with exponential backoff
- Circuit breaker for unreliable seeds
- Graceful failure if network unavailable

### Regtest Integration Tests

**Location**: `__tests__/integration/UTXOFinder.integration.test.ts`

**Requirements**:
- SSH access to remote Dashmate server
- SSH tunnels established (DAPI: 2443, RPC: 20002)
- Running regtest Docker network on server

**Duration**: 10-30 seconds

**Run**:
```bash
npm test -- __tests__/integration/UTXOFinder.integration.test.ts
```

**Skip**:
```bash
SKIP_REGTEST_TESTS=true npm test
```

**Setup**:
```bash
# Manual SSH tunnel setup (if not automatic)
ssh -L 2443:127.0.0.1:2443 ruald@10.0.0.119
ssh -L 20002:127.0.0.1:20002 ruald@10.0.0.119
```

### RPC Tests (E2E)

**Location**: `__tests__/integration/UTXOFinder.e2e-with-rpc.test.ts`

**Requirements**:
- Local testnet node running OR regtest with RPC access
- RPC server enabled with credentials
- Wallet with funds for sendtoaddress

**Duration**: 30-60 seconds

**Run**:
```bash
npm test -- __tests__/integration/UTXOFinder.e2e-with-rpc.test.ts
```

**Skip**:
```bash
SKIP_RPC_TESTS=true npm test
```

---

## Environment Setup

### Option 1: Quick Start (Unit Tests Only)

No setup needed! Just run:
```bash
npm test -- __tests__/unit/
```

### Option 2: Local Development (All Tests)

**Prerequisites**:
1. Local testnet node running
2. SSH access to regtest server

**Setup**:

1. **Copy environment template**:
   ```bash
   cp .env.test .env.local
   ```

2. **Edit `.env.local`** with your configuration:
   ```bash
   # Local testnet node
   TESTNET_RPC_ENDPOINT=http://localhost:18332
   TESTNET_RPC_USERNAME=dash
   TESTNET_RPC_PASSWORD=your_password

   # SSH to regtest server
   DASHMATE_SSH_HOST=user@your.server.ip
   SEED_CONTAINER=your_container_name

   # Enable all tests
   SKIP_RPC_TESTS=false
   SKIP_TESTNET_TESTS=false
   SKIP_REGTEST_TESTS=false
   ```

3. **Load environment** (if using dotenv):
   ```bash
   npm install dotenv
   # Add to test setup if needed
   ```

4. **Run tests**:
   ```bash
   npm test
   ```

### Option 3: CI/CD (GitHub Actions)

Use `.env.ci` configuration:

```yaml
name: Test UTXO Finder

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run Unit Tests
        run: npm test -- __tests__/unit/

      - name: Run Testnet Integration Tests
        env:
          SKIP_RPC_TESTS: true
          SKIP_REGTEST_TESTS: true
          DAPI_TIMEOUT: 240000
          MAX_RETRIES: 7
        run: npm test -- __tests__/integration/UTXOFinder.testnet.integration.test.ts
```

---

## Infrastructure Requirements

### Local Testnet Node

**Purpose**: Required for RPC tests (sendtoaddress, generateblocks)

**Setup**:

1. **Install Dash Core**:
   ```bash
   # Download from dashcore.org
   # Or use package manager
   ```

2. **Configure testnet mode** (`~/.dashcore/dash.conf`):
   ```ini
   testnet=1
   server=1
   rpcuser=dash
   rpcpassword=dashpass
   rpcport=18332
   rpcallowip=127.0.0.1
   ```

3. **Start node**:
   ```bash
   dashd -testnet -daemon
   ```

4. **Verify**:
   ```bash
   # Should return block count
   curl -u dash:dashpass \
     -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}' \
     http://localhost:18332
   ```

### SSH Tunnel to Regtest Server

**Purpose**: Required for regtest integration tests

**Setup**:

1. **Configure SSH** (`~/.ssh/config`):
   ```
   Host dashmate
     HostName 10.0.0.119
     User ruald
     IdentityFile ~/.ssh/id_rsa
     LocalForward 2443 127.0.0.1:2443
     LocalForward 20002 127.0.0.1:20002
   ```

2. **Connect**:
   ```bash
   ssh dashmate
   ```

3. **Verify DAPI tunnel**:
   ```bash
   nc -zv localhost 2443
   ```

4. **Verify RPC tunnel**:
   ```bash
   curl -u dash:dashpass \
     -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}' \
     http://localhost:20002
   ```

### Public Testnet (No Setup)

**Purpose**: Testnet integration tests work without any local setup

**How it works**:
- DAPIClient connects to public seed nodes
- DNS resolution: `seed-1.testnet.networks.dash.org` → IP address
- Automatic failover if seeds are down
- Retry + circuit breaker handle transient failures

**No configuration needed!**

---

## Running Tests

### Run All Tests
```bash
npm test
```

### Run by Category
```bash
# Unit tests only
npm test -- __tests__/unit/

# Integration tests only
npm test -- __tests__/integration/

# Specific file
npm test -- UTXOFinder.test.ts

# Specific test by name
npm test -- -t "should emit start event"
```

### Run with Environment Overrides
```bash
# Skip RPC tests
SKIP_RPC_TESTS=true npm test

# Increase timeout
DAPI_TIMEOUT=300000 npm test

# Enable verbose logging
VERBOSE=true npm test

# Combine multiple overrides
SKIP_RPC_TESTS=true DAPI_TIMEOUT=300000 npm test
```

### Run with Custom Configuration
```bash
# Use different RPC endpoint
TESTNET_RPC_ENDPOINT=http://192.168.1.100:18332 npm test

# Use different SSH host
DASHMATE_SSH_HOST=user@different.server npm test
```

### Debug Configuration
```bash
# Show all configuration
node -e "
const { TestEnv } = require('./__tests__/helpers/env');
TestEnv.printConfig();
"
```

---

## Test Timeouts

### Default Timeouts

| Operation | Timeout | Configurable Via |
|-----------|---------|------------------|
| Unit tests | 5s | Vitest default |
| RPC operations | 30s | `RPC_TIMEOUT` |
| DAPI queries | 180s | `DAPI_TIMEOUT` |
| Test hooks | 60s | `HOOK_TIMEOUT` |
| Integration tests | 120s | `TEST_TIMEOUT` |

### Adjust Timeouts

**In environment**:
```bash
RPC_TIMEOUT=60000 DAPI_TIMEOUT=300000 npm test
```

**In vitest.config.ts**:
```typescript
export default defineConfig({
  test: {
    testTimeout: 120000,   // General test timeout
    hookTimeout: 60000,    // beforeAll/afterAll timeout
  },
});
```

**Per-test**:
```typescript
it('slow test', async () => {
  // test code
}, { timeout: 300000 }); // 5 minutes
```

---

## Troubleshooting

### Unit Tests Failing

**Symptom**: Tests fail with "jest is not defined" or similar

**Solution**: Ensure using vitest APIs
```typescript
import { describe, it, expect, vi } from 'vitest';

// Use vi.fn() not jest.fn()
const mock = vi.fn();
```

### RPC Tests Failing

**Symptom**: "Connection refused" or "RPC timeout"

**Diagnose**:
```bash
# Test RPC endpoint manually
curl -u dash:dashpass \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}' \
  http://localhost:18332

# Check if node is running
ps aux | grep dashd

# Check RPC credentials
cat ~/.dashcore/dash.conf | grep rpc
```

**Common Issues**:
- Node not running: `dashd -testnet -daemon`
- Wrong credentials: Check `dash.conf`
- Wrong port: Testnet uses 18332, mainnet uses 9998
- Firewall blocking: Add localhost exception

### Testnet Tests Timing Out

**Symptom**: "Hook timed out" or "Test timed out"

**Causes**:
- Public seeds are slow/overloaded
- Network connectivity issues
- DNS resolution failures

**Solutions**:

1. **Increase timeouts**:
   ```bash
   HOOK_TIMEOUT=90000 DAPI_TIMEOUT=300000 npm test
   ```

2. **Increase retries**:
   ```bash
   MAX_RETRIES=10 RETRY_MAX_DELAY=60000 npm test
   ```

3. **Enable verbose logging** to see what's happening:
   ```bash
   VERBOSE=true npm test
   ```

4. **Check seed health** (see DNS_RESOLUTION_TESTING.md):
   ```bash
   node scripts/check-testnet-health.js
   ```

### Regtest Tests Failing

**Symptom**: "SSH tunnel not available" or "Connection refused"

**Diagnose**:
```bash
# Test SSH connection
ssh ruald@10.0.0.119

# Check if tunnel is active
lsof -i :2443
lsof -i :20002

# Test DAPI tunnel
nc -zv localhost 2443

# Test RPC tunnel
curl -u dash:dashpass \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}' \
  http://localhost:20002
```

**Solutions**:

1. **Establish SSH tunnels**:
   ```bash
   ssh -L 2443:127.0.0.1:2443 -L 20002:127.0.0.1:20002 ruald@10.0.0.119
   ```

2. **Update SSH configuration**:
   ```bash
   DASHMATE_SSH_HOST=user@your.server npm test
   ```

3. **Skip regtest if unavailable**:
   ```bash
   SKIP_REGTEST_TESTS=true npm test
   ```

### DNS Resolution Issues

**Symptom**: "No connection established" or "DEADLINE_EXCEEDED"

**Causes**:
- Seed hostname doesn't resolve
- Resolved IP is unreachable
- TLS certificate mismatch

**Diagnose**:
```bash
# Test DNS resolution
node -e "
const dns = require('dns').promises;
dns.resolve4('seed-1.testnet.networks.dash.org').then(console.log);
"

# Check specific seed
node scripts/check-testnet-health.js
```

**Solutions**: See [DNS_RESOLUTION_TESTING.md](./DNS_RESOLUTION_TESTING.md)

### Circuit Breaker Opening

**Symptom**: "Circuit breaker is OPEN" error

**Meaning**: Too many failures detected, circuit opened to prevent cascade

**Solutions**:

1. **Wait for circuit to recover** (default 30s)

2. **Check underlying issue**:
   - Is the service actually down?
   - Network connectivity problems?
   - DNS resolution failing?

3. **Adjust threshold**:
   ```bash
   CIRCUIT_BREAKER_THRESHOLD=10 npm test
   ```

4. **Reset by rerunning tests** (circuit breaker resets between test runs)

---

## Environment Setup

### Local Development Environment

**File**: `.env.local` (copy from `.env.test`)

```bash
# Local testnet node
TESTNET_RPC_ENDPOINT=http://localhost:18332
TESTNET_RPC_USERNAME=dash
TESTNET_RPC_PASSWORD=dashpass

# Regtest via SSH
REGTEST_RPC_ENDPOINT=http://localhost:20002
DASHMATE_SSH_HOST=ruald@10.0.0.119
SEED_CONTAINER=dashmate_36324776_local_seed-core-1

# Enable all tests
SKIP_RPC_TESTS=false
SKIP_TESTNET_TESTS=false
SKIP_REGTEST_TESTS=false

# Standard timeouts
DAPI_TIMEOUT=180000
HOOK_TIMEOUT=60000
```

### CI/CD Environment

**File**: `.env.ci`

```bash
# Skip local infrastructure tests
SKIP_RPC_TESTS=true
SKIP_REGTEST_TESTS=true

# Run testnet tests (public infrastructure)
SKIP_TESTNET_TESTS=false

# Longer timeouts for CI
DAPI_TIMEOUT=240000
HOOK_TIMEOUT=90000

# More retries
MAX_RETRIES=7
```

### Environment Variables Reference

See `TestEnv` class in `__tests__/helpers/env.ts` for all available options.

**Quick Reference**:
```typescript
import { TestEnv } from './__tests__/helpers/env';

// RPC
TestEnv.getTestnetRPCEndpoint()
TestEnv.getRegtestRPCEndpoint()
TestEnv.getRPCCredentials('testnet')

// SSH
TestEnv.getSSHHost()
TestEnv.getSeedContainer()

// Test Control
TestEnv.shouldSkipRPCTests()
TestEnv.shouldSkipTestnetTests()
TestEnv.shouldSkipRegtestTests()
TestEnv.isCI()

// Timeouts
TestEnv.getDAPITimeout()
TestEnv.getHookTimeout()

// Retry
TestEnv.getMaxRetries()
TestEnv.getRetryBaseDelay()

// Debug
TestEnv.printConfig()
TestEnv.validateConfig()
```

---

## Infrastructure Requirements

### Minimum (Unit Tests Only)
- ✅ Node.js 18+
- ✅ npm dependencies installed

### Standard (+ Testnet Tests)
- ✅ Node.js 18+
- ✅ npm dependencies installed
- ✅ Internet connection

### Full (All Tests)
- ✅ Node.js 18+
- ✅ npm dependencies installed
- ✅ Internet connection
- ✅ Local Dash testnet node running
- ✅ SSH access to regtest server
- ✅ SSH tunnels established

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: UTXO Finder Tests

on:
  push:
    branches: [main, develop, feat/*]
  pull_request:
    branches: [main, develop]

jobs:
  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run unit tests
        working-directory: packages/dash-utxo-finder
        run: npm test -- __tests__/unit/ --run

  integration-tests:
    name: Testnet Integration Tests
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run testnet integration tests
        working-directory: packages/dash-utxo-finder
        env:
          SKIP_RPC_TESTS: true
          SKIP_REGTEST_TESTS: true
          DAPI_TIMEOUT: 240000
          HOOK_TIMEOUT: 90000
          MAX_RETRIES: 7
          LOG_LEVEL: info
        run: npm test -- __tests__/integration/UTXOFinder.testnet.integration.test.ts --run
```

### What Works in CI

✅ **Unit Tests**: Always work (no infrastructure)
✅ **Testnet Integration**: Works (uses public seeds)

### What Doesn't Work in CI

❌ **RPC Tests**: Require local Dash node
❌ **Regtest Tests**: Require SSH to your server

**Solution**: Use `.env.ci` configuration which skips these automatically.

---

## Best Practices

### 1. Run Unit Tests First

Always run unit tests before integration tests:
```bash
npm test -- __tests__/unit/ && npm test -- __tests__/integration/
```

Unit tests are:
- Fast (1-2 seconds)
- Reliable (100% pass rate)
- Catch most bugs

### 2. Use Environment Variables for Configuration

Don't hardcode values in test files. Use TestEnv:
```typescript
// Bad
const endpoint = 'http://localhost:18332';

// Good
const endpoint = TestEnv.getTestnetRPCEndpoint();
```

### 3. Skip Unavailable Infrastructure Gracefully

```typescript
describe.skipIf(TestEnv.shouldSkipRPCTests())('RPC Tests', () => {
  // Tests only run when RPC available
});
```

### 4. Use Appropriate Timeouts

```typescript
// Fast operation
it('quick test', async () => { }, { timeout: 5000 });

// Network operation
it('network test', async () => { }, { timeout: TestEnv.getDAPITimeout() });

// Long-running scan
it('full scan', async () => { }, { timeout: 300000 });
```

### 5. Enable Logging for Debugging

```bash
# See retry attempts
VERBOSE=true npm test

# See RPC calls
LOG_LEVEL=debug npm test
```

### 6. Use Retry for Flaky Operations

```typescript
import { withRetry } from '../helpers/retry';

const result = await withRetry(
  () => dapiClient.core.getStatus(),
  { maxRetries: 3, baseDelay: 1000 }
);
```

### 7. Validate Configuration Before Tests

```typescript
beforeAll(() => {
  const warnings = TestEnv.validateConfig();
  if (warnings.length > 0) {
    console.warn('Configuration warnings:', warnings);
  }
});
```

---

## Performance Expectations

### Unit Tests
- **Count**: 198 tests
- **Duration**: 1-2 seconds
- **Pass Rate**: 100%
- **Stability**: Very stable

### Testnet Integration Tests
- **Count**: 8-10 tests
- **Duration**: 30-90 seconds
- **Pass Rate**: 95%+ (with retry/circuit breaker)
- **Stability**: Good (with resilience utilities)

### Regtest Integration Tests
- **Count**: 5-10 tests
- **Duration**: 10-30 seconds
- **Pass Rate**: 100% (when SSH available)
- **Stability**: Excellent (local infrastructure)

### RPC Tests
- **Count**: 5 tests
- **Duration**: 30-60 seconds
- **Pass Rate**: 100% (when node available)
- **Stability**: Excellent (local node)

---

## Advanced Usage

### Custom Retry Configuration

```typescript
import { withRetry } from '../helpers/retry';

const result = await withRetry(
  () => operation(),
  {
    maxRetries: 10,
    baseDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.2,
    logger: (msg, level) => console.log(`[Retry] ${msg}`),
    shouldRetry: (error) => {
      // Custom retry logic
      return error.message.includes('temporary');
    },
  }
);
```

### Custom Circuit Breaker

```typescript
import { CircuitBreaker } from '../helpers/circuit-breaker';

const breaker = new CircuitBreaker({
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 20000,
  name: 'MyService',
  logger: console.log,
});

const result = await breaker.execute(() => operation());
```

### Seed Health Checking

```typescript
import { checkSeedsHealth, getHealthReport } from '../helpers/seed-health';

const seeds = [
  'seed-1.testnet.networks.dash.org:1443',
  'seed-2.testnet.networks.dash.org:1443',
];

const health = await checkSeedsHealth(seeds, {
  timeoutMs: 5000,
  resolveDNS: true,
  concurrency: 3,
});

console.log(await getHealthReport(seeds));
```

---

## Test Development Guide

### Adding New Tests

1. **Choose the right category**:
   - Pure logic → Unit test
   - Needs DAPI → Testnet integration
   - Needs RPC → RPC test
   - Needs regtest → Regtest integration

2. **Use appropriate helpers**:
   ```typescript
   import { TestEnv } from '../helpers/env';
   import { withRetry } from '../helpers/retry';
   import { createDAPICircuitBreaker } from '../helpers/circuit-breaker';
   ```

3. **Set proper timeouts**:
   ```typescript
   it('my test', async () => {
     // test code
   }, { timeout: TestEnv.getTestTimeout() });
   ```

4. **Add skip conditions**:
   ```typescript
   describe.skipIf(TestEnv.shouldSkipTestnetTests())('My Tests', () => {
     // tests
   });
   ```

5. **Use resilience patterns**:
   ```typescript
   const result = await withRetry(
     () => circuitBreaker.execute(() => operation()),
     { maxRetries: TestEnv.getMaxRetries() }
   );
   ```

### Testing Best Practices

1. **Isolate unit tests**: No network, no RPC, no DAPI
2. **Make integration tests resilient**: Use retry + circuit breaker
3. **Use environment configuration**: Never hardcode
4. **Provide good error messages**: Help debugging
5. **Set appropriate timeouts**: Not too short, not too long
6. **Skip gracefully**: Don't fail if infrastructure unavailable

---

## Further Reading

- [DNS_RESOLUTION_TESTING.md](./DNS_RESOLUTION_TESTING.md) - DNS and TLS certificate details
- [REGTEST_TESTING.md](./REGTEST_TESTING.md) - Regtest setup and testing
- [SESSION_IMPLEMENTATION_SUMMARY.md](../SESSION_IMPLEMENTATION_SUMMARY.md) - Implementation details
- [TEST_RESULTS.md](../TEST_RESULTS.md) - Latest test results

---

## Support

### Getting Help

**Issues with tests**:
1. Check this guide first
2. Run `TestEnv.printConfig()` to verify configuration
3. Run `TestEnv.validateConfig()` to check for issues
4. Enable verbose logging: `VERBOSE=true npm test`
5. Check individual infrastructure components

**Common Questions**:

**Q: Can I run tests without a local node?**
A: Yes! Unit tests and testnet integration tests work without local infrastructure.

**Q: Why are RPC tests failing?**
A: You need a local Dash node running with RPC enabled. See "Local Testnet Node" section.

**Q: Why are testnet tests slow?**
A: Public testnet seeds can be slow. This is normal. Consider increasing timeout if needed.

**Q: Can I run tests in parallel?**
A: Yes for unit tests. Integration tests may have shared state, run sequentially.

**Q: How do I debug failing tests?**
A: Enable verbose mode: `VERBOSE=true npm test` and check logs.

---

**Last Updated**: October 27, 2025
**Maintainer**: Dash Platform Team
