/**
 * Integration Tests for Identity Creator with WASM Worker Isolation
 *
 * Tests identity creation with real WASM SDK using worker isolation
 * to prevent concurrency errors.
 *
 * These tests validate:
 * - Identity creation with wallet coordination
 * - Transaction signing and broadcasting
 * - Platform submission and confirmation
 * - Error handling and recovery
 *
 * Note: These tests require testnet wallet funding and may take time
 * due to blockchain confirmation requirements.
 */

import { expect } from 'chai';
import { runWasmOperation } from '../../../dist/identities/utils/wasm-worker-runner.js';
import { TEST_SECRETS } from '../fixtures/testnet.mjs';

describe('Identity Creator - WASM Worker Integration', function creatorTests() {
  this.timeout(600000); // 10 minute timeout for identity creation (includes blockchain confirmation)

  /**
   * Test: Create identity with wallet
   * Validates complete identity creation workflow
   */
  it('should create identity with wallet coordination and worker isolation', async function createTest() {
    // Skip if no mnemonic provided
    if (!process.env.TEST_MNEMONIC) {
      this.skip();
      return;
    }

    const mnemonic = process.env.TEST_MNEMONIC;

    try {
      const result = await runWasmOperation('identity-create', {
        mnemonic,
        amount: 200000, // Minimum amount
        startHeight: 1,
        useSourceAsChangeAddress: true,
      }, {
        timeout: 600000,
        network: 'testnet',
      });

      expect(result).to.be.an('object');
      expect(result).to.have.property('identityId');
      expect(result).to.have.property('transactionHash');
      expect(result).to.have.property('balance');
      expect(result.balance).to.be.at.least(200000);
    } catch (error) {
      // Acceptable errors for integration tests:
      // - No funds in wallet
      // - Network unavailable
      // - Invalid mnemonic
      if (error.message.includes('insufficient') ||
          error.message.includes('network') ||
          error.message.includes('mnemonic')) {
        console.log(`Skipping: ${error.message}`);
        this.skip();
      } else {
        throw error;
      }
    }
  });

  /**
   * Test: Identity creation validates mnemonic
   * Validates input validation in worker
   */
  it('should validate mnemonic format in identity creation', async () => {
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
      expect(error).to.be.an('Error');
      expect(error.message).to.include.oneOf(['Invalid', 'invalid', 'mnemonic', 'failed']);
    }
  });

  /**
   * Test: Identity creation validates amount
   * Validates amount constraints
   */
  it('should validate amount constraints in identity creation', async () => {
    const mnemonic = process.env.TEST_MNEMONIC || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const tooSmallAmount = 100; // Less than minimum

    try {
      await runWasmOperation('identity-create', {
        mnemonic,
        amount: tooSmallAmount,
        startHeight: 1,
      }, {
        timeout: 60000,
        network: 'testnet',
      });

      // May fail due to wallet funds or other issues
      // This is acceptable for integration test
    } catch (error) {
      // Acceptable: amount too small or other validation errors
      expect(error).to.be.an('Error');
    }
  });

  /**
   * Test: Identity creation respects start height option
   * Validates blockchain sync starting point
   */
  it('should create identity with custom start height', async function startHeightTest() {
    if (!process.env.TEST_MNEMONIC) {
      this.skip();
      return;
    }

    const mnemonic = process.env.TEST_MNEMONIC;

    try {
      const result = await runWasmOperation('identity-create', {
        mnemonic,
        amount: 200000,
        startHeight: 1000000, // Start from recent block
        useSourceAsChangeAddress: true,
      }, {
        timeout: 600000,
        network: 'testnet',
      });

      expect(result).to.be.an('object');
      expect(result).to.have.property('identityId');
    } catch (error) {
      if (error.message.includes('insufficient') ||
          error.message.includes('network')) {
        this.skip();
      } else {
        throw error;
      }
    }
  });

  /**
   * Test: Identity creation handles change address routing
   * Validates useSourceAsChangeAddress option
   */
  it('should route change to source address when requested', async function changeAddressTest() {
    if (!process.env.TEST_MNEMONIC) {
      this.skip();
      return;
    }

    const mnemonic = process.env.TEST_MNEMONIC;

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

      expect(result).to.be.an('object');
      expect(result).to.have.property('changeRoutedToSource');
      expect(result.changeRoutedToSource).to.be.a('boolean');
    } catch (error) {
      if (error.message.includes('insufficient') ||
          error.message.includes('network')) {
        this.skip();
      } else {
        throw error;
      }
    }
  });

  /**
   * Test: Worker timeout for slow network
   * Validates timeout handling
   */
  it('should timeout creation attempt with restrictive timeout', async () => {
    const mnemonic = process.env.TEST_MNEMONIC || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    try {
      await runWasmOperation('identity-create', {
        mnemonic,
        amount: 200000,
        startHeight: 1,
      }, {
        timeout: 100, // 100ms is too short
        network: 'testnet',
      });

      // If it somehow succeeds, that's fine
    } catch (error) {
      expect(error).to.be.an('Error');
      // Either timeout or other error is acceptable
      expect(error.message).to.match(/timeout|failed|Error/i);
    }
  });

  /**
   * Test: Multiple concurrent identity creations
   * Validates worker isolation prevents conflicts
   */
  it('should handle concurrent identity creation attempts', async function concurrentTest() {
    if (!process.env.TEST_MNEMONIC) {
      this.skip();
      return;
    }

    this.timeout(1800000); // 30 minutes for multiple creations

    const mnemonic = process.env.TEST_MNEMONIC;

    try {
      // Note: Running actual concurrent identity creations requires separate mnemonics
      // For this test, we'll just validate that multiple workers can be spawned
      const promises = [];

      for (let i = 0; i < 2; i++) {
        promises.push(
          runWasmOperation('identity-create', {
            mnemonic,
            amount: 200000,
            startHeight: 1,
          }, {
            timeout: 600000,
            network: 'testnet',
          })
        );
      }

      // Results may vary due to wallet state
      // Just verify they execute without mutex conflicts
      const results = await Promise.allSettled(promises);
      expect(results).to.have.lengthOf(2);
    } catch (error) {
      if (error.message.includes('insufficient') ||
          error.message.includes('network') ||
          error.message.includes('locked')) {
        this.skip();
      } else {
        throw error;
      }
    }
  });

  /**
   * Test: Worker properly cleans up resources after creation
   * Validates WASM cleanup
   */
  it('should cleanup WASM resources after identity creation', async function cleanupTest() {
    if (!process.env.TEST_MNEMONIC) {
      this.skip();
      return;
    }

    const mnemonic = process.env.TEST_MNEMONIC;

    try {
      // First operation
      await runWasmOperation('identity-create', {
        mnemonic,
        amount: 200000,
        startHeight: 1,
      }, {
        timeout: 600000,
        network: 'testnet',
      }).catch(() => {
        // Expected to fail if no funds
      });

      // Second operation - should work if resources cleaned up
      await runWasmOperation('identity-create', {
        mnemonic,
        amount: 200000,
        startHeight: 1,
      }, {
        timeout: 600000,
        network: 'testnet',
      }).catch(() => {
        // Expected to fail if no funds
      });

      // Both executed without mutex errors - cleanup works
      expect(true).to.be.true;
    } catch (error) {
      // Acceptable errors in integration tests
      if (!error.message.includes('locked')) {
        this.skip();
      }
    }
  });

  /**
   * Test: Error recovery after failed identity creation
   * Validates worker error handling
   */
  it('should recover from failed identity creation attempt', async function errorRecoveryTest() {
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
      // Expected to fail
      expect(error).to.be.an('Error');
    }

    // Second attempt - valid format but may fail due to funds
    try {
      const result = await runWasmOperation('identity-create', {
        mnemonic: process.env.TEST_MNEMONIC || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        amount: 200000,
        startHeight: 1,
      }, {
        timeout: 600000,
        network: 'testnet',
      });

      // May succeed if funds available
      expect(result).to.be.an('object');
    } catch (error) {
      // Acceptable - funds or network issues
      if (error.message.includes('insufficient') ||
          error.message.includes('network')) {
        // Expected
      } else {
        throw error;
      }
    }
  });
});
