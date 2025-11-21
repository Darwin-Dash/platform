# Integration Tests

Integration tests validate the SDK functionality against a real Dash testnet environment.

## Prerequisites

Before running integration tests, ensure:

1. **Testnet is running**
   ```bash
   cd /Users/user/Sync/Code/Dash/platform-feat-js-evo-sdk-identities
   yarn start
   ```

2. **Test wallet has funds**
   - Wallet must have Dash credits for identity creation
   - Minimum recommended: 1000 credits
   - Configure via environment variables (see Setup section)

3. **DAPI endpoints are accessible**
   - Default testnet: localhost:1443
   - Can be customized via `TESTNET_DAPI_ENDPOINT`

## Setup

Set environment variables before running tests:

```bash
# Required for integration tests
export TESTNET_DAPI_ENDPOINT=localhost:1443
export TESTNET_RPC_ENDPOINT=http://localhost:19998
export TESTNET_RPC_USERNAME=dash
export TESTNET_RPC_PASSWORD=dash
export TESTNET_WALLET_ADDRESS=yXXXXXXXXXXXXXXXXXXXXXXXXX

# Optional
export LOG_LEVEL=debug              # Enable debug logging
export SKIP_INTEGRATION_TESTS=false # Run integration tests (default)
```

## Running Tests

Run all integration tests:
```bash
npm test -- tests/integration/
```

Run specific test file:
```bash
npm test -- tests/integration/identity-creation-fetch.test.ts
```

Run with specific pattern:
```bash
npm test -- --grep "batch discovery"
```

## Test Files

### Phase 4A: Investigation Tests

#### `batch-discovery-investigation.test.ts`
**Purpose**: Investigate the "locked reader" error in batch operations

**Tests**:
- Small batches (5 hashes) - should pass
- Medium batches (25 hashes) - may fail
- Large batches (50+ hashes) - likely to fail
- Concurrent batch queries - stress test

**Expected Results**:
- Documents exact batch size threshold where error occurs
- Measures performance for different batch sizes
- Identifies if concurrent batches affect error rate

**Run Command**:
```bash
npm test -- tests/integration/batch-discovery-investigation.test.ts
```

#### `performance-baseline.test.ts`
**Purpose**: Establish performance baseline for Phase 4 optimization

**Metrics Collected**:
- Individual operation latency (min/max/avg)
- Batch operation throughput
- Memory usage before/after GC
- CPU utilization during operations

**Success Criteria**:
- All latencies documented
- Baseline saved for regression testing
- Performance within acceptable limits

### Phase 4B: Core Scenario Tests

#### `identity-creation-fetch.test.ts`
**Purpose**: Basic end-to-end identity creation and retrieval

**Scenarios**:
1. Create identity with wallet
2. Fetch identity by ID
3. Validate returned data
4. Check keys and balance

#### `identity-topup.test.ts`
**Purpose**: Test credit top-up operations

**Scenarios**:
1. Create identity
2. Record initial balance
3. Top up credits
4. Fetch updated identity
5. Validate balance increased

#### `identity-batch-discovery.test.ts`
**Purpose**: Test batch discovery with optimal configuration

**Scenarios**:
- Small batch discovery (10 identities)
- Large batch discovery (100 identities)
- Concurrent batch queries
- Error handling for invalid hashes

#### `identity-error-handling.test.ts`
**Purpose**: Validate error handling and edge cases

**Scenarios**:
- Non-existent identity fetch
- Invalid hash format
- Insufficient funds
- Invalid update data
- Network timeout handling

## Known Issues

### "Already Locked to a Reader" Error

**Status**: Under investigation (Phase 4A)

**Affected Operations**:
- `discoverByHashBatch()` with 50+ hashes

**Workaround**: Use smaller batch sizes (< 25 hashes) or use sequential single-hash discovery

**Solution**: Will be resolved in Phase 4 with either:
- Option 1: Parallel workers per hash (sequential workers approach)
- Option 2: Sub-batching with fresh SDK instances

See `LOCKED_READER_ERROR_INVESTIGATION.md` for details.

## Debugging Integration Tests

Enable detailed logging:

```bash
LOG_LEVEL=debug npm test -- tests/integration/batch-discovery-investigation.test.ts
```

### Common Issues

**1. Connection refused**
- Ensure testnet is running: `yarn start`
- Check DAPI endpoint configuration
- Verify firewall allows localhost:1443

**2. Insufficient funds**
- Get testnet address from test output
- Request funds from testnet faucet
- Wait for confirmation

**3. Memory issues during large batches**
- Reduce batch size for now (Phase 4A issue)
- Increase Node.js heap size: `NODE_OPTIONS="--max-old-space-size=4096"`
- Monitor memory with: `watch -n 1 'ps aux | grep node'`

**4. Tests timeout**
- Testnet may be slow - increase timeout in test files
- Check network connectivity
- Verify DAPI endpoints are responsive: `curl -k https://localhost:1443/api/status`

## Continuous Monitoring

After Phase 4 completion, set up monitoring:

```bash
# Run integration tests regularly
npm run test:integration

# Check performance against baseline
npm run test:integration:performance

# Monitor for regressions
npm run test:integration:regression
```

## Contributing

When adding new integration tests:

1. Use test template from existing test files
2. Add comprehensive error handling
3. Include performance metrics
4. Document expected behavior
5. Add to this README
6. Run full integration suite before committing

## Resources

- [PHASE_4_INTEGRATION_TEST_PLAN.md](../PHASE_4_INTEGRATION_TEST_PLAN.md) - Full Phase 4 plan
- [LOCKED_READER_ERROR_INVESTIGATION.md](../LOCKED_READER_ERROR_INVESTIGATION.md) - Error investigation
- [IDENTITY_ARCHITECTURE.md](../IDENTITY_ARCHITECTURE.md) - SDK architecture
- Test fixtures: `tests/integration/fixtures/`

---

**Last Updated**: 2025-11-17
**Status**: Phase 4A - Investigation Starting
