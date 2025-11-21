# CLAUDE.md - ResilientDAPIClient Testing Guide

This file documents how to work with tests in the ResilientDAPIClient package.

## Important: No Local Testnet Setup Required

**Tests connect to public Dash Platform testnet DAPI nodes.** You do NOT need to:
- Start Docker containers
- Run local blockchain nodes
- Set up any local services
- Wait for anything to initialize

Tests work immediately after `npm install`.

## Test Infrastructure

### What Tests Connect To

Tests connect to **live Dash Platform testnet** via ~33 hardcoded DAPI node addresses from the `@dashevo/dapi-client` package:

```javascript
// From @dashevo/dapi-client/lib/networkConfigs.js
dapiAddressesWhiteList: [
  '34.214.48.68:1443',      // Reliable DCG nodes
  '35.166.18.166:1443',
  '35.165.50.126:1443',
  // ... 30 more public nodes
]
```

These are reliable Dash Core Group (DCG) testnet masternodes specifically selected because they provide consistent data (see: `@dashevo/dapi-client` for why a whitelist is used).

### Test Files

```
tests/
├── unit/
│   └── ResilientDAPIClient.spec.ts              [Existing unit tests]
│
└── integration/
    ├── testnet-streaming.spec.ts                [11 mock tests - no network]
    ├── testnet-streaming-realworld.spec.ts      [7 real testnet tests]
    ├── testnet-basic.spec.ts                    [Existing basic tests]
    ├── testnet-concurrent.spec.ts               [Existing concurrent tests]
    └── helpers/
        ├── controllable-mock-client.ts          [Mock DAPI client]
        ├── metrics-collector.ts                 [Metrics tracking]
        ├── failure-logger.ts                    [Failure logging]
        ├── report-generator.ts                  [Report generation]
        └── testnet-config.ts                    [Testnet configuration]
```

## Running Tests

### Option 1: Quick Smoke Test (30 seconds)
```bash
# Run mock tests - validates framework without network
npm test tests/integration/testnet-streaming.spec.ts

# No network needed, runs locally
```

### Option 2: All Mock Tests (1-2 minutes)
```bash
# All mock streaming tests
npm test tests/integration/testnet-streaming.spec.ts
```

### Option 3: Real Testnet Validation (60-120 minutes)
```bash
# Real testnet streaming tests
npm test tests/integration/testnet-streaming-realworld.spec.ts -- --timeout=1800000

# Connects to public testnet, may take time
```

### Option 4: All Tests Including Existing Suite (30-45 minutes)
```bash
# Everything
npm test tests/integration/ -- --timeout=600000
```

## Environment Configuration

### What's Required
**Nothing.** Tests work with defaults.

### What's Optional
All environment variables are optional. Tests have sensible defaults:

```bash
# Optional: Override DAPI endpoints (defaults to public testnet whitelist)
export TESTNET_DAPI_ADDRESSES="localhost:1443,localhost:1444"

# Optional: Configure timeout for slow networks
export TESTNET_TIMEOUT=60000

# Optional: Specify test address (defaults included in testnet-config.ts)
export TESTNET_ADDRESS="yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy"

# Optional: Local Dash Core RPC (only needed for transaction broadcasting)
# If not set, RPC-dependent tests are skipped
export TESTNET_RPC_ENDPOINT="http://localhost:19998"
export TESTNET_RPC_USERNAME="dash"
export TESTNET_RPC_PASSWORD="dash"
```

Then run tests:
```bash
npm test tests/integration/testnet-streaming-realworld.spec.ts
```

## Test Organization

### Mock Streaming Tests (`testnet-streaming.spec.ts`) - NO NETWORK
- 11 tests validating streaming mechanics
- Uses `ControllableMockDAPIClient` with failure injection
- Tests: hangs, disconnects, corruption, timeouts
- Duration: ~30 seconds
- **Network**: Not required

### Real Testnet Tests (`testnet-streaming-realworld.spec.ts`) - REQUIRES NETWORK
- 7 tests against actual Dash testnet
- Real block header and transaction streaming
- Extended duration sessions (30+ minutes)
- Metrics collection and performance analysis
- Duration: 60-120 minutes (configurable)
- **Network**: Required (public internet access)

### Existing Integration Tests
- `testnet-basic.spec.ts`: Basic DAPI operations
- `testnet-concurrent.spec.ts`: Concurrent operation reliability
- Other test files for specific features

## Test Results

### Reports Generated
Tests auto-generate markdown reports in `test-results/`:
```bash
ls test-results/
# streaming-validation-2025-11-16T14-45-00Z.md
# realworld-validation-2025-11-16T15-00-00Z.md
# etc.
```

