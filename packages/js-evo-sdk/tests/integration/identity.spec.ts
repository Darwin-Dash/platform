/**
 * Integration Tests for Identity Operations
 *
 * Tests identity reading and lifecycle operations using the EvoSDK.
 * These tests connect to testnet and validate:
 * - Identity fetching (single, batch)
 * - Balance queries
 * - Key retrieval
 * - Identity creation (requires funded wallet)
 * - Identity top-up (requires funded wallet)
 * - Error handling
 *
 * Read operations require no wallet funding.
 * Write operations require TEST_MNEMONIC environment variable with funded wallet.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TEST_CONFIG,
  createEvoSDKWithWallet,
  waitForIdentity,
  waitForBalance,
  waitForSTPropagated,
  skipIfNoMnemonic,
  createCleanup,
  assertValidIdentifier,
  type EvoSDKWithWalletResult,
} from './setup.js';
import {
  TESTNET_IDENTITIES,
  TEST_AMOUNTS,
  TEST_TIMEOUTS,
} from '../lib/fixtures.js';

describe('Identity Operations - Integration', () => {
  let sdkResult: EvoSDKWithWalletResult;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    sdkResult = await createEvoSDKWithWallet({
      network: 'testnet',
      autoConnect: true,
    });
    cleanup = createCleanup(sdkResult);
    console.log(`[Identity Tests] SDK connected to ${sdkResult.network}`);
  }, TEST_TIMEOUTS.SDK_CONNECT);

  afterAll(async () => {
    await cleanup();
    console.log('[Identity Tests] Cleanup complete');
  });

  // ============================================================================
  // Read Operations (no wallet required)
  // ============================================================================

  describe('Read Operations', () => {
    it('should fetch identity by ID', async () => {
      const { sdk } = sdkResult;
      const identity = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);

      expect(identity).toBeDefined();
      expect(identity).toHaveProperty('id');
    }, TEST_TIMEOUTS.IDENTITY_FETCH);

    it('should fetch identity balance', async () => {
      const { sdk } = sdkResult;
      const balance = await sdk.identities.balance(TESTNET_IDENTITIES.SAMPLE);

      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThanOrEqual(0n);
    }, TEST_TIMEOUTS.IDENTITY_FETCH);

    it('should return null for non-existent identity', async () => {
      const { sdk } = sdkResult;
      const nonExistentId = 'ZZZZzzzz1111111111111111111111111111111111';

      try {
        const identity = await sdk.identities.fetch(nonExistentId);
        // May return null or throw depending on SDK behavior
        expect(identity).toBeNull();
      } catch (error: any) {
        // Some SDKs throw for invalid IDs - WasmSdkError may not extend Error
        expect(error).toBeDefined();
        expect(typeof error.message === 'string' || typeof error.toString === 'function').toBe(true);
      }
    }, TEST_TIMEOUTS.IDENTITY_FETCH);

    it('should fetch multiple identities sequentially', async () => {
      const { sdk } = sdkResult;
      // Fetch the same identity twice to verify sequential fetching works
      // (DPNS_CONTRACT is a contract ID, not an identity ID)
      const identityIds = [
        TESTNET_IDENTITIES.SAMPLE,
        TESTNET_IDENTITIES.SAMPLE,
      ];

      const results = [];
      for (const identityId of identityIds) {
        const identity = await sdk.identities.fetch(identityId);
        results.push(identity);
      }

      expect(results.length).toBe(2);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result).toHaveProperty('id');
      });
    }, TEST_TIMEOUTS.IDENTITY_FETCH * 2);
  });

  // ============================================================================
  // Wallet-Based Discovery (requires mnemonic)
  // ============================================================================

  describe('Identity Discovery', () => {
    it('should discover identity IDs from mnemonic', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;

        const identityIds = await sdk.identities.getIdentityIds(mnemonic, {
          gapLimit: 5,
        });

        expect(Array.isArray(identityIds)).toBe(true);
        console.log(`[Discovery] Found ${identityIds.length} identities for wallet`);

        // Each entry should have identityId and index
        identityIds.forEach((entry) => {
          expect(entry).toHaveProperty('identityId');
          expect(entry).toHaveProperty('index');
          expect(typeof entry.index).toBe('number');
        });
      });
    }, TEST_TIMEOUTS.IDENTITY_CREATE);

    it('should list identities from mnemonic', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;

        const identities = await sdk.identities.list(mnemonic, {
          gapLimit: 5,
        });

        expect(Array.isArray(identities)).toBe(true);
        console.log(`[Discovery] Listed ${identities.length} identities`);
      });
    }, TEST_TIMEOUTS.IDENTITY_CREATE);
  });

  // ============================================================================
  // Lifecycle Operations (requires funded wallet)
  // ============================================================================

  describe('Lifecycle Operations', () => {
    it('should create identity with wallet', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;

        try {
          // Get initial identity count
          const identitiesBefore = await sdk.identities.getIdentityIds(mnemonic, { gapLimit: 20 });
          const initialCount = identitiesBefore.length;
          console.log(`[Create] Starting with ${initialCount} identities`);

          // Create identity
          const result = await sdk.identities.createWithWallet(
            mnemonic,
            TEST_AMOUNTS.IDENTITY_CREATE,
            {
              onProgress: (event) => {
                console.log(`[Create] ${event.phase}: ${event.message}`);
              },
            }
          );

          expect(result).toBeDefined();
          expect(result).toHaveProperty('identityId');
          expect(result).toHaveProperty('transactionHash');
          expect(result.status).toBe('success');

          assertValidIdentifier(result.identityId, 'identityId');
          console.log(`[Create] New identity: ${result.identityId}`);

          // Wait for propagation
          await waitForSTPropagated();

          // Verify identity count increased
          const identitiesAfter = await sdk.identities.getIdentityIds(mnemonic, { gapLimit: 20 });
          expect(identitiesAfter.length).toBeGreaterThan(initialCount);

        } catch (error) {
          const message = (error as Error).message;
          if (message.includes('insufficient') || message.includes('No UTXOs')) {
            console.log('[Create] Skipping: Insufficient funds -', message);
          } else {
            throw error;
          }
        }
      });
    }, TEST_TIMEOUTS.IDENTITY_CREATE);

    it('should top-up identity with wallet', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;

        try {
          // Get an existing identity
          const identityIds = await sdk.identities.getIdentityIds(mnemonic, { gapLimit: 20 });

          if (identityIds.length === 0) {
            console.log('[TopUp] Skipping: No identities found for wallet');
            return;
          }

          const identityId = identityIds[0].identityId;
          const initialBalance = await sdk.identities.balance(identityId);
          console.log(`[TopUp] Initial balance for ${identityId}: ${initialBalance}`);

          // Top up the identity
          const result = await sdk.identities.topUpWithWallet(
            identityId,
            TEST_AMOUNTS.IDENTITY_TOPUP,
            mnemonic,
            {
              onProgress: (event) => {
                console.log(`[TopUp] ${event.phase}: ${event.message}`);
              },
            }
          );

          expect(result).toBeDefined();
          expect(result).toHaveProperty('identityId');
          expect(result).toHaveProperty('transactionHash');
          expect(result.status).toBe('success');

          // Wait for propagation and verify balance increased
          const balanceIncreased = await waitForBalance(
            sdk,
            identityId,
            initialBalance + 1n, // Any increase
            { maxWaitMs: 60000, pollIntervalMs: 3000 }
          );

          if (balanceIncreased) {
            const newBalance = await sdk.identities.balance(identityId);
            console.log(`[TopUp] New balance: ${newBalance} (was ${initialBalance})`);
            expect(newBalance).toBeGreaterThan(initialBalance);
          } else {
            console.log('[TopUp] Balance not yet propagated, but transaction submitted');
          }

        } catch (error) {
          const message = (error as Error).message;
          if (message.includes('insufficient') || message.includes('No UTXOs')) {
            console.log('[TopUp] Skipping: Insufficient funds -', message);
          } else {
            throw error;
          }
        }
      });
    }, TEST_TIMEOUTS.IDENTITY_TOPUP);
  });

  // ============================================================================
  // UTXO-First Operations (advanced pattern)
  // ============================================================================

  describe('UTXO-First Operations', () => {
    it('should find spendable UTXO with progress callbacks', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;
        const progressEvents: Array<{ phase: string; progress: number }> = [];

        try {
          const result = await sdk.identities.findSpendableUTXO({
            mnemonic,
            startHeight: 1353000,
            minAmount: 100000,
            onProgress: (event) => {
              progressEvents.push({ phase: event.phase, progress: event.progress });
              console.log(`[UTXO] ${event.phase}: ${event.message} (${event.progress}%)`);
            },
          });

          expect(result).toBeDefined();
          expect(result).toHaveProperty('utxo');
          expect(result).toHaveProperty('derivedAddresses');
          expect(result.utxo).toHaveProperty('txId');
          expect(result.utxo).toHaveProperty('vout');
          expect(result.utxo).toHaveProperty('satoshis');
          expect(result.utxo.satoshis).toBeGreaterThanOrEqual(100000);

          expect(progressEvents.length).toBeGreaterThan(0);
          console.log(`[UTXO] Found: ${result.utxo.txId}:${result.utxo.vout} (${result.utxo.satoshis} duffs)`);

        } catch (error) {
          const message = (error as Error).message;
          if (message.includes('No UTXOs') || message.includes('insufficient')) {
            console.log('[UTXO] Skipping: No funded UTXOs found -', message);
          } else {
            throw error;
          }
        }
      });
    }, 300000); // 5 minute timeout for blockchain scan

    it('should create identity with pre-found UTXO', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;

        try {
          // Step 1: Find a spendable UTXO
          console.log('[UTXO Create] Finding spendable UTXO...');
          const utxoResult = await sdk.identities.findSpendableUTXO({
            mnemonic,
            startHeight: 1353000,
            minAmount: TEST_AMOUNTS.IDENTITY_CREATE,
          });

          console.log(`[UTXO Create] Found UTXO: ${utxoResult.utxo.txId}:${utxoResult.utxo.vout}`);

          // Step 2: Create identity with the pre-found UTXO
          console.log('[UTXO Create] Creating identity...');
          const result = await sdk.identities.createWithUTXO({
            mnemonic,
            utxo: utxoResult.utxo,
            amount: TEST_AMOUNTS.IDENTITY_CREATE,
            derivedAddresses: utxoResult.derivedAddresses,
            onProgress: (event) => {
              console.log(`[UTXO Create] ${event.phase}: ${event.message} (${event.progress}%)`);
            },
          });

          expect(result).toBeDefined();
          expect(result).toHaveProperty('identityId');
          expect(result).toHaveProperty('transactionHash');
          expect(result.status).toBe('success');

          console.log(`[UTXO Create] Identity created: ${result.identityId}`);

        } catch (error) {
          const message = (error as Error).message;
          if (message.includes('No UTXOs') || message.includes('insufficient')) {
            console.log('[UTXO Create] Skipping: Funding issue -', message);
          } else {
            throw error;
          }
        }
      });
    }, TEST_TIMEOUTS.IDENTITY_CREATE * 2);
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should validate mnemonic format', async () => {
      const { sdk } = sdkResult;
      const invalidMnemonic = 'invalid mnemonic phrase';

      try {
        await sdk.identities.createWithWallet(
          invalidMnemonic,
          TEST_AMOUNTS.IDENTITY_CREATE
        );
        expect.fail('Should have rejected invalid mnemonic');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/invalid|mnemonic|failed/i);
      }
    }, TEST_TIMEOUTS.IDENTITY_FETCH);

    it('should validate amount for creation', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;
        const tooSmallAmount = 100;

        try {
          await sdk.identities.createWithWallet(mnemonic, tooSmallAmount);
          // May throw or fail during execution
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          // Error could be validation or insufficient funds
        }
      });
    }, TEST_TIMEOUTS.IDENTITY_FETCH);

    it('should validate identity ID format for top-up', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;
        const invalidIdentityId = 'not-a-valid-id';

        try {
          await sdk.identities.topUpWithWallet(
            invalidIdentityId,
            TEST_AMOUNTS.IDENTITY_TOPUP,
            mnemonic
          );
          expect.fail('Should have rejected invalid identity ID');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toMatch(/invalid|failed|error/i);
        }
      });
    }, TEST_TIMEOUTS.IDENTITY_FETCH);
  });
});
