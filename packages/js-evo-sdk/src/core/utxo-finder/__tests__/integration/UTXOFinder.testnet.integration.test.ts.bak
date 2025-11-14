/**
 * UTXOFinder Integration Tests - Testnet
 * Tests findLatestSpendableUTXO() with public Dash Platform testnet
 *
 * Configuration:
 * - Uses testnet address from TESTNET_ADDRESS env variable (or default)
 * - Connects to public testnet infrastructure (no local node required)
 * - Tests read-only UTXO discovery operations
 *
 * Run with: npm test -- __tests__/integration/UTXOFinder.testnet.integration.test.ts
 * Skip with: SKIP_TESTNET_TESTS=true npm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { UTXOFinder } from '../../src/UTXOFinder';
import {
  connectToTestnet,
  getTestnetBlockHeight,
  TestnetSetup,
  TestnetEnv,
} from '../helpers/testnet';
import { withRetry, AGGRESSIVE_RETRY_CONFIG } from '../helpers/retry';
import { CircuitBreaker, createDAPICircuitBreaker } from '../helpers/circuit-breaker';

// Skip all testnet integration tests if disabled
const skipTests = !TestnetEnv.integrationsEnabled();

// Timeout configuration
const TIMEOUTS = {
  DAPI_QUERY: 180000,       // 3 minutes for DAPI queries on public testnet
  CONNECTION: 60000,        // 1 minute for connection setup
};

describe.skipIf(skipTests)('UTXOFinder Integration Tests - Testnet', () => {
  let setup: TestnetSetup;
  let finder: UTXOFinder;
  let fundedAddress: string;
  let circuitBreaker: CircuitBreaker;

  beforeAll(async () => {
    circuitBreaker = createDAPICircuitBreaker('testnet-integration');

    // Initialize testnet connection with retry
    setup = await withRetry(
      async () => await circuitBreaker.execute(async () => await new TestnetSetup().init()),
      AGGRESSIVE_RETRY_CONFIG
    );

    finder = new UTXOFinder(setup.getClient(), 'testnet');
    fundedAddress = TestnetEnv.getTestnetAddress();

    console.log('\n📍 Testnet Integration Test Setup:');
    console.log(`   Funded Address: ${fundedAddress}`);
    console.log(`   Network: testnet`);
  }, TIMEOUTS.CONNECTION);

  afterAll(async () => {
    if (setup?.getClient()) {
      // Cleanup if needed
    }
  });

  describe('Network connectivity', () => {
    it('should connect to testnet and get block height', async () => {
      const blockHeight = await withRetry(
        async () => await circuitBreaker.execute(async () => await getTestnetBlockHeight(setup.getClient())),
        AGGRESSIVE_RETRY_CONFIG
      );

      expect(blockHeight).toBeGreaterThan(0);
      console.log(`   ✅ Connected - Block height: ${blockHeight}`);
    }, { timeout: TIMEOUTS.DAPI_QUERY });
  });

  describe('UTXOFinder.findLatestSpendableUTXO()', () => {
    it('should find UTXO for funded testnet address', async () => {
      const blockHeight = await getTestnetBlockHeight(setup.getClient());
      const startHeight = TestnetEnv.getStartHeight(); // Use START_HEIGHT from .env

      console.log(`\n🔍 Searching for UTXOs:`);
      console.log(`   Address: ${fundedAddress}`);
      console.log(`   Start Height: ${startHeight} (from .env)`);
      console.log(`   Current Height: ${blockHeight}`);

      const result = await withRetry(
        async () => await finder.findLatestSpendableUTXO([fundedAddress], {
          fromHeight: startHeight,
        }),
        AGGRESSIVE_RETRY_CONFIG
      );

      // Verify UTXO structure
      expect(result).toBeDefined();
      expect(result.txId).toBeDefined();
      expect(result.vout).toBeGreaterThanOrEqual(0);
      expect(result.satoshis).toBeGreaterThan(0);
      expect(result.address).toBe(fundedAddress);
      expect(result.blockHeight).toBeGreaterThan(0);

      console.log(`\n   ✅ Found UTXO:`);
      console.log(`      TX: ${result.txId}`);
      console.log(`      Output: ${result.vout}`);
      console.log(`      Amount: ${result.satoshis} sats`);
      console.log(`      Block: ${result.blockHeight}`);
      console.log(`      ChainLocked: ${result.isChainLocked}`);
      console.log(`      InstantLocked: ${result.isInstantLocked}`);
    }, { timeout: TIMEOUTS.DAPI_QUERY });

    it('should find UTXO with block height range', async () => {
      const startHeight = TestnetEnv.getStartHeight(); // Use START_HEIGHT from .env
      const blockHeight = await getTestnetBlockHeight(setup.getClient());
      const endHeight = blockHeight;

      console.log(`\n🔍 Searching with block range:`);
      console.log(`   From: ${startHeight} (from .env)`);
      console.log(`   To: ${endHeight}`);

      const result = await withRetry(
        async () => await finder.findLatestSpendableUTXO([fundedAddress], {
          fromHeight: startHeight,
          toHeight: endHeight,
        }),
        AGGRESSIVE_RETRY_CONFIG
      );

      expect(result).toBeDefined();
      expect(result.blockHeight).toBeGreaterThanOrEqual(startHeight);
      expect(result.blockHeight).toBeLessThanOrEqual(endHeight);

      console.log(`   ✅ Found UTXO in range at block ${result.blockHeight}`);
    }, { timeout: TIMEOUTS.DAPI_QUERY });

    it('should find UTXO meeting required amount', async () => {
      const startHeight = TestnetEnv.getStartHeight(); // Use START_HEIGHT from .env
      const requiredAmount = 10000; // 0.0001 DASH

      console.log(`\n🔍 Searching for UTXO with minimum amount:`);
      console.log(`   Start Height: ${startHeight} (from .env)`);
      console.log(`   Required: ${requiredAmount} sats`);

      const result = await withRetry(
        async () => await finder.findLatestSpendableUTXO([fundedAddress], {
          fromHeight: startHeight,
          requiredAmount,
        }),
        AGGRESSIVE_RETRY_CONFIG
      );

      expect(result).toBeDefined();
      expect(result.satoshis).toBeGreaterThanOrEqual(requiredAmount);

      console.log(`   ✅ Found UTXO with ${result.satoshis} sats (>= ${requiredAmount})`);
    }, { timeout: TIMEOUTS.DAPI_QUERY });
  });

  describe('Error handling', () => {
    it('should throw error for empty address array', async () => {
      await expect(
        finder.findLatestSpendableUTXO([], { fromHeight: 1000 })
      ).rejects.toThrow('At least one address is required');
    });

    it('should throw error when no spendable UTXOs found', async () => {
      // Use a likely unfunded address
      const unfundedAddress = 'yUnfundedAddressWithNoUTXOs12345678';
      const startHeight = TestnetEnv.getStartHeight(); // Use START_HEIGHT from .env

      await expect(
        finder.findLatestSpendableUTXO([unfundedAddress], {
          fromHeight: startHeight,
        })
      ).rejects.toThrow();
    }, { timeout: TIMEOUTS.DAPI_QUERY });
  });
});
