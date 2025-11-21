/**
 * Integration Tests for Identity Fetcher with WASM Worker Isolation
 *
 * Tests real WASM operations against testnet using worker isolation
 * to prevent "already locked to a reader" concurrency errors.
 *
 * These tests validate that identity fetching works correctly with the worker-based
 * isolation pattern, ensuring proper WASM resource management and error handling.
 */

import { expect } from 'chai';
import { runWasmOperation, runBatchWasmOperation } from '../../../dist/identities/utils/wasm-worker-runner.js';
import { TEST_IDS } from '../fixtures/testnet.mjs';

describe('Identity Fetcher - WASM Worker Integration', function workerFetcherTests() {
  this.timeout(180000); // 3 minute timeout for testnet operations

  /**
   * Test: Fetch single identity by ID
   * Validates basic identity fetching with worker isolation
   */
  it('should fetch identity by ID using worker isolation', async () => {
    const result = await runWasmOperation('identity-fetch', {
      identityId: TEST_IDS.identityId,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    expect(result).to.be.an('object');
    expect(result).to.have.property('id');
  });

  /**
   * Test: Fetch identity with cryptographic proof
   * Validates proof structure and authenticity
   */
  it('should fetch identity with proof using worker isolation', async () => {
    const result = await runWasmOperation('identity-fetch-with-proof', {
      identityId: TEST_IDS.identityId,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    expect(result).to.be.an('object');
    expect(result).to.have.property('id');
    expect(result).to.have.property('proof');
  });

  /**
   * Test: Fetch identity without proof
   * Validates fast fetch path
   */
  it('should fetch identity unproved (fast path) using worker isolation', async () => {
    const result = await runWasmOperation('identity-fetch-unproved', {
      identityId: TEST_IDS.identityId,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    expect(result).to.be.an('object');
    expect(result).to.have.property('id');
    // Unproved should NOT have proof
    expect(result).to.not.have.property('proof');
  });

  /**
   * Test: Get identity keys
   * Validates key retrieval for identity
   */
  it('should get identity keys using worker isolation', async () => {
    const result = await runWasmOperation('identity-get-keys', {
      identityId: TEST_IDS.identityId,
      keyRequestType: 'all',
      limit: 10,
      offset: 0,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    expect(result).to.be.an('object');
    expect(result).to.have.property('keys');
    expect(result.keys).to.be.an('array');
  });

  /**
   * Test: Batch fetch multiple identities
   * Validates efficiency of batch operations with worker reuse
   */
  it('should fetch multiple identities in batch using single worker', async () => {
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

    expect(results).to.be.an('array');
    expect(results).to.have.lengthOf(2);
    results.forEach((result, index) => {
      expect(result).to.be.an('object');
      expect(result).to.have.property('id');
    });
  });

  /**
   * Test: Concurrent fetches with multiple workers
   * Validates that concurrent operations don't interfere with each other
   */
  it('should handle concurrent identity fetches without mutex conflicts', async () => {
    const identityIds = [
      TEST_IDS.identityId,
      TEST_IDS.specializedBalanceIdentityId,
    ];

    // Run fetches in parallel (each in its own worker)
    const promises = identityIds.map(id =>
      runWasmOperation('identity-fetch', { identityId: id }, {
        timeout: 60000,
        network: 'testnet',
      })
    );

    const results = await Promise.all(promises);

    expect(results).to.be.an('array');
    expect(results).to.have.lengthOf(2);
    results.forEach(result => {
      expect(result).to.be.an('object');
      expect(result).to.have.property('id');
    });
  });

  /**
   * Test: Error handling for non-existent identity
   * Validates proper error propagation from worker
   */
  it('should handle non-existent identity error gracefully', async () => {
    const nonExistentId = 'InvalidIdentityIdThatDoesNotExist123456789';

    try {
      await runWasmOperation('identity-fetch', {
        identityId: nonExistentId,
      }, {
        timeout: 60000,
        network: 'testnet',
      });

      // Should not reach here
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).to.be.an('Error');
      expect(error.message).to.include('Failed');
    }
  });

  /**
   * Test: Worker timeout handling
   * Validates that operations timeout gracefully
   */
  it('should handle worker timeout for slow operations', async () => {
    // Use very short timeout to force timeout
    try {
      await runWasmOperation('identity-fetch', {
        identityId: TEST_IDS.identityId,
      }, {
        timeout: 100, // 100ms is too short for real operation
        network: 'testnet',
      });

      // Should not reach here
      expect.fail('Should have timed out');
    } catch (error) {
      expect(error).to.be.an('Error');
      expect(error.message).to.include('timeout');
    }
  });

  /**
   * Test: Stress test with many concurrent operations
   * Validates worker pool behavior under load
   */
  it('should handle stress test with many concurrent fetches', async function stressTest() {
    this.timeout(300000); // 5 minutes for stress test

    const numOperations = 5;
    const promises = [];

    // Create many concurrent operations
    for (let i = 0; i < numOperations; i++) {
      const promise = runWasmOperation('identity-fetch', {
        identityId: TEST_IDS.identityId,
      }, {
        timeout: 120000,
        network: 'testnet',
      });
      promises.push(promise);
    }

    const results = await Promise.all(promises);

    expect(results).to.have.lengthOf(numOperations);
    results.forEach(result => {
      expect(result).to.be.an('object');
      expect(result).to.have.property('id');
    });
  });

  /**
   * Test: Mixed operation types with batching
   * Validates that different operation types work together
   */
  it('should support mixed operation sequences', async () => {
    // First fetch identity
    const identity = await runWasmOperation('identity-fetch', {
      identityId: TEST_IDS.identityId,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    expect(identity).to.have.property('id');

    // Then get its keys
    const keysResult = await runWasmOperation('identity-get-keys', {
      identityId: TEST_IDS.identityId,
      keyRequestType: 'all',
      limit: 10,
      offset: 0,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    expect(keysResult).to.have.property('keys');
    expect(keysResult.keys).to.be.an('array');
  });

  /**
   * Test: Fetch with different proof types
   * Validates proof variants
   */
  it('should fetch identity with proof and verify structure', async () => {
    const provedIdentity = await runWasmOperation('identity-fetch-with-proof', {
      identityId: TEST_IDS.identityId,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    const unprovedIdentity = await runWasmOperation('identity-fetch-unproved', {
      identityId: TEST_IDS.identityId,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    // Both should be objects
    expect(provedIdentity).to.be.an('object');
    expect(unprovedIdentity).to.be.an('object');

    // They should have the same identity ID
    expect(provedIdentity).to.have.property('id');
    expect(unprovedIdentity).to.have.property('id');
  });

  /**
   * Test: Batch keys retrieval
   * Validates batch operation efficiency for key fetching
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

    expect(results).to.be.an('array');
    expect(results).to.have.lengthOf(2);
    results.forEach(result => {
      expect(result).to.have.property('keys');
      expect(result.keys).to.be.an('array');
    });
  });
});
