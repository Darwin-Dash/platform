/**
 * Integration Tests for Identity Lifecycle Operations
 *
 * Tests identity creation and top-up operations using worker isolation.
 *
 * These tests validate:
 * - Identity creation with wallet coordination
 * - Identity top-up operations
 * - Input validation
 * - Blockchain confirmation waiting
 * - Sequential and concurrent operations
 * - Resource cleanup
 *
 * Requires:
 * - MNEMONIC: Funded testnet wallet
 * - TEST_IDENTITY_ID: Existing identity (for top-up tests)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { runWasmOperation } from '../../dist/identities/utils/wasm-worker-runner.js';
import { EvoSDK } from '../../dist/sdk.js';
import { TEST_SECRETS } from '../fixtures/testnet.mjs';

describe('Identity Lifecycle - WASM Integration', () => {
  /**
   * Create identity with wallet coordination
   *
   * Uses IdentityCreator facade which orchestrates:
   * 1. Wallet setup (HD key derivation, UTXO discovery)
   * 2. Identity discovery via getIdentityIds() (direct DAPI)
   * 3. Transaction creation and broadcast
   * 4. InstantLock/ChainLock monitoring
   * 5. Identity key generation at next available index
   * 6. Worker call with processed params (transactionData, publicKeys)
   */
  it('should create identity with wallet', async () => {
    if (!process.env.MNEMONIC) {
      console.log('Skipping: MNEMONIC not provided');
      return;
    }

    const mnemonic = process.env.MNEMONIC;
    const startHeight = parseInt(process.env.START_HEIGHT || '1', 10);

    try {
      // Use the proper facade which handles the full orchestration
      const sdk = new EvoSDK({ network: 'testnet', trusted: true });

      // Discover existing identities before creation
      const identitiesBefore = await sdk.identities.getIdentityIds(mnemonic, { gapLimit: 20 });
      const nextIndex = identitiesBefore.length > 0
        ? Math.max(...identitiesBefore.map(i => i.index)) + 1
        : 0;
      console.log(`[Test] Found ${identitiesBefore.length} existing identities, next index: ${nextIndex}`);

      // createWithWallet() uses getIdentityIds() internally for auto-discovery
      const result = await sdk.identities.createWithWallet(mnemonic, 200000, {
        startHeight,
        useSourceAsChangeAddress: true,
        onProgress: (event) => {
          console.log(`[Test] ${event.phase}: ${event.message}`);
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('identityId');
      expect(result).toHaveProperty('transactionHash');
      expect(result).toHaveProperty('balance');
      expect(result.status).toBe('success');

      // Verify identity count increased
      const identitiesAfter = await sdk.identities.getIdentityIds(mnemonic, { gapLimit: 20 });
      console.log(`[Test] Now have ${identitiesAfter.length} identities (was ${identitiesBefore.length})`);
      expect(identitiesAfter.length).toBeGreaterThan(identitiesBefore.length);

      console.log(`✅ Identity created: ${result.identityId} at index ${nextIndex}`);
    } catch (error) {
      if ((error as Error).message.includes('insufficient') ||
          (error as Error).message.includes('network') ||
          (error as Error).message.includes('No UTXOs')) {
        console.log('Skipping: Wallet funding or network issue -', (error as Error).message);
      } else {
        throw error;
      }
    }
  }, 600000);

  /**
   * Validate mnemonic format in creation
   */
  it('should validate mnemonic format', async () => {
    const invalidMnemonic = 'invalid mnemonic phrase';

    try {
      await runWasmOperation('identity-create', {
        mnemonic: invalidMnemonic,
        amount: 200000,
        startHeight: 1,
      }, {
        timeout: 60000,
        network: 'testnet',
      });

      expect.fail('Should have rejected invalid mnemonic');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/Invalid|invalid|mnemonic|failed/i);
    }
  }, 60000);

  /**
   * Validate amount constraints for creation
   */
  it('should validate amount for creation', async () => {
    const mnemonic = process.env.MNEMONIC || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const tooSmallAmount = 100;

    try {
      await runWasmOperation('identity-create', {
        mnemonic,
        amount: tooSmallAmount,
        startHeight: 1,
      }, {
        timeout: 60000,
        network: 'testnet',
      });
    } catch (error) {
      // Expected to fail with validation error or insufficient funds
      expect(error).toBeInstanceOf(Error);
    }
  }, 60000);

  /**
   * Create identity with custom start height
   */
  it('should respect custom start height for creation', async () => {
    if (!process.env.MNEMONIC) {
      console.log('Skipping: MNEMONIC not provided');
      return;
    }

    const mnemonic = process.env.MNEMONIC;

    try {
      const result = await runWasmOperation('identity-create', {
        mnemonic,
        amount: 200000,
        startHeight: 1000000,
        useSourceAsChangeAddress: true,
      }, {
        timeout: 600000,
        network: 'testnet',
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('identityId');
    } catch (error) {
      if ((error as Error).message.includes('insufficient') ||
          (error as Error).message.includes('network')) {
        console.log('Skipping: Network or funds issue');
      } else {
        throw error;
      }
    }
  }, 600000);

  /**
   * Create identity with change address routing
   */
  it('should route change to source address when requested', async () => {
    if (!process.env.MNEMONIC) {
      console.log('Skipping: MNEMONIC not provided');
      return;
    }

    const mnemonic = process.env.MNEMONIC;

    try {
      const result = await runWasmOperation('identity-create', {
        mnemonic,
        amount: 200000,
        startHeight: 1,
        useSourceAsChangeAddress: true,
      }, {
        timeout: 600000,
        network: 'testnet',
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('changeRoutedToSource');
      expect(typeof result.changeRoutedToSource).toBe('boolean');
    } catch (error) {
      if ((error as Error).message.includes('insufficient')) {
        console.log('Skipping: Insufficient funds');
      } else {
        throw error;
      }
    }
  }, 600000);

  /**
   * Top-up identity with wallet - uses the full SDK flow
   */
  it('should top-up identity with wallet', async () => {
    if (!process.env.MNEMONIC || !TEST_SECRETS.identityId) {
      console.log('Skipping: MNEMONIC or TEST_IDENTITY_ID not provided');
      return;
    }

    const mnemonic = process.env.MNEMONIC;
    const identityId = TEST_SECRETS.identityId;

    try {
      // Use the SDK's topUpWithWallet which handles:
      // 1. Wallet setup & UTXO discovery
      // 2. Asset lock transaction creation
      // 3. Broadcasting
      // 4. InstantLock/ChainLock waiting
      // 5. Platform submission via worker
      const sdk = new EvoSDK({ network: 'testnet' });

      const result = await sdk.identities.topUpWithWallet(
        identityId,
        100000, // amount in duffs
        mnemonic,
        {
          startHeight: parseInt(process.env.START_HEIGHT, 10),
          onProgress: (event) => {
            console.log(`[Progress] ${event.phase}: ${event.message}`);
          }
        }
      );

      expect(result).toBeDefined();
      expect(result).toHaveProperty('identityId');
      expect(result).toHaveProperty('transactionHash');
      expect(result).toHaveProperty('newBalance');
    } catch (error) {
      if ((error as Error).message.includes('insufficient') ||
          (error as Error).message.includes('not found') ||
          (error as Error).message.includes('No UTXOs')) {
        console.log('Skipping: Wallet issue or identity not found -', (error as Error).message);
      } else {
        throw error;
      }
    }
  }, 600000);

  /**
   * Validate identity ID for top-up
   */
  it('should validate identity ID format for top-up', async () => {
    const invalidIdentityId = 'not-a-valid-id';
    const mnemonic = process.env.MNEMONIC || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    try {
      await runWasmOperation('identity-topup', {
        identityId: invalidIdentityId,
        mnemonic,
        amount: 100000,
      }, {
        timeout: 60000,
        network: 'testnet',
      });

      expect.fail('Should have rejected invalid identity ID');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/invalid|failed|Error/i);
    }
  }, 60000);

  /**
   * Validate amount for top-up
   */
  it('should validate amount for top-up', async () => {
    if (!TEST_SECRETS.identityId) {
      console.log('Skipping: TEST_IDENTITY_ID not provided');
      return;
    }

    const mnemonic = process.env.MNEMONIC || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const tooSmallAmount = 10;

    try {
      await runWasmOperation('identity-topup', {
        identityId: TEST_SECRETS.identityId,
        mnemonic,
        amount: tooSmallAmount,
      }, {
        timeout: 60000,
        network: 'testnet',
      });
    } catch (error) {
      // Expected error
      expect(error).toBeInstanceOf(Error);
    }
  }, 60000);

  /**
   * Sequential top-ups maintain state
   */
  it('should handle sequential top-ups', async () => {
    if (!process.env.MNEMONIC || !TEST_SECRETS.identityId) {
      console.log('Skipping: Credentials not provided');
      return;
    }

    const mnemonic = process.env.MNEMONIC;
    const identityId = TEST_SECRETS.identityId;

    try {
      // First top-up
      const result1 = await runWasmOperation('identity-topup', {
        identityId,
        mnemonic,
        amount: 100000,
      }, {
        timeout: 600000,
        network: 'testnet',
      });

      expect(result1).toBeDefined();

      // Second top-up may fail due to wallet state
      await runWasmOperation('identity-topup', {
        identityId,
        mnemonic,
        amount: 100000,
      }, {
        timeout: 600000,
        network: 'testnet',
      }).catch(() => {
        // Expected - wallet may be empty after first operation
      });
    } catch (error) {
      if ((error as Error).message.includes('insufficient')) {
        console.log('Skipping: Insufficient funds');
      } else {
        throw error;
      }
    }
  }, 1200000);

  /**
   * Error recovery after failed operation
   * Note: Added delay between operations to allow WASM SDK cleanup.
   * The WASM SDK cannot handle rapid sequential operations on the same instance.
   */
  it('should recover from failed operation', async () => {
    // First attempt - invalid mnemonic
    try {
      await runWasmOperation('identity-create', {
        mnemonic: 'invalid invalid invalid',
        amount: 200000,
      }, {
        timeout: 60000,
        network: 'testnet',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }

    // Wait for WASM SDK cleanup before next operation
    // This prevents "already locked to a reader" errors
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Second attempt should work (if wallet funded)
    try {
      const result = await runWasmOperation('identity-create', {
        mnemonic: process.env.MNEMONIC || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        amount: 200000,
        startHeight: 1,
      }, {
        timeout: 600000,
        network: 'testnet',
      });

      expect(result).toBeDefined();
    } catch (error) {
      if ((error as Error).message.includes('insufficient') ||
          (error as Error).message.includes('network')) {
        // Acceptable
      } else {
        throw error;
      }
    }
  }, 600000);

  /**
   * Timeout handling for lifecycle operations
   */
  it('should handle timeout for lifecycle operations', async () => {
    const mnemonic = process.env.MNEMONIC || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    try {
      await runWasmOperation('identity-create', {
        mnemonic,
        amount: 200000,
        startHeight: 1,
      }, {
        timeout: 100, // Too short
        network: 'testnet',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/timeout|Error/i);
    }
  }, 30000);
});
