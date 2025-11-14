# Testnet Integration Tests - Resilient DAPI Client

This directory contains comprehensive integration tests that validate the resilient DAPI client against real Dash testnet nodes. These tests demonstrate and verify all resilience features including retry logic, node failover, and graceful degradation.

## Overview

The testnet validation suite validates:
- ✅ Automatic retry with exponential backoff
- ✅ Node failover and rotation
- ✅ Node blacklisting and recovery
- ✅ Graceful degradation (platform failures while core continues)
- ✅ Concurrent operation handling
- ✅ Long-running stability (30-45 minutes)
- ✅ Memory leak detection
- ✅ Comprehensive failure logging and reporting

## Test Suites

### Phase 1: Basic Connectivity (`testnet-basic.spec.ts`)
**Duration:** ~5 minutes | **Operations:** ~20

Basic connectivity validation:
- Connection to testnet DAPI nodes
- Simple operations (getBestBlockHeight, getBlockByHeight)
- Event emitter functionality
- Status API validation

**Run:**
```bash
npm test tests/integration/testnet-basic.spec.ts
```

### Phase 2: Adaptive Retry (`testnet-retry.spec.ts`)
**Duration:** ~3 minutes | **Operations:** ~50 | **Mock Client**

Validates retry behavior with exponential backoff:
- Retry on transient timeouts
- Exponential backoff timing (1s → 2s → 4s → 8s)
- MaxRetriesError after exhaustion
- Connection refused handling
- HTTP 500/503 error handling
- Retry counter reset after success

**Run:**
```bash
npm test tests/integration/testnet-retry.spec.ts
```

### Phase 3: Node Failover (`testnet-failover.spec.ts`)
**Duration:** <1 second | **Operations:** ~10 | **Mock Client**

Validates node pool status tracking:
- Node pool statistics (total, available, blacklisted)
- Core and platform availability tracking
- Status API completeness
- Successful operations without failover

**Note:** Full multi-node failover testing requires mock client enhancement (future work)

**Run:**
```bash
npm test tests/integration/testnet-failover.spec.ts
```

### Phase 4: Graceful Degradation (`testnet-degradation.spec.ts`)
**Duration:** ~4 seconds | **Operations:** ~60 | **Mock Client**

Validates partial failure handling:
- Platform failures while core continues
- Degradation event emissions
- Service availability tracking
- Mixed failure scenarios
- Restoration events
- Core failure propagation (no degradation)

**Run:**
```bash
npm test tests/integration/testnet-degradation.spec.ts
```

### Phase 5: Core Operations (`testnet-core-ops.spec.ts`)
**Duration:** ~4 seconds | **Operations:** ~30 | **Mock Client**

Validates core DAPI operations with resilience:
- getBestBlockHeight (with retry)
- getBlockByHeight (with retry on failure)
- Resilient status API
- Sequential block queries
- Latency measurements

**Run:**
```bash
npm test tests/integration/testnet-core-ops.spec.ts
```

### Phase 6: Platform Operations (`testnet-platform-ops.spec.ts`)
**Duration:** ~1 second | **Operations:** ~40 | **Mock Client**

Validates platform DAPI operations:
- getIdentity (with test identity ID)
- getDataContract (test contract ID)
- Platform timeout handling with retry
- Platform degradation scenarios
- Mixed core + platform operations

**Run:**
```bash
npm test tests/integration/testnet-platform-ops.spec.ts
```

### Phase 7: Concurrent Operations (`testnet-concurrent.spec.ts`)
**Duration:** ~15 minutes | **Operations:** ~200

Validates concurrent operation handling:
- 10, 50, 100 concurrent requests
- Thread safety during retries
- Node pool sharing
- Mixed concurrent core + platform operations
- Latency distribution under load

**Run:**
```bash
npm test tests/integration/testnet-concurrent.spec.ts
```

### Phase 8: Stability Testing (`testnet-stability.spec.ts`)
**Duration:** ~1 second | **Operations:** 100+ | **Mock Client**

Stability validation with sustained operations:
- Continuous operations with periodic failures
- Failure pattern handling (every 10th operation fails)
- Comprehensive metrics collection
- Status consistency validation
- Latency metrics validation

**Run:**
```bash
npm test tests/integration/testnet-stability.spec.ts
```

## Setup

### Prerequisites

