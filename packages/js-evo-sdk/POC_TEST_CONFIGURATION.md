# Queue + DAPI POC Test Configuration Guide

## Quick Start

### Step 1: Build the SDK
```bash
npm run build
```

### Step 2: Set Test Mnemonic (REQUIRED)

Edit: `tests/integration/wasm-concurrency-diagnostics/helpers/testnet-data.mjs`

Find line 32 and set your testnet mnemonic:
```javascript
export const TEST_MNEMONICS = {
  test_mnemonic_1: {
    mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',  // ← Set your mnemonic here
    // rest of config...
  }
};
```

### Step 3: Run POC Tests
```bash
node tests/integration/wasm-concurrency-diagnostics/run-poc-tests.mjs
```

---

## Configuration Options

### Test Mnemonic
**Location**: `tests/integration/wasm-concurrency-diagnostics/helpers/testnet-data.mjs` (line 32)

**What to Use**:
- A valid BIP39 12-word testnet mnemonic
- Should ideally have funded addresses for identity creation tests
- Can be generated with: `new Mnemonic().toString()`

**Example**:
```javascript
mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
```

### Test Parameters (Optional)

You can adjust timing and amounts in `helpers/testnet-data.mjs`:

```javascript
export function getPOCTestParameters() {
  return {
    queueCreateAmount: 200000,      // duffs to create identity (adjust for your balance)
    queueTopUpAmount: 50000,        // duffs to top up with
    dapiQueryTimeout: 10000,        // ms to wait for DAPI responses
    dapiQueryRetries: 2,            // times to retry failed DAPI queries
    // ... timing expectations
  };
}
```

**Recommended Adjustments**:
- Increase `queueCreateAmount` if testnet has high fees
- Increase `dapiQueryTimeout` if network is slow
- Increase `dapiQueryRetries` for unreliable networks

---

## Test Data Requirements

### For Scenario A (Queue Creates)
- ✅ Testnet mnemonic with funded addresses
- ✅ Enough balance for 3 identity creations (~600,000 duffs with default settings)
- ✅ Testnet accessible (connected via trustedTestnet)

### For Scenario B (Queue TopUps)
- ✅ Existing identity to top up (uses hardcoded testnet identity)
- ✅ Enough balance for 3 top-ups (~150,000 duffs with default settings)
- ✅ Testnet accessible

### For Scenario C (DAPI Reads)
- ✅ Testnet mnemonic (no balance needed, read-only)
- ✅ DAPI server accessible
- ✅ Network connectivity

### For Scenario D (Mixed)
- ✅ Combination of above requirements
- ✅ Enough balance for 2 creates + 3 top-ups

---

## Verifying Configuration

### Check Mnemonic is Set
```javascript
import { hasConfiguredMnemonics } from './helpers/testnet-data.mjs';

if (hasConfiguredMnemonics()) {
  console.log('✅ Mnemonic configured');
} else {
  console.log('❌ Mnemonic NOT configured');
}
```

### Validate Scenarios
```javascript
import { validateScenarioConfiguration } from './helpers/testnet-data.mjs';
import { POC_SCENARIOS } from './scenarios-queue-dapi.mjs';

Object.values(POC_SCENARIOS).forEach(scenario => {
  const validation = validateScenarioConfiguration(scenario);
  if (!validation.valid) {
    console.error(`Invalid: ${validation.errors.join(', ')}`);
  }
});
```

---

## Running Tests with Different Configurations

### Scenario A Only (Queue Creates)
```javascript
// In run-poc-tests.mjs, comment out scenarios B, C, D
const resultA = await runner.runScenario(
  POC_SCENARIOS.scenarioA_queue_concurrent_creates,
  sdk
);
```

### Scenario C Only (DAPI Reads - No Balance Needed)
```javascript
// DAPI reads don't require balance, just network connectivity
const resultC = await runner.runScenario(
  POC_SCENARIOS.scenarioC_dapi_concurrent_reads,
  sdk
);
```

### Custom Configuration
Create a custom test file:
```javascript
import QueueDAPITestRunner from './test-framework-queue-dapi.mjs';
import { POC_SCENARIOS } from './scenarios-queue-dapi.mjs';

const runner = new QueueDAPITestRunner();
runner.initialize(yourMnemonic, {
  createAmount: 300000,    // Custom amount
  topUpAmount: 100000,     // Custom amount
  dapiTimeout: 20000,      // Custom timeout
});

const result = await runner.runScenario(scenario, sdk);
```

---

## Troubleshooting

### "Test mnemonic not configured"
**Solution**: Set `TEST_MNEMONICS.test_mnemonic_1.mnemonic` to your testnet mnemonic

### "Insufficient balance"
**Solution**:
1. Check your testnet balance
2. Increase amount from testnet faucet
3. Reduce `queueCreateAmount` and `queueTopUpAmount` in test parameters

### "DAPI timeout"
**Solution**:
1. Check testnet connectivity
2. Increase `dapiQueryTimeout` in test parameters
3. Ensure testnet DAPI server is running

### "SDK not built"
**Solution**: Run `npm run build` before running tests

### "Identity not found"
**Solution**: Scenario B uses hardcoded testnet identity. If it doesn't exist:
1. Update the identity ID in `test-framework-queue-dapi.mjs`
2. Or skip Scenario B and run others

---

## Environment Variables (Optional)

You can override configuration via environment variables:

```bash
# Override network
TESTNET_NETWORK=testnet node run-poc-tests.mjs

# Override output directory
TESTNET_RESULTS_DIR=./my-results node run-poc-tests.mjs
```

---

## Results Output

Test results are automatically saved to:
```
test-results/wasm-diagnostics/
├── results.json        # Detailed results for all scenarios
├── summary.json        # Aggregated statistics
└── results.csv         # CSV export for analysis
```

### Sample Results Structure
```json
{
  "testCase": "Queue: Concurrent Identity Creates",
  "operationCount": 3,
  "successCount": 3,
  "failureCount": 0,
  "lockError": false,
  "totalExecutionTime": 450,
  "operationDetails": [
    {
      "operationIndex": 0,
      "operationType": "identity-create",
      "success": true,
      "duration": 150,
      "lockDetected": false
    },
    // ... more operations
  ]
}
```

---

## Pre-Flight Checklist

- [ ] SDK built with `npm run build`
- [ ] Test mnemonic set in `helpers/testnet-data.mjs`
- [ ] Testnet mnemonic has sufficient balance
- [ ] Testnet is accessible (network connectivity)
- [ ] DAPI server running (for DAPI scenarios)
- [ ] `run-poc-tests.mjs` file exists

---

## Next Steps

1. **Configure mnemonic** in `helpers/testnet-data.mjs`
2. **Build SDK** with `npm run build`
3. **Run tests** with `node tests/integration/wasm-concurrency-diagnostics/run-poc-tests.mjs`
4. **Review results** in `test-results/wasm-diagnostics/`
5. **Proceed to Phase 4** if all tests pass

---

## Support

For detailed information:
- See `PHASE_3_QUICKSTART.md` for execution guide
- See `POC_IMPLEMENTATION_INDEX.md` for quick reference
- See `POC_OVERVIEW.md` for architecture details

Good luck! 🚀
