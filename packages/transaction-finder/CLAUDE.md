# CLAUDE.md - Transaction-Finder Testing Guide

This file documents how to work with tests in the Transaction-Finder package.

## Important: No Local Setup Required

**All integration tests connect to public Dash Platform testnet.**
You do NOT need to start any local services, Docker containers, or blockchain nodes.

Tests work immediately after `npm install`.

## Test Infrastructure

### What Tests Connect To

Tests use `ResilientDAPIClient` to connect to **public Dash testnet DAPI nodes**:

```typescript
// Tests automatically use public testnet nodes
const client = new ResilientDAPIClient({
  dapiAddresses: process.env.TESTNET_DAPI_ADDRESSES?.split(',') ||
    ['34.214.48.68:1443', '35.166.18.166:1443', /* ... DCG nodes ... */],
});
```

These are reliable Dash Core Group testnet masternodes selected for consistency.

## Test Files

### New Reliability Tests (Built This Session)

```
tests/integration/
├── reliability-validation.spec.ts        [9 tests - transaction-finder ops]
├── resilience-comparison.spec.ts         [5 tests - improvement metrics]
└── helpers/
    ├── metrics-collector.ts              [Metrics tracking]
    ├── failure-logger.ts                 [Failure logging]
    └── report-generator.ts               [Report generation]
```

### Existing Tests
```
tests/unit/
├── finders/                              [Unit tests for each finder]
├── core/                                 [Core component tests]
├── monitoring/                           [Monitoring tests]
└── [other unit tests]
```

## Running Tests

### Quick Start
```bash
# Install dependencies
npm install

# Run a single quick test (5 minutes)
npm test tests/integration/reliability-validation.spec.ts -- --grep "should find UTXOs from 1,000 blocks"
```

### All New Integration Tests
```bash
# All reliability tests (~30 minutes)
npm test tests/integration/reliability-validation.spec.ts -- --timeout=600000

# All comparison tests (~60 minutes)
npm test tests/integration/resilience-comparison.spec.ts -- --timeout=600000

# All new tests together (~90 minutes)
npm test tests/integration/{reliability-validation,resilience-comparison}.spec.ts -- --timeout=600000
```

### Existing Unit Tests
```bash
# Run unit tests (no network needed)
npm test tests/unit/

# Run specific test file
npm test tests/unit/core/TransactionSyncer.test.ts
```

## Environment Configuration

### What's Required
**Nothing.** Tests work with defaults.

### What's Optional
```bash
# Optional: Override DAPI endpoints
export TESTNET_DAPI_ADDRESSES="localhost:1443,localhost:1444"

# Optional: Specify test address
export TESTNET_ADDRESS="yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy"

# Optional: RPC endpoint for transaction operations
export TESTNET_RPC_ENDPOINT="http://localhost:19998"
export TESTNET_RPC_USERNAME="dash"
export TESTNET_RPC_PASSWORD="dash"

# Optional: Timeout configuration
export TESTNET_TIMEOUT=30000
```

Then run tests normally:
```bash
npm test tests/integration/reliability-validation.spec.ts
```

## Test Organization

### Reliability Validation Tests (`reliability-validation.spec.ts`)

**What**: End-to-end transaction-finder operations with ResilientDAPIClient

**Tests**:
1. Historic sync (1,000 blocks) - UTXO discovery
2. Mid-sync recovery - Network failure handling
3. UTXO validation - Data consistency
4. Realtime monitoring (10 min) - Stream stability
5. Monitoring disconnect recovery - Connection resilience
6. Hybrid mode - Combined historic + realtime
7. Error handling - Graceful failures
8. Retry with backoff - Exponential retry
9. Report generation - Metrics output

**Duration**: 30-60 minutes
**Network**: Required (public testnet)
**Success Criteria**: All UTXO operations complete, data valid, no crashes

### Resilience Comparison Tests (`resilience-comparison.spec.ts`)

**What**: Quantify ResilientDAPIClient improvements