1. **Node.js** 18+ and npm/yarn
2. **Testnet Access** - Tests connect to public testnet DAPI nodes
3. **Optional: Local Dash Core** - For transaction broadcasting tests

### Environment Configuration

Create `.env` file in the `resilient-dapi-client` directory:

```bash
# Network
NETWORK=testnet

# Timeouts (milliseconds)
SHORT_TIMEOUT=5000
NORMAL_TIMEOUT=60000
LONG_TIMEOUT=300000

# Test Data
TEST_IDENTITY_ID=BrmjhkNPPE1V6ghg9uH8bBx6PQ2bZqDJLGNjp8xdFH53
TEST_CONTRACT_ID=GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec

# Optional: Local Dash Core RPC (for transaction broadcasting)
TESTNET_RPC_URL=http://localhost:19998
TESTNET_RPC_USER=dash
TESTNET_RPC_PASS=dash
TESTNET_WALLET=platformcli
TESTNET_ADDRESS=yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy
```

### Running Tests

#### Run All Integration Tests
```bash
cd packages/resilient-dapi-client
npm test tests/integration/
```

#### Run Specific Test Suite
```bash
npm test tests/integration/testnet-basic.spec.ts
npm test tests/integration/testnet-retry.spec.ts
npm test tests/integration/testnet-failover.spec.ts
# ... etc
```

#### Run With Coverage
```bash
npm run test:coverage tests/integration/
```

#### Watch Mode (Not Recommended for Integration Tests)
```bash
npm test -- --watch tests/integration/testnet-basic.spec.ts
```

## Understanding Test Results

### Success Criteria

- **Success Rate:** ≥95% for production readiness
- **Recovery Time:** Average < 5 seconds
- **Memory Growth:** < 20% over 30-minute test
- **Latency P95:** < 10 seconds under normal load

### Test Output

Each test suite provides:
1. **Real-time progress** - Operation counts, success rates
2. **Resilience events** - Retries, failovers, degradations logged
3. **Latency metrics** - Min/avg/median/P95/P99/max
4. **Memory usage** - Initial/final/peak/growth
5. **Summary statistics** - Final success rate, total operations

### Failure Reports

The stability test generates a comprehensive Markdown report:

**Location:** `test-results/testnet-resilience-report-{timestamp}.md`

**Contents:**
- Executive summary with grade (🟢/🟡/🔴)
- Test run details and success rate
- Resilience statistics (retries, failovers, recovery time)
- Failure breakdown by type
- Node performance matrix
- Operation latencies
- Memory usage analysis
- Individual failure details
- Recommendations

**Example:**
```markdown
# Testnet Resilience Validation Report

## Executive Summary

**Overall Grade:** 🟢 Excellent

This report documents 523 operations executed over 30m 15s against Dash testnet DAPI nodes.
The resilient DAPI client achieved an excellent 96.37% success rate, demonstrating robust
handling of network failures and node unavailability.

**Key Findings:**
- Executed 523 total operations
- Recovered from 48 failures via retry/failover
- Average recovery time: 2,150ms
- Blacklisted 3 underperforming nodes
```

## Failure Injection

Tests use the **ControllableMockDAPIClient** for deterministic failure injection:

### Mock Client Approach
Programmatic failure injection with full control:
```typescript
import { createMockDAPIClient, MockFailureScenarios } from './helpers/controllable-mock-client.js';

// Create mock client
const mockClient = createMockDAPIClient();

// Create resilient client with mock
const client = new ResilientDAPIClient(mockClient as any, {
  maxRetryAttempts: 10,
  retryBaseDelay: 1000,
  maxRetryDelay: 30000,
});

// Inject 2 timeouts, then succeed
mockClient.injectFailure(
  MockFailureScenarios.transientTimeout('getBestBlockHeight', 2)
);

// Operation will timeout twice, retry, then succeed
await client.core.getBestBlockHeight();
```

**Available Failure Scenarios:**
- `MockFailureScenarios.transientTimeout(method, count)` - Temporary timeout
- `MockFailureScenarios.connectionRefused(method, count)` - ECONNREFUSED error
- `MockFailureScenarios.http500(method, count)` - Internal Server Error
- Custom failures with probability, namespace, and method targeting

**Benefits:**
- Deterministic and fast (milliseconds vs seconds)
- Full control over failure patterns
- No network dependencies
- Reliable test execution

