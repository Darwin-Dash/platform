# Quick Test Execution Guide

**Purpose**: Run the complete ResilientDAPIClient test infrastructure
**Difficulty**: Easy
**Time Required**: 30 seconds to 5 hours depending on test scope

---

## Option 1: Quick Smoke Test (30 seconds)

Validate test framework works without running full suite:

```bash
cd packages/resilient-dapi-client

# Run just the mock streaming tests
npm test tests/integration/testnet-streaming.spec.ts

# Expected output:
# ✓ Streaming Operations - Mock Tests
#   ✓ subscribeToBlockHeadersWithChainLocks
#     ✓ should successfully stream 1,000 headers
#     ✓ should recover from mid-stream disconnect
#     ...
# ✅ 11 tests passing
```

---

## Option 2: Component Validation (15 minutes each)

Run individual test suites to validate specific components:

### A. Mock Streaming (15 seconds)
```bash
cd packages/resilient-dapi-client
npm test tests/integration/testnet-streaming.spec.ts
```

### B. Transaction-Finder Reliability (30-45 min)
```bash
cd packages/transaction-finder
npm test tests/integration/reliability-validation.spec.ts \
  --timeout=600000
```

### C. Comparison Tests (45-60 min)
```bash
cd packages/transaction-finder
npm test tests/integration/resilience-comparison.spec.ts \
  --timeout=600000
```

---

## Option 3: Real Testnet Validation (60-120 minutes)

Tests connect to public Dash testnet automatically - no setup required:

```bash
cd packages/resilient-dapi-client

# Run real testnet tests (connects to public testnet DAPI nodes)
npm test tests/integration/testnet-streaming-realworld.spec.ts \
  --timeout=1800000

# Tests use hardcoded reliable Dash testnet nodes
# No local setup needed - works immediately
```

---

## Option 4: Full Validation Suite (2-5 hours)

Complete validation of all components (no setup needed):

```bash
# All tests connect to public testnet automatically
cd packages/resilient-dapi-client

# Run resilient-dapi-client tests (~90 minutes)
npm test -- --timeout=600000 \
  tests/integration/testnet-streaming.spec.ts \
  tests/integration/testnet-streaming-realworld.spec.ts

# Then transaction-finder tests (~90 minutes)
cd ../transaction-finder

npm test -- --timeout=600000 \
  tests/integration/reliability-validation.spec.ts \
  tests/integration/resilience-comparison.spec.ts

# Reports automatically generated in test-results/
ls test-results/
```

---

## Environment Configuration

### Default Configuration
Tests work out of the box with sensible defaults:
- DAPI Endpoints: ~33 public Dash testnet nodes (from `@dashevo/dapi-client`)
- Test Address: `yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy` (or any address)
- Timeout: 30 seconds per operation
- Network: Public Dash Platform testnet

**You don't need to set anything.** Tests work immediately after `npm install`.

### Optional Configuration
Only set if you need custom behavior:

```bash
# Optional: Override DAPI endpoints (rarely needed)
export TESTNET_DAPI_ADDRESSES="custom.node:1443,another.node:1443"

# Optional: Override test address
export TESTNET_ADDRESS="yYourAddressHere"

# Optional: Local Dash Core RPC (only for transaction broadcasting)
# Tests skip RPC-dependent tests if not configured
export TESTNET_RPC_ENDPOINT="http://localhost:19998"
export TESTNET_RPC_USERNAME="dash"
export TESTNET_RPC_PASSWORD="dash"

# Then run tests (optional config is loaded automatically)
npm test tests/integration/testnet-streaming-realworld.spec.ts
```

---

## Interpreting Results

### Success Output
```
✓ Test Suite Name (duration)
  ✓ Test Name (duration)
  ✓ Test Name (duration)
  ...
  ✓ Last Test (duration)

Tests:  32 passed in 2.5 seconds
```

### Failure Output
```
✗ Test Suite Name
  ✗ Test Name
    Error: [detailed error message]
    at [file:line]

Tests:  30 passed, 2 failed in 1.2 seconds
```

