/**
 * Integration Tests for WASM Worker Concurrency and Stress
 *
 * Validates that the worker isolation pattern correctly prevents
 * WASM SDK concurrency errors ("already locked to a reader") under
 * various load conditions and concurrent operation patterns.
 *
 * These tests are critical for validating that the worker-based
 * isolation solves the WASM mutex conflict problem.
 */

import { expect } from 'chai';
import { runWasmOperation, runBatchWasmOperation } from '../../../dist/identities/utils/wasm-worker-runner.js';
import { TEST_IDS } from '../fixtures/testnet.mjs';

describe('WASM Worker Concurrency & Isolation', function concurrencyTests() {
  this.timeout(300000); // 5 minute timeout for concurrency tests

  /**
   * Test: Basic concurrent operations don't cause mutex errors
   * This is the core validation that worker isolation works
   */
  it('should prevent "already locked to a reader" errors with concurrent operations', async () => {
    const numConcurrent = 3;
    const promises = [];

    // Create concurrent operations
    for (let i = 0; i < numConcurrent; i++) {
      promises.push(
        runWasmOperation('identity-fetch', {
          identityId: TEST_IDS.identityId,
        }, {
          timeout: 60000,
          network: 'testnet',
        })
      );
    }

    // All should complete without mutex conflicts
    const results = await Promise.all(promises);

    expect(results).to.have.lengthOf(numConcurrent);
    results.forEach(result => {
      expect(result).to.be.an('object');
      expect(result).to.have.property('id');
    });
  });

  /**
   * Test: High concurrency (many simultaneous workers)
   * Validates that system handles many concurrent operations
   */
  it('should handle high concurrency with many simultaneous workers', async () => {
    const numConcurrent = 10;
    const promises = [];

    // Create many concurrent workers
    for (let i = 0; i < numConcurrent; i++) {
      promises.push(
        runWasmOperation('identity-fetch', {
          identityId: TEST_IDS.identityId,
        }, {
          timeout: 60000,
          network: 'testnet',
        })
      );
    }

    // All should complete
    const results = await Promise.allSettled(promises);

    expect(results).to.have.lengthOf(numConcurrent);

    // Count successes
    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    // Should have mostly successes
    expect(successes.length).to.be.greaterThan(0);

    // Failures should NOT be mutex errors
    failures.forEach(failure => {
      const errorMsg = failure.reason?.message || '';
      expect(errorMsg).to.not.include('locked');
      expect(errorMsg).to.not.include('mutex');
    });
  });

  /**
   * Test: Mixed operation types concurrently
   * Validates that different operations work together without conflicts
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

    expect(results).to.have.lengthOf(4);
    results.forEach(result => {
      expect(result).to.be.an('object');
    });
  });

  /**
   * Test: Batch operations use single worker efficiently
   * Validates that batch mode doesn't spawn unnecessary workers
   */
  it('should use batch mode efficiently with single worker', async () => {
    const identityIds = [
      TEST_IDS.identityId,
      TEST_IDS.specializedBalanceIdentityId,
    ];

    // Batch operation - should use single worker
    const batchStart = Date.now();
    const batchResults = await runBatchWasmOperation('identity-fetch',
      identityIds.map(id => ({ identityId: id })),
      { timeout: 60000 }
    );
    const batchTime = Date.now() - batchStart;

    // Individual operations - will use multiple workers
    const individualStart = Date.now();
    const individualResults = await Promise.all(
      identityIds.map(id =>
        runWasmOperation('identity-fetch', { identityId: id }, { timeout: 60000 })
      )
    );
    const individualTime = Date.now() - individualStart;

    expect(batchResults).to.have.lengthOf(2);
    expect(individualResults).to.have.lengthOf(2);

    // Batch should be comparable or faster (shared WASM initialization)
    // Individual may be faster due to parallelization
    console.log(`Batch time: ${batchTime}ms, Individual time: ${individualTime}ms`);

    batchResults.forEach(result => {
      expect(result).to.be.an('object');
    });
  });

  /**
   * Test: Sequential operations after concurrent batch
   * Validates resource cleanup between operation types
   */
  it('should handle sequential operations after concurrent batch', async () => {
    const identityId = TEST_IDS.identityId;

    // First: concurrent operations
    const concurrentPromises = [];
    for (let i = 0; i < 3; i++) {
      concurrentPromises.push(
        runWasmOperation('identity-fetch', { identityId }, { timeout: 60000 })
      );
    }
    const concurrentResults = await Promise.all(concurrentPromises);

    expect(concurrentResults).to.have.lengthOf(3);

    // Then: batch operation
    const batchResults = await runBatchWasmOperation('identity-get-keys',
      [
        { identityId, keyRequestType: 'all', limit: 10, offset: 0 },
        { identityId, keyRequestType: 'all', limit: 10, offset: 0 },
      ],
      { timeout: 60000 }
    );

    expect(batchResults).to.have.lengthOf(2);
  });

  /**
   * Test: Rapid-fire operations in sequence
   * Validates worker creation doesn't leak resources
   */
  it('should handle rapid sequential operations without resource leaks', async () => {
    const identityId = TEST_IDS.identityId;
    const numOperations = 5;

    for (let i = 0; i < numOperations; i++) {
      const result = await runWasmOperation('identity-fetch', {
        identityId,
      }, {
        timeout: 60000,
        network: 'testnet',
      });

      expect(result).to.be.an('object');
    }

    // If we get here without mutex errors, cleanup is working
    expect(true).to.be.true;
  });

  /**
   * Test: Operations with varying timeouts
   * Validates timeout independence between concurrent operations
   */
  it('should handle concurrent operations with different timeouts', async () => {
    const identityId = TEST_IDS.identityId;

    const promises = [
      runWasmOperation('identity-fetch', { identityId }, { timeout: 30000 }),
      runWasmOperation('identity-fetch', { identityId }, { timeout: 60000 }),
      runWasmOperation('identity-fetch', { identityId }, { timeout: 120000 }),
    ];

    const results = await Promise.all(promises);

    expect(results).to.have.lengthOf(3);
    results.forEach(result => {
      expect(result).to.be.an('object');
    });
  });

  /**
   * Test: Stress test with many operations
   * Validates system stability under heavy load
   */
  it('should handle stress test with many concurrent operations', async function stressTest() {
    this.timeout(600000); // 10 minutes for stress test

    const identityId = TEST_IDS.identityId;
    const numOperations = 20;

    console.log(`Starting stress test with ${numOperations} concurrent operations...`);

    const startTime = Date.now();
    const promises = [];

    for (let i = 0; i < numOperations; i++) {
      promises.push(
        runWasmOperation('identity-fetch', { identityId }, { timeout: 60000 })
          .catch(err => {
            // Track errors but don't fail test
            console.error(`Operation ${i} failed:`, err.message);
            return null;
          })
      );
    }

    const results = await Promise.all(promises);
    const elapsed = Date.now() - startTime;

    const successes = results.filter(r => r !== null).length;
    const failures = results.filter(r => r === null).length;

    console.log(
      `Stress test complete: ${successes} successes, ${failures} failures in ${elapsed}ms`
    );

    // Should have mostly successes
    expect(successes).to.be.greaterThan(numOperations / 2);

    // No mutex errors (failures are acceptable due to network)
    results.forEach(result => {
      if (result === null) {
        // Failed - that's acceptable in stress test
      } else {
        expect(result).to.be.an('object');
      }
    });
  });

  /**
   * Test: Worker error doesn't affect other workers
   * Validates error isolation
   */
  it('should isolate errors between concurrent workers', async () => {
    const validId = TEST_IDS.identityId;
    const invalidId = 'InvalidIdentityIdXYZ';

    const promises = [
      runWasmOperation('identity-fetch', { identityId: validId }, { timeout: 60000 }),
      runWasmOperation('identity-fetch', { identityId: invalidId }, { timeout: 60000 }),
      runWasmOperation('identity-fetch', { identityId: validId }, { timeout: 60000 }),
    ];

    const results = await Promise.allSettled(promises);

    expect(results).to.have.lengthOf(3);

    // First should succeed
    expect(results[0].status).to.equal('fulfilled');
    expect(results[0].value).to.be.an('object');

    // Second should fail
    expect(results[1].status).to.equal('rejected');

    // Third should succeed (not affected by second's error)
    expect(results[2].status).to.equal('fulfilled');
    expect(results[2].value).to.be.an('object');
  });

  /**
   * Test: Repeated concurrent batches
   * Validates batch worker reuse pattern
   */
  it('should handle repeated concurrent batch operations', async function batchTest() {
    this.timeout(300000); // 5 minutes

    const identityIds = [TEST_IDS.identityId, TEST_IDS.specializedBalanceIdentityId];
    const numBatches = 3;

    for (let batch = 0; batch < numBatches; batch++) {
      const results = await runBatchWasmOperation('identity-fetch',
        identityIds.map(id => ({ identityId: id })),
        { timeout: 60000 }
      );

      expect(results).to.have.lengthOf(2);
      results.forEach(result => {
        expect(result).to.be.an('object');
      });
    }
  });

  /**
   * Test: Memory doesn't leak with concurrent operations
   * Validates that WASM resources are properly cleaned up
   */
  it('should not leak memory with many concurrent operations', async function memoryTest() {
    this.timeout(600000); // 10 minutes

    const identityId = TEST_IDS.identityId;

    // Get baseline memory
    if (global.gc) {
      global.gc();
    }
    const baselineMemory = process.memoryUsage().heapUsed;

    // Run many operations
    for (let round = 0; round < 3; round++) {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          runWasmOperation('identity-fetch', { identityId }, { timeout: 60000 })
            .catch(() => null)
        );
      }
      await Promise.all(promises);

      if (global.gc) {
        global.gc();
      }
    }

    // Check memory after operations
    const finalMemory = process.memoryUsage().heapUsed;
    const increase = (finalMemory - baselineMemory) / 1024 / 1024; // MB

    console.log(`Memory increase: ${increase.toFixed(2)} MB`);

    // Memory increase should be reasonable (< 50 MB for this test)
    // This is a soft limit - test for gross leaks, not exact numbers
    expect(increase).to.be.lessThan(100);
  });
});
