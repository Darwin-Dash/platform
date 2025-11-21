# Integration Testing Plan for Identity Facades

## Overview

This document outlines the integration testing strategy for the new identity facade architecture. Integration tests validate real network operations on testnet with actual DAPI calls, Platform queries, and blockchain transactions.

## Prerequisites

### Test Wallet Setup
```bash
# Required environment variables for funded test wallet
export TEST_MNEMONIC="your twelve word testnet mnemonic here"
export TEST_START_HEIGHT="1330000"  # Recent blockchain height
export TEST_IDENTITY_ID="existing_identity_id_for_topup_tests"  # Optional
```

### Testnet Requirements
- Funded wallet with at least 0.01 DASH (~1,000,000 duffs)
- Access to testnet DAPI servers
- Patience (tests take 5-15 minutes each due to confirmation waits)

## Integration Test Structure

### Location
```
tests/functional/facades/
├── identity-fetcher-integration.spec.mjs
├── identity-discovery-integration.spec.mjs
├── credit-operations-integration.spec.mjs
├── identity-creator-integration.spec.mjs
└── identity-updater-integration.spec.mjs
```

## Test Suites

### 1. IdentityFetcher Integration Tests

**Purpose**: Verify read operations against real Platform

**Test Cases:**
- ✅ Fetch existing testnet identity by ID
- ✅ Fetch identity with proof (verify proof structure)
- ✅ Fetch unproved identity (verify faster execution)
- ✅ Get all keys for known identity
- ✅ Get specific keys by ID
- ✅ Get keys by purpose (AUTHENTICATION, TRANSFER)
- ✅ Pagination with limit/offset

**Duration**: ~30 seconds (no transactions)
**Network**: Testnet
**Funds Required**: None (read-only)

**Template:**
```javascript
describe('IdentityFetcher Integration', function() {
  this.timeout(60000);
  let sdk;

  before(async () => {
    sdk = EvoSDK.testnetTrusted();
    await sdk.connect();
  });

  it('should fetch real identity from testnet', async () => {
    const identityId = TEST_IDS.identityId;
    const identity = await sdk.identities.fetch(identityId);

    expect(identity).to.exist;
    expect(identity.getId()).to.exist;
    expect(identity.getBalance()).to.be.a('number');
  });

  // ... more tests
});
```

### 2. IdentityDiscovery Integration Tests

**Purpose**: Verify discovery operations with real Platform queries

**Test Cases:**
- ✅ Discover identity by known public key hash
- ✅ Batch discover multiple identities
- ✅ Scan by index with generator function
- ✅ Gap detection stops after consecutive not-found
- ✅ Progress callback receives updates

**Duration**: ~2 minutes (Platform queries)
**Network**: Testnet
**Funds Required**: None (read-only)

**Template:**
```javascript
it('should discover identity by public key hash', async () => {
  const discovery = sdk.identities.discovery;
  const result = await discovery.discoverByHash(TEST_IDS.publicKeyHashUnique);

  expect(result.found).to.be.true;
  expect(result.identityId).to.exist;
});
```

### 3. CreditOperations Integration Tests

**Purpose**: Verify credit transfers and withdrawals

**Test Cases:**
- ⚠️ Transfer credits between two owned identities
- ⚠️ Withdraw credits to blockchain address
- ⚠️ Verify balance updates after transfer
- ⚠️ Verify withdrawal transaction appears on-chain

**Duration**: ~5 minutes per test (includes confirmations)
**Network**: Testnet
**Funds Required**: YES - Requires funded identity with private keys
**Environment**:
```bash
export TEST_IDENTITY_ID_1="funded_identity_id"
export TEST_IDENTITY_PRIVATE_KEY_1="private_key_wif"
export TEST_IDENTITY_ID_2="recipient_identity_id"
export TEST_WITHDRAWAL_ADDRESS="testnet_address"
```

**Template:**
```javascript
it.skip('should transfer credits between identities', async function() {
  if (!process.env.TEST_IDENTITY_ID_1) this.skip();
  this.timeout(300000); // 5 minutes

  const result = await sdk.identities.creditTransfer({
    senderId: process.env.TEST_IDENTITY_ID_1,
    recipientId: process.env.TEST_IDENTITY_ID_2,
    amount: 10000,
    privateKeyWif: process.env.TEST_IDENTITY_PRIVATE_KEY_1
  });

  expect(result).to.exist;
  // Verify transaction ID returned
  // Check recipient balance increased
});
```

### 4. IdentityCreator Integration Tests

**Purpose**: Verify complete identity creation workflow on testnet

**Test Cases:**
- ⚠️ Create identity with funded mnemonic (full workflow)
- ⚠️ Progress callback receives all 6 phases
- ⚠️ Verify identity exists on Platform after creation
- ⚠️ Verify correct balance after creation
- ⚠️ Handle insufficient funds error gracefully
- ⚠️ Handle network errors with retry