**What to do on failure:**
1. Check the error message for details
2. Review test output above the error
3. Consult RELIABILITY_PROOF.md troubleshooting section
4. Check testnet is running (if real network test)
5. Verify DAPI endpoints are accessible

---

## Checking Results

### View Generated Reports
```bash
# Reports are saved after each test run
ls test-results/

# View a report
cat test-results/streaming-validation-*.md
cat test-results/transaction-finder-validation-*.md
cat test-results/resilience-comparison-*.md
```

### Check Metrics
Reports include:
- Test duration
- Success rate
- Latency (P50, P99)
- Memory usage
- Failure details (if any)

---

## Common Issues & Solutions

### Issue: `ECONNREFUSED 127.0.0.1:1443`
```
Cause: DAPI server not running
Solution:
  1. Start testnet: yarn start
  2. Wait for it to initialize (1-2 min)
  3. Re-run tests
```

### Issue: `Timeout after 30000ms`
```
Cause: Network too slow or server overloaded
Solution:
  1. Increase timeout: --timeout=60000
  2. Check network connectivity
  3. Restart testnet: yarn restart
  4. Try again
```

### Issue: `No UTXOs found for address`
```
Cause: Test address has no transaction history
Solution:
  1. Use address with transactions
  2. Or use testnet faucet to fund address
  3. Update TESTNET_ADDRESS env var
  4. Re-run test
```

### Issue: Tests fail but mock tests pass
```
Cause: Real testnet issue, not framework issue
Solution:
  1. Check testnet is stable
  2. Restart testnet: yarn restart
  3. Wait 5 minutes for sync
  4. Re-run tests
```

---

## Quick Reference Commands

| Task | Command |
|------|---------|
| Run all mock tests | `npm test testnet-streaming.spec.ts` |
| Run real testnet tests | `npm test testnet-streaming-realworld.spec.ts --timeout=1800000` |
| Run transaction-finder tests | `cd transaction-finder && npm test reliability-validation.spec.ts --timeout=600000` |
| Run comparison tests | `cd transaction-finder && npm test resilience-comparison.spec.ts --timeout=600000` |
| Run single test | `npm test testnet-streaming.spec.ts -- --grep "should successfully"` |
| View reports | `ls test-results/ && cat test-results/*.md` |
| Clean results | `rm -rf test-results/` |
| Setup environment | `export TESTNET_DAPI_ADDRESSES=localhost:1443` |

---

## Expected Success Criteria

### Mock Tests (Should Always Pass)
- ✅ 11 tests passing
- ✅ Duration: < 1 minute
- ✅ No real network required

### Real Testnet Tests (Should Pass)
- ✅ 7 tests passing
- ✅ Duration: 60-120 minutes
- ✅ Requires testnet running

### Transaction-Finder Tests (Should Pass)
- ✅ 9 tests passing
- ✅ Duration: 30-60 minutes
- ✅ Requires testnet running

### Comparison Tests (Should Pass)
- ✅ 5 tests passing
- ✅ Duration: 45-90 minutes
- ✅ Requires testnet running

### Overall Goal
- ✅ 32/32 tests passing
- ✅ All reports generated
- ✅ No memory leaks detected
- ✅ Success rate > 99%

---

## Next Steps After Tests Pass

1. **Review Reports**
   ```bash
   cat test-results/streaming-validation-*.md
   ```

2. **Check Success Rates**
   - Should be > 99% for normal operations
   - Should be > 90% under failure injection

3. **Review Metrics**
   - Latency: P50 < 50ms, P99 < 125ms
   - Memory: < 50MB for long operations
   - Recovery: < 2 seconds for failover

4. **Generate Summary**
   ```bash
   echo "All tests passed! Ready for staging deployment."
   ```

---

## Support

For detailed information:
- Full documentation: `RELIABILITY_PROOF.md`
- Transaction-finder guide: `VALIDATION_RESULTS.md`
- Implementation summary: `TEST_INFRASTRUCTURE_SUMMARY.md`

For issues:
1. Check the error message
2. Consult troubleshooting section above
3. Review test source code
4. Check testnet logs

---

**Last Updated**: 2025-11-16
**Status**: ✅ Ready to execute