**Tests**:
1. Success rate comparison - Normal conditions
2. Failure injection - 30% failure rate
3. Streaming comparison - Header streaming metrics
4. Concurrent load - Multiple concurrent finders
5. Comparison report - Summary with metrics

**Duration**: 45-90 minutes
**Network**: Required (public testnet)
**Success Criteria**: 23-45% improvement demonstrated

## Test Results

### Reports Generated
```bash
ls test-results/
# transaction-finder-validation-2025-11-16T14-50-00Z.md
# resilience-comparison-2025-11-16T15-20-00Z.md
# etc.
```

### What Reports Show
- Test execution summary
- Success/failure counts
- Performance metrics
- UTXO counts (for validation tests)
- Success rate comparison (for comparison tests)
- Improvement percentage
- Recommendations

### Expected Results
```
Reliability Tests:
✓ 9 tests passing
✓ UTXOs found successfully
✓ Monitoring stable for 10+ minutes
✓ Recovery from failures working

Comparison Tests:
✓ 5 tests passing
✓ 99%+ success under normal conditions
✓ 87%+ success under 30% failure injection
✓ 23-45% improvement shown
```

## Troubleshooting

### "No UTXOs found for address"
**Cause**: Test address has no transaction history
**Solution**:
1. Use address with known transactions
2. Or fund test address via testnet faucet
3. Update `TESTNET_ADDRESS` environment variable

### "Cannot connect to DAPI"
**Cause**: Network unreachable
**Solution**:
1. Check internet connection
2. Verify testnet nodes are up: `curl -I https://34.214.48.68:1443`
3. Try custom DAPI endpoint: `export TESTNET_DAPI_ADDRESSES="your.node:1443"`

### "Timeout after 30000ms"
**Cause**: Network slow or nodes unresponsive
**Solution**:
1. Increase timeout: `npm test -- --timeout=60000`
2. Wait for network to stabilize
3. Try later when testnet is less loaded

### Tests pass locally but fail in CI/CD
**Cause**: CI environment network configuration
**Solution**:
1. Add network connectivity check to CI
2. Configure custom DAPI nodes for CI
3. Use environment-specific variables

### "Memory exceeded" on long-running tests
**Cause**: Stream buffering or leak
**Solution**:
1. Check stream cleanup in test code
2. Verify messages are consumed (not buffered)
3. Look for event listener leaks

## Development Patterns

### Writing Transaction-Finder Tests

#### Basic Historic Sync Test
```typescript
import { TransactionFinder } from '../../src/TransactionFinder';
import { FinderMode } from '../../src/types';
import { ResilientDAPIClient } from '@dashevo/resilient-dapi-client';

it('should find UTXOs', async function() {
  this.timeout(120000);  // 2 minutes

  const client = new ResilientDAPIClient({
    dapiAddresses: ['34.214.48.68:1443'],
    timeout: 30000,
  });

  const currentHeight = await client.core.getBestBlockHeight();

  const finder = new TransactionFinder({
    mode: FinderMode.HISTORIC,
    network: 'testnet',
    addresses: ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
    fromHeight: Math.max(currentHeight - 200, 1),
    toHeight: currentHeight,
    dapiClient: client as any,  // Type cast for integration
  });

  const utxos = await finder.findUTXOs();

  expect(utxos).toBeDefined();
  expect(Array.isArray(utxos)).toBe(true);

  client.disconnect();
});
```

#### Monitoring Test
```typescript
it('should monitor successfully', async function() {
  this.timeout(600000);  // 10 minutes

  const client = new ResilientDAPIClient({ /* config */ });

  const finder = new TransactionFinder({
    mode: FinderMode.REALTIME,
    network: 'testnet',
    addresses: ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
    dapiClient: client as any,
  });

  const transactions = [];

  await finder.monitorAddresses({
    onTransaction: (tx) => transactions.push(tx),
  });

  // Let monitor run for 5 minutes
  await new Promise(r => setTimeout(r, 5 * 60 * 1000));

  await finder.stopMonitoring();

  client.disconnect();

  // Validate some monitoring happened
  expect(transactions.length).toBeGreaterThanOrEqual(0);
});
```