### Reading Reports
Reports include:
- Summary of operations tested
- Success/failure counts
- Latency metrics (avg, P50, P99)
- Memory usage (for leak detection)
- Any errors encountered

### Expected Results
```
Mock Tests (testnet-streaming.spec.ts):
✓ 11 tests pass in ~30 seconds
✓ 100% success rate (controlled environment)

Real Testnet Tests:
✓ 7 tests pass in 60-120 minutes
✓ 99%+ success rate (real network)
✓ Some variability due to network conditions
```

## Troubleshooting

### "Cannot connect to DAPI"
**Cause**: Network unreachable or all testnet nodes down
**Solution**:
1. Check internet connection: `ping 8.8.8.8`
2. Test DAPI connectivity: `curl -i https://34.214.48.68:1443/status`
3. If that fails, testnet nodes may be down - wait and retry
4. Override with custom nodes: `export TESTNET_DAPI_ADDRESSES="your.node:1443"`

### "Timeout after 30000ms"
**Cause**: Network slow or nodes slow to respond
**Solution**:
1. Increase timeout: `npm test -- --timeout=60000`
2. Wait for network to improve
3. Try running during off-peak hours

### "No data available" in streaming test
**Cause**: Normal - not all addresses have transactions
**Solution**: Not an error, test handles this correctly

### Tests pass locally but fail in CI/CD
**Cause**: CI environment might have different network access
**Solution**:
1. Check if CI can reach testnet: add network connectivity test
2. Configure custom DAPI nodes for CI environment
3. Use environment-specific variables in CI config

## Development Patterns

### Adding New Tests

#### For Mock Tests (No Network)
```typescript
import { ControllableMockDAPIClient } from './helpers/controllable-mock-client';

it('should handle [scenario]', async () => {
  const mockClient = new ControllableMockDAPIClient();

  // Configure mock behavior
  mockClient.setStreamBehavior('subscribeToBlockHeadersWithChainLocks', {
    messageCount: 100,
    hangAfterMessages: 50,  // Hang at 50 messages
  });

  // Test code
  const stream = mockClient.core.subscribeToBlockHeadersWithChainLocks();
  // Assert behavior
});
```

#### For Real Testnet Tests
```typescript
import { ResilientDAPIClient } from '../../src/index';

it('should [operation] on testnet', async function() {
  this.timeout(120000);  // 2 minute timeout

  const client = new ResilientDAPIClient({
    dapiAddresses: process.env.TESTNET_DAPI_ADDRESSES?.split(',') || ['34.214.48.68:1443'],
    timeout: 30000,
  });

  // Test against real testnet
  const result = await client.core.getBestBlockHeight();
  expect(result).toBeGreaterThan(0);

  client.disconnect();
});
```

### Metrics Collection
```typescript
const metricsCollector = new MetricsCollector();

// Track events
metricsCollector.recordEvent('operation', 'success');

// Track latency
metricsCollector.recordLatency('streaming', 45);

// Track metrics
metricsCollector.recordMetric('memory_mb', 32);

// Get results
const metrics = metricsCollector.getMetrics();
```

### Failure Logging
```typescript
const failureLogger = new FailureLogger();

try {
  // operation
} catch (error) {
  failureLogger.logFailure('operation_name', error);
}

const failures = failureLogger.getFailures();
```

## Performance Expectations

### Network Latency
- Typical latency to testnet DAPI: 40-100ms
- P99 latency: < 150ms
- Packet loss: < 1%

### Test Duration
- Mock tests: 30 seconds
- Basic testnet tests: 5-10 minutes
- Extended testnet tests: 30-120 minutes

### Memory Usage
- Per test process: < 100MB
- Long-running streams: < 50MB per 10K messages
- No memory leaks should be detected

## Known Limitations

1. **Testnet Reset**: Testnet may reset periodically - test data IDs might become invalid
   - Solution: Use fresh address for each test run

2. **Network Variability**: Public testnet can be slower/unreliable than production
   - Solution: Use generous timeouts for real testnet tests

3. **Rate Limiting**: Public nodes might rate limit if too many requests
   - Solution: Add delays between rapid operations in tests

## Related Documentation

- **RELIABILITY_PROOF.md**: Complete technical proof and deployment guide
- **TEST_EXECUTION_GUIDE.md**: Quick start commands for all test scenarios
- **TESTING_README.md**: Framework overview and navigation
- **testnet-config.ts**: Default testnet identities and contracts
- **controllable-mock-client.ts**: Mock DAPI client with failure injection API

## Key Takeaway

**Tests work immediately after `npm install` - no setup required.**
They connect to public Dash testnet for real-world validation of streaming reliability.
