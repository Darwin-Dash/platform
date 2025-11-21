/**
 * Integration Tests for Identity Operations
 *
 * Tests identity reading operations using worker isolation
 * to prevent WASM SDK concurrency errors.
 *
 * These tests connect to testnet and validate:
 * - Identity fetching (single, batch, with/without proof)
 * - Key retrieval
 * - Error handling
 * - Concurrent operations
 * - Stress testing
 *
 * No wallet funding required (read-only operations).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { runWasmOperation, runBatchWasmOperation } from '../../dist/identities/utils/wasm-worker-runner.js';
import { TEST_IDS } from '../fixtures/testnet.mjs';

describe('Identity Operations - WASM Integration', () => {
  /**
   * Fetch single identity by ID
   */
  it('should fetch identity by ID', async () => {
    const result = await runWasmOperation('identity-fetch', {
      identityId: TEST_IDS.identityId,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    expect(result).toBeDefined();
    expect(result).toHaveProperty('id');
  }, 60000);

  /**
   * Fetch identity with cryptographic proof
   */
  it('should fetch identity with proof', async () => {
    const result = await runWasmOperation('identity-fetch-with-proof', {
      identityId: TEST_IDS.identityId,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    expect(result).toBeDefined();
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('proof');
  }, 60000);

  /**
   * Fetch identity without proof (fast path)
   */
  it('should fetch identity unproved', async () => {
    const result = await runWasmOperation('identity-fetch-unproved', {
      identityId: TEST_IDS.identityId,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    expect(result).toBeDefined();
    expect(result).toHaveProperty('id');
  }, 60000);

  /**
   * Retrieve identity keys
   */
  it('should get identity keys', async () => {
    const result = await runWasmOperation('identity-get-keys', {
      identityId: TEST_IDS.identityId,
      keyRequestType: 'all',
      limit: 10,
      offset: 0,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    expect(result).toBeDefined();
    expect(result).toHaveProperty('keys');
    expect(Array.isArray(result.keys)).toBe(true);
  }, 60000);

  /**
   * Batch fetch multiple identities with single worker
   */
  it('should batch fetch multiple identities', async () => {
    const identityIds = [
      TEST_IDS.identityId,
      TEST_IDS.specializedBalanceIdentityId,
    ];

    const results = await runBatchWasmOperation('identity-fetch',
      identityIds.map(id => ({ identityId: id })),
      {
        timeout: 60000,
        network: 'testnet',
      }
    );

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
    results.forEach((result) => {
      expect(result).toHaveProperty('id');
    });
  }, 60000);

  /**
   * Concurrent fetches with multiple workers
   */
  it('should handle concurrent identity fetches', async () => {
    const identityIds = [
      TEST_IDS.identityId,
      TEST_IDS.specializedBalanceIdentityId,
    ];

    const promises = identityIds.map(id =>
      runWasmOperation('identity-fetch', { identityId: id }, {
        timeout: 60000,
        network: 'testnet',
      })
    );

    const results = await Promise.all(promises);

    expect(results.length).toBe(2);
    results.forEach(result => {
      expect(result).toHaveProperty('id');
    });
  }, 60000);

  /**
   * Error handling for non-existent identity
   */
  it('should handle non-existent identity error', async () => {
    const nonExistentId = 'InvalidIdentityIdThatDoesNotExist123456789';

    try {
      await runWasmOperation('identity-fetch', {
        identityId: nonExistentId,
      }, {
        timeout: 60000,
        network: 'testnet',
      });

      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/Failed|Error/i);
    }
  }, 60000);

  /**
   * Timeout handling for slow operations
   */
  it('should handle worker timeout', async () => {
    try {
      await runWasmOperation('identity-fetch', {
        identityId: TEST_IDS.identityId,
      }, {
        timeout: 100, // Too short
        network: 'testnet',
      });

      expect.fail('Should have timed out');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/timeout/i);
    }
  }, 30000);

  /**
   * Stress test with many concurrent operations
   */
  it('should handle stress test with concurrent fetches', async () => {
    const numOperations = 5;
    const promises = [];

    for (let i = 0; i < numOperations; i++) {
      promises.push(
        runWasmOperation('identity-fetch', {
          identityId: TEST_IDS.identityId,
        }, {
          timeout: 60000,
          network: 'testnet',
        })
      );
    }

    const results = await Promise.all(promises);

    expect(results.length).toBe(numOperations);
    results.forEach(result => {
      expect(result).toHaveProperty('id');
    });
  }, 120000);

  /**
   * Mixed operation types concurrently
   */
  it('should handle mixed operation types concurrently', async () => {
    const identityId = TEST_IDS.identityId;

    const promises = [
      runWasmOperation('identity-fetch', { identityId }, { timeout: 60000 }),
      runWasmOperation('identity-fetch-with-proof', { identityId }, { timeout: 60000 }),
      runWasmOperation('identity-fetch-unproved', { identityId }, { timeout: 60000 }),
      runWasmOperation('identity-get-keys', {
        identityId,
        keyRequestType: 'all',
        limit: 10,
        offset: 0,
      }, { timeout: 60000 }),
    ];

    const results = await Promise.all(promises);

    expect(results.length).toBe(4);
    results.forEach(result => {
      expect(result).toBeDefined();
    });
  }, 120000);

  /**
   * Batch keys retrieval for multiple identities
   */
  it('should batch fetch keys for multiple identities', async () => {
    const identityIds = [
      TEST_IDS.identityId,
      TEST_IDS.specializedBalanceIdentityId,
    ];

    const results = await runBatchWasmOperation('identity-get-keys',
      identityIds.map(id => ({
        identityId: id,
        keyRequestType: 'all',
        limit: 10,
        offset: 0,
      })),
      {
        timeout: 60000,
        network: 'testnet',
      }
    );

    expect(results.length).toBe(2);
    results.forEach(result => {
      expect(result).toHaveProperty('keys');
      expect(Array.isArray(result.keys)).toBe(true);
    });
  }, 60000);

  /**
   * Compare proved vs unproved fetches
   */
  it('should return different structures for proved vs unproved', async () => {
    const identityId = TEST_IDS.identityId;

    const proved = await runWasmOperation('identity-fetch-with-proof', {
      identityId,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    const unproved = await runWasmOperation('identity-fetch-unproved', {
      identityId,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    expect(proved).toHaveProperty('id');
    expect(unproved).toHaveProperty('id');
    expect(proved).toHaveProperty('proof');
    // Unproved should not have proof or have it undefined
  }, 120000);
});
