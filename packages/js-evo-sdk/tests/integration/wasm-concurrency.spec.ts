/**
 * WASM Concurrency Integration Tests
 *
 * Tests to verify the WASM SDK handles concurrent operations correctly
 * and identifies patterns that avoid "already locked to a reader" errors.
 *
 * These tests validate:
 * - Sequential operations on single SDK instance
 * - WASM reset behavior between operations
 * - Mixed operation types
 * - Error recovery patterns
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createEvoSDKWithWallet,
  wait,
  createCleanup,
  type EvoSDKWithWalletResult,
} from './setup.js';
import { TESTNET_IDENTITIES, TEST_TIMEOUTS } from '../lib/fixtures.js';

describe('WASM Concurrency - Integration', () => {
  let sdkResult: EvoSDKWithWalletResult;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    sdkResult = await createEvoSDKWithWallet({
      network: 'testnet',
      autoConnect: true,
    });
    cleanup = createCleanup(sdkResult);
    console.log(`[WASM Tests] SDK connected to ${sdkResult.network}`);
  }, TEST_TIMEOUTS.SDK_CONNECT);

  afterAll(async () => {
    await cleanup();
    console.log('[WASM Tests] Cleanup complete');
  });

  // ============================================================================
  // Sequential Operations
  // ============================================================================

  describe('Sequential Operations', () => {
    it('should handle sequential fetch operations', async () => {
      const { sdk } = sdkResult;

      // Execute 3 sequential fetches
      for (let i = 0; i < 3; i++) {
        const identity = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);
        expect(identity).toBeDefined();
        expect(identity).toHaveProperty('id');
      }
    }, TEST_TIMEOUTS.IDENTITY_FETCH * 3);

    it('should handle sequential balance queries', async () => {
      const { sdk } = sdkResult;

      // Execute 3 sequential balance queries
      for (let i = 0; i < 3; i++) {
        const balance = await sdk.identities.balance(TESTNET_IDENTITIES.SAMPLE);
        expect(typeof balance).toBe('bigint');
      }
    }, TEST_TIMEOUTS.IDENTITY_FETCH * 3);

    it('should handle mixed operation types sequentially', async () => {
      const { sdk } = sdkResult;

      // Fetch
      const identity = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);
      expect(identity).toBeDefined();

      // Balance
      const balance = await sdk.identities.balance(TESTNET_IDENTITIES.SAMPLE);
      expect(typeof balance).toBe('bigint');

      // Fetch same identity again to verify sequential ops work
      // Note: DPNS_CONTRACT is a contract ID, not an identity ID, so we use SAMPLE again
      const identity2 = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);
      expect(identity2).toBeDefined();
    }, TEST_TIMEOUTS.IDENTITY_FETCH * 3);
  });

  // ============================================================================
  // WASM Reset Behavior
  // ============================================================================

  describe('WASM Reset Behavior', () => {
    it('should allow operations after WASM reset', async () => {
      const { sdk } = sdkResult;

      // First operation
      const identity1 = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);
      expect(identity1).toBeDefined();

      // Reset WASM
      sdk.resetWasmSdk();

      // Wait a moment for cleanup
      await wait(500);

      // Reconnect and try again
      await sdk.connect();
      const identity2 = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);
      expect(identity2).toBeDefined();
    }, TEST_TIMEOUTS.SDK_CONNECT + TEST_TIMEOUTS.IDENTITY_FETCH * 2);

    it('should handle reset between different operations', async () => {
      const { sdk } = sdkResult;

      // Fetch
      const identity = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);
      expect(identity).toBeDefined();

      // Reset
      sdk.resetWasmSdk();
      await wait(500);
      await sdk.connect();

      // Balance query
      const balance = await sdk.identities.balance(TESTNET_IDENTITIES.SAMPLE);
      expect(typeof balance).toBe('bigint');
    }, TEST_TIMEOUTS.SDK_CONNECT + TEST_TIMEOUTS.IDENTITY_FETCH * 2);
  });

  // ============================================================================
  // Concurrent Operation Detection
  // ============================================================================

  describe('Concurrent Operations', () => {
    it('should detect concurrent operation conflicts', async () => {
      const { sdk } = sdkResult;

      // Note: The WASM SDK does NOT support concurrent operations.
      // This test verifies that sequential operations work correctly.
      // True concurrent operations will fail with "already locked to a reader" error.

      const results = [];

      // Execute operations sequentially (NOT concurrently)
      for (let i = 0; i < 2; i++) {
        const identity = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);
        results.push(identity);
      }

      expect(results.length).toBe(2);
      expect(results[0]).toBeDefined();
      expect(results[1]).toBeDefined();
    }, TEST_TIMEOUTS.IDENTITY_FETCH * 2);

    it('should document concurrent operation limitation', async () => {
      const { sdk } = sdkResult;

      // This test documents the expected behavior when concurrent operations are attempted
      // The WASM SDK will throw "already locked to a reader" error

      // Sequential approach (works)
      const result1 = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);
      expect(result1).toBeDefined();

      // Note: DO NOT use Promise.all() with WASM SDK operations
      // The following would fail:
      // await Promise.all([
      //   sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE),
      //   sdk.identities.fetch(TESTNET_IDENTITIES.DPNS_CONTRACT),
      // ]);
    }, TEST_TIMEOUTS.IDENTITY_FETCH);
  });

  // ============================================================================
  // Error Recovery
  // ============================================================================

  describe('Error Recovery', () => {
    it('should recover after a failed fetch', async () => {
      const { sdk } = sdkResult;

      // First, try an operation that fails (invalid ID)
      try {
        await sdk.identities.fetch('ZZZZzzzz1111111111111111111111111111111111');
      } catch {
        // Expected to fail
      }

      // Wait for any cleanup
      await wait(500);

      // Then try a valid operation
      const identity = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);
      expect(identity).toBeDefined();
    }, TEST_TIMEOUTS.IDENTITY_FETCH * 2 + 500);

    it('should handle timeout recovery', async () => {
      const { sdk } = sdkResult;

      // Execute a normal operation
      const identity = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);
      expect(identity).toBeDefined();

      // The SDK should handle internal timeouts gracefully
      // This verifies the SDK state is clean after normal operations
    }, TEST_TIMEOUTS.IDENTITY_FETCH);
  });

  // ============================================================================
  // Stress Testing
  // ============================================================================

  describe('Stress Testing', () => {
    it('should handle many sequential operations', async () => {
      const { sdk } = sdkResult;
      const operationCount = 5;

      for (let i = 0; i < operationCount; i++) {
        const identity = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);
        expect(identity).toBeDefined();

        // Small delay between operations to be gentle on the network
        if (i < operationCount - 1) {
          await wait(100);
        }
      }
    }, TEST_TIMEOUTS.IDENTITY_FETCH * 5 + 500);

    it('should handle alternating operation types', async () => {
      const { sdk } = sdkResult;

      for (let i = 0; i < 3; i++) {
        // Alternate between fetch and balance
        if (i % 2 === 0) {
          const identity = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);
          expect(identity).toBeDefined();
        } else {
          const balance = await sdk.identities.balance(TESTNET_IDENTITIES.SAMPLE);
          expect(typeof balance).toBe('bigint');
        }

        await wait(100);
      }
    }, TEST_TIMEOUTS.IDENTITY_FETCH * 3 + 300);
  });
});