**Duration**: 5-15 minutes per test
**Network**: Testnet
**Funds Required**: YES - 0.002+ DASH per test
**Environment**:
```bash
export TEST_MNEMONIC="twelve word mnemonic with funds"
export TEST_START_HEIGHT="1330000"
```

**Template:**
```javascript
describe('IdentityCreator Integration', function() {
  this.timeout(900000); // 15 minutes

  it.skip('should create identity with wallet coordination', async function() {
    if (!process.env.TEST_MNEMONIC) this.skip();

    const phases = [];
    const result = await sdk.identities.createWithWallet(
      process.env.TEST_MNEMONIC,
      200000,
      {
        startHeight: Number(process.env.TEST_START_HEIGHT || 1),
        onProgress: (event) => {
          phases.push(event.phase);
          console.log(`[${event.phase}] ${event.message}`);
        }
      }
    );

    // Verify result
    expect(result.status).to.equal('success');
    expect(result.identityId).to.exist;
    expect(result.balance).to.equal(200000);

    // Verify all phases occurred
    expect(phases).to.include('wallet_setup');
    expect(phases).to.include('identity_discovery');
    expect(phases).to.include('transaction_creation');
    expect(phases).to.include('transaction_broadcast');
    expect(phases).to.include('confirmation_wait');
    expect(phases).to.include('identity_creation');

    // Verify identity exists on Platform
    const identity = await sdk.identities.fetch(result.identityId);
    expect(identity).to.exist;
  });
});
```

### 5. IdentityUpdater Integration Tests

**Purpose**: Verify identity top-up workflow on testnet

**Test Cases:**
- ⚠️ Top up existing identity (full workflow)
- ⚠️ Progress callback receives all 5 phases
- ⚠️ Verify balance increased correctly
- ⚠️ Handle identity not found error
- ⚠️ Handle insufficient funds error

**Duration**: 3-10 minutes per test
**Network**: Testnet
**Funds Required**: YES - 0.0005+ DASH per test
**Environment**:
```bash
export TEST_MNEMONIC="twelve word mnemonic with funds"
export TEST_IDENTITY_ID="identity_to_topup"
export TEST_START_HEIGHT="1330000"
```

**Template:**
```javascript
it.skip('should top up identity with wallet coordination', async function() {
  if (!process.env.TEST_MNEMONIC || !process.env.TEST_IDENTITY_ID) this.skip();
  this.timeout(600000); // 10 minutes

  // Get initial balance
  const initialBalance = await sdk.identities.balance(process.env.TEST_IDENTITY_ID);

  const phases = [];
  const result = await sdk.identities.topUpWithWallet(
    process.env.TEST_IDENTITY_ID,
    50000,
    process.env.TEST_MNEMONIC,
    {
      startHeight: Number(process.env.TEST_START_HEIGHT || 1),
      onProgress: (event) => {
        phases.push(event.phase);
        console.log(`[${event.phase}] ${event.message}`);
      }
    }
  );

  // Verify result
  expect(result.status).to.equal('success');
  expect(result.addedAmount).to.equal(50000);
  expect(result.newBalance).to.equal(initialBalance + 50000);

  // Verify phases
  expect(phases).to.include('wallet_setup');
  expect(phases).to.include('transaction_creation');
  expect(phases).to.include('transaction_broadcast');
  expect(phases).to.include('confirmation_wait');
  expect(phases).to.include('identity_topup');

  // Verify balance on Platform
  const newBalance = await sdk.identities.balance(process.env.TEST_IDENTITY_ID);
  expect(newBalance).to.equal(initialBalance + 50000);
});
```

## Running Integration Tests

### Quick Read-Only Tests (No Funds)
```bash
# Run fetcher and discovery tests
yarn run test:functional:readonly

# Or manually:
npx mocha tests/functional/facades/identity-fetcher-integration.spec.mjs --exit
npx mocha tests/functional/facades/identity-discovery-integration.spec.mjs --exit
```

### Full Integration Tests (Requires Funds)
```bash
# Set up environment
export TEST_MNEMONIC="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
export TEST_START_HEIGHT="1330000"
export TEST_IDENTITY_ID="existing_identity_id"

# Run all integration tests (WARNING: Consumes funds!)
yarn run test:functional:integration

# Or run individually:
npx mocha tests/functional/facades/identity-creator-integration.spec.mjs --exit
npx mocha tests/functional/facades/identity-updater-integration.spec.mjs --exit
npx mocha tests/functional/facades/credit-operations-integration.spec.mjs --exit
```

### Local Network Tests (Faster)
```bash
# Use local dashmate network for faster testing
export NETWORK=local
export DAPI_ADDRESS="10.0.0.119:2443"
export TEST_MNEMONIC="local_funded_mnemonic"

yarn run test:functional:local
```

## Test Data Management