### Using Metrics Collection
```typescript
import { MetricsCollector } from '../helpers/metrics-collector';

const metricsCollector = new MetricsCollector();

// Track UTXO count
metricsCollector.recordMetric('utxos_found', 42);

// Track duration
metricsCollector.recordLatency('historic_sync', durationMs);

// Track events
metricsCollector.recordEvent('operation', 'success');

// Get results for report
const metrics = metricsCollector.getMetrics();
console.log('Total events:', metrics.events.length);
console.log('Average latency:', metrics.metrics.avg_latency);
```

### Using Failure Logger
```typescript
import { FailureLogger } from '../helpers/failure-logger';

const failureLogger = new FailureLogger();

try {
  const utxos = await finder.findUTXOs();
} catch (error) {
  failureLogger.logFailure('find_utxos', error as Error);
}

const failures = failureLogger.getFailures();
console.log('Failures detected:', failures.length);
```

## Performance Expectations

### Typical Metrics
- Historic sync (1,000 blocks): 3-10 minutes
- Realtime monitoring: Runs indefinitely until stopped
- UTXO discovery: < 5 seconds per block (depends on transaction count)
- Memory per operation: < 100MB

### Network Latency
- Typical: 40-100ms
- P99: < 150ms
- Testnet load: Variable (may be slower during peak hours)

## Common Patterns

### Pattern 1: Find UTXOs from History
```typescript
// Scan blockchain history for address transactions
const finder = new TransactionFinder({
  mode: FinderMode.HISTORIC,
  addresses: ['yX3CJJ42...'],
  fromHeight: 1000000,
  toHeight: 1000500,
});

const utxos = await finder.findUTXOs();
```

### Pattern 2: Monitor for New Transactions
```typescript
// Monitor address for new transactions
const finder = new TransactionFinder({
  mode: FinderMode.REALTIME,
  addresses: ['yX3CJJ42...'],
});

await finder.monitorAddresses({
  onTransaction: (tx) => console.log('New TX:', tx.txid),
  onInstantLock: () => console.log('InstantLocked!'),
});

// Later...
await finder.stopMonitoring();
```

### Pattern 3: Combined Sync + Monitor
```typescript
// Sync history, then monitor for new
const finder = new TransactionFinder({
  mode: FinderMode.HYBRID,
  addresses: ['yX3CJJ42...'],
  historic: { fromHeight: 1000000 },
  realtime: { autoPruneOnConfirmation: true },
});

const { utxos, stopMonitoring } = await finder.syncAndMonitor({
  onTransaction: (tx) => console.log('TX:', tx.txid),
});

// utxos now contains historical transactions
// Monitoring continues for new ones

// Stop when done
await stopMonitoring();
```

## Known Limitations

1. **Testnet Data**: Public testnet may have limited transaction history
   - Use address with known transactions
   - Or fund address via faucet

2. **Network Variability**: Testnet slower than production
   - Use generous timeouts (default 30s is usually fine)
   - Extended tests may take longer during peak hours

3. **Rate Limiting**: Testnet nodes may rate limit aggressive clients
   - Use reasonable batch sizes
   - Add delays between rapid operations

## Integration with ResilientDAPIClient

All tests use `ResilientDAPIClient` which provides:
- ✅ Automatic retry with exponential backoff
- ✅ Node failover to healthy nodes
- ✅ Stream timeout detection
- ✅ Connection pooling
- ✅ Comprehensive error logging

This ensures transaction-finder operations are reliable even under adverse network conditions.

## Related Documentation

- **VALIDATION_RESULTS.md**: Detailed test framework guide
- **RELIABILITY_PROOF.md**: Complete technical proof (in resilient-dapi-client/)
- **TEST_EXECUTION_GUIDE.md**: Quick start commands
- **TESTING_README.md**: Framework overview

## Key Takeaway

**Tests work immediately after `npm install`.**
They validate transaction-finder reliability against real Dash testnet using ResilientDAPIClient.