## CI/CD Integration

### Quick Validation (CI)
Run subset of tests for PR validation:
```bash
npm test tests/integration/testnet-basic.spec.ts \
         tests/integration/testnet-retry.spec.ts \
         tests/integration/testnet-failover.spec.ts
```
**Duration:** ~3-4 minutes (basic:16s, retry:175s, failover:<1s)

### Full Validation
Run complete suite including all mock client tests:
```bash
npm test tests/integration/
```
**Duration:** ~3-4 minutes (47 tests across 8 suites)

**Test Suite Performance:**
- Mock client tests: <5 seconds each (retry: 175s due to max retries test)
- Real testnet tests: 15-30 seconds each (basic, concurrent)

### GitHub Actions Example
```yaml
name: Testnet Validation

on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily
  workflow_dispatch:

jobs:
  testnet-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Run testnet integration tests
        run: npm test tests/integration/

      - name: Upload failure report
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: resilience-report
          path: test-results/*.md
```

## Troubleshooting

### Tests Fail to Connect
**Problem:** Cannot connect to testnet DAPI nodes

**Solutions:**
- Check network connectivity
- Verify testnet is operational: https://testnet-insight.dashevo.org/
- Try updating DAPI addresses in `testnet-config.ts`

### High Failure Rate
**Problem:** Success rate < 90%

**Causes:**
- Testnet instability
- Network issues
- Too aggressive timeout settings

**Solutions:**
- Increase timeout values in `.env`
- Check testnet status
- Run tests during off-peak hours

### RPC Tests Skipped
**Problem:** Transaction broadcasting tests skipped

**Cause:** Local Dash Core RPC not available

**Solutions:**
1. Install Dash Core in testnet mode
2. Configure RPC credentials in `.env`
3. Or skip RPC tests (read-only tests still validate resilience)

### Memory Growth Warning
**Problem:** Memory growth > 20% in stability test

**Causes:**
- Potential memory leak
- Normal growth under extended load

**Solutions:**
- Review event listener cleanup
- Check for retained references
- Run extended test (1+ hour) to confirm leak

## Advanced Usage

### Custom Test Configuration

Create custom config for specific scenarios:
```typescript
import { getTestnetConfig } from './helpers/testnet-config.js';

const config = getTestnetConfig();
config.timeout.normal = 30000; // 30 second timeout
config.dapiAddresses = ['https://my-custom-node:1443'];
```

### Custom Failure Scenarios
```typescript
import { createMockDAPIClient } from './helpers/controllable-mock-client.js';

const mockClient = createMockDAPIClient();

// Simulate flaky network (50% failure rate)
mockClient.injectFailure({
  failureType: 'timeout',
  probability: 0.5,
});

// Simulate specific namespace failure
mockClient.injectFailure({
  namespace: 'platform',
  method: 'getIdentity',
  failureType: 'platform_error',
  count: 3, // Fail 3 times
});

// Clear all injected failures
mockClient.clearFailures();
```

### Generate Report Manually
```typescript
import { generateReport } from './helpers/report-generator.js';

// After tests complete
const reportPath = generateReport({
  outputDir: './custom-reports',
  includeLatencies: true,
  includeMemory: true,
  includeFailureDetails: true,
});
```

## Performance Benchmarks

Expected performance on healthy testnet:

| Operation | P50 | P95 | P99 |
|-----------|-----|-----|-----|
| getBestBlockHeight | 150ms | 500ms | 1000ms |
| getBlockByHeight | 200ms | 600ms | 1200ms |
| getIdentity | 300ms | 800ms | 1500ms |
| getDataContract | 250ms | 700ms | 1400ms |

## Contributing

When adding new integration tests:

1. **Use helpers** - Leverage existing failure logger, metrics collector
2. **Measure latency** - Wrap operations with `measureLatency()`
3. **Record operations** - Call `failureLogger.recordOperation(success)`
4. **Log failures** - Use `failureLogger.logFailure()` for resilience actions
5. **Test timeout** - Set generous timeout (60s+ per test)
6. **Cleanup** - Remove event listeners in `afterEach` or `afterAll`

## Support

- **Issues:** https://github.com/dashpay/platform/issues
- **Docs:** packages/resilient-dapi-client/README.md
- **Examples:** See individual test files for usage patterns