### Creating Test Identities
```bash
# Script to create test identities for integration testing
node scripts/create-test-identity.js \
  --mnemonic "$TEST_MNEMONIC" \
  --amount 200000 \
  --network testnet
```

### Funding Test Wallets
1. Get testnet coins from faucet: https://testnet-faucet.dash.org
2. Send to address generated from test mnemonic
3. Wait for 6 confirmations
4. Set TEST_START_HEIGHT to height of funding transaction

## Expected Results

### Success Criteria
- ✅ All read operations complete in < 5 seconds
- ✅ Identity creation completes in 5-15 minutes
- ✅ Identity top-up completes in 3-10 minutes
- ✅ All progress phases emit events
- ✅ Created identities appear on Platform
- ✅ Balance updates reflect correctly
- ✅ Confirmations received (InstantLock or ChainLock)

### Known Issues / Limitations
- Testnet can be slow (15+ minute confirmations possible)
- DAPI servers may be unavailable (test will timeout)
- InstantLock requires masternode quorum (may not always succeed)
- ChainLock fallback adds 2.5 minutes

## Error Scenarios to Test

### Validation Errors (Should Fail Fast)
- Invalid mnemonic (not 12 words)
- Amount below minimum
- Invalid startHeight
- Invalid identity ID format

### Network Errors (Should Retry)
- DAPI connection timeout
- DAPI server unavailable
- Transaction broadcast failure (temporary)

### Operational Errors (Should Report Clearly)
- Insufficient funds
- Identity not found
- Confirmation timeout
- Platform rejection

## Continuous Integration

### CI/CD Pipeline Integration
```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: yarn install
      - run: yarn build
      - run: npx mocha tests/unit/**/*.spec.mjs --exit

  integration-tests-readonly:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: yarn install
      - run: yarn build
      - run: npx mocha tests/functional/facades/*-integration.spec.mjs --grep "read-only" --exit

  integration-tests-funded:
    runs-on: ubuntu-latest
    # Only run on main branch or manual trigger
    if: github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'
    steps:
      - uses: actions/checkout@v3
      - run: yarn install
      - run: yarn build
      - env:
          TEST_MNEMONIC: ${{ secrets.TESTNET_MNEMONIC }}
          TEST_START_HEIGHT: "1330000"
        run: npx mocha tests/functional/facades/identity-creator-integration.spec.mjs --exit
```

## Next Steps

1. **Create test wallet on testnet**
   - Generate new mnemonic or use existing
   - Fund with testnet faucet
   - Record blockchain height of funding

2. **Write integration test files**
   - Start with read-only tests (fetcher, discovery)
   - Add funded tests (creator, updater) when ready
   - Use templates from this document

3. **Run tests locally first**
   - Verify tests pass with real network
   - Measure actual execution times
   - Document any issues or timeouts

4. **Add to CI/CD when stable**
   - Store test mnemonic in GitHub secrets
   - Run on schedule or manual trigger
   - Monitor for regressions

## Cost Estimation

### Testnet Funds Required
- Identity Creation Test: 200,000 duffs (0.002 DASH)
- Identity Top-Up Test: 50,000 duffs (0.0005 DASH)
- Credit Transfer Test: 10,000 duffs (0.0001 DASH)
- Credit Withdrawal Test: 10,000 duffs (0.0001 DASH)

**Total per full test run**: ~270,000 duffs (0.0027 DASH)
**Recommended wallet balance**: 1,000,000 duffs (0.01 DASH) for multiple test runs

## Current Status

- ✅ Unit tests complete (150 tests, 100% passing)
- ✅ Test infrastructure ready (Mocha, Chai, test fixtures)
- ⏸️ Integration tests planned (templates in this document)
- ⏸️ Funded test wallet setup (user action required)
- ⏸️ Integration test implementation (next phase)

## Recommendations

1. **Priority Order**:
   - Implement read-only tests first (IdentityFetcher, IdentityDiscovery)
   - Add Creator/Updater tests when funded wallet available
   - CreditOperations last (requires two funded identities)

2. **Local Network Testing**:
   - Use local dashmate network for faster iteration
   - Instant block generation (30-second intervals)
   - No testnet fund requirements
   - See LOCAL_DASHMATE_GUIDE.md for setup

3. **Incremental Approach**:
   - Start with one test per facade
   - Expand coverage after verifying basic flow works
   - Add error scenario tests last

## Reference Files

- Unit tests: `tests/unit/facades/` - Validation logic examples
- Functional tests: `tests/functional/identities.spec.mjs` - Existing pattern
- Architecture: `IDENTITY_ARCHITECTURE.md` - Component relationships
- Migration guide: `IDENTITY_FACADE_MIGRATION_GUIDE.md` - Usage examples

---

*Created: November 14, 2025*
*Part of Identity Facade Refactoring - Phase 9 (Integration Testing)*
