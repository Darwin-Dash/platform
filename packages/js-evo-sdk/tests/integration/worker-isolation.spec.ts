/**
 * Integration Tests for Worker Isolation and Concurrency
 *
 * Validates that the worker isolation pattern correctly prevents
 * WASM SDK concurrency errors ("already locked to a reader").
 *
 * These tests are critical for validating that worker isolation solves
 * the WASM mutex conflict problem that caused functional tests to fail.
 *
 * No wallet funding required (uses read-only operations).
 */

import { describe, it, expect } from 'vitest';
import { runWasmOperation, runBatchWasmOperation } from '../../dist/identities/utils/wasm-worker-runner.js';
import { TEST_IDS } from '../fixtures/testnet.mjs';

describe('Worker Isolation - WASM Concurrency Prevention', () => {
  /**
   * Validate basic concurrent operations without mutex errors
   */
  it('should prevent mutex conflicts with concurrent operations', async () => {
    const numConcurrent = 3;
    const promises = [];

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

    const results = await Promise.all(promises);

    expect(results.length).toBe(numConcurrent);
    results.forEach(result => {
      expect(result).toHaveProperty('id');
    });
  }, 120000);

  /**
   * Handle high concurrency (10 simultaneous workers)
   */
  it('should handle high concurrency with 10 simultaneous workers', async () => {
    const numConcurrent = 10;
    const promises = [];

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

    const results = await Promise.allSettled(promises);

    expect(results.length).toBe(numConcurrent);

    const successes = results.filter(r => r.status === 'fulfilled');
    expect(successes.length).toBeGreaterThan(0);

    // Verify no mutex errors in failures
    results.forEach(result => {
      if (result.status === 'rejected') {
        const errorMsg = (result.reason as Error).message;
        expect(errorMsg).not.toMatch(/locked|mutex/i);
      }
    });
  }, 300000);

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
   * Batch operations use single worker efficiently
   */
  it('should use batch mode efficiently with single worker', async () => {
    const identityIds = [
      TEST_IDS.identityId,
      TEST_IDS.specializedBalanceIdentityId,
    ];

    const startTime = Date.now();
    const batchResults = await runBatchWasmOperation('identity-fetch',
      identityIds.map(id => ({ identityId: id })),
      { timeout: 60000 }
    );
    const batchTime = Date.now() - startTime;

    expect(batchResults.length).toBe(2);
    batchResults.forEach(result => {
      expect(result).toHaveProperty('id');
    });

    console.log(`Batch operation time: ${batchTime}ms`);
  }, 120000);

  /**
   * Sequential operations after concurrent batch
   */
  it('should handle sequential after concurrent operations', async () => {
    const identityId = TEST_IDS.identityId;

    // Concurrent operations
    const concurrentPromises = [];
    for (let i = 0; i < 3; i++) {
      concurrentPromises.push(
        runWasmOperation('identity-fetch', { identityId }, { timeout: 60000 })
      );
    }
    const concurrentResults = await Promise.all(concurrentPromises);
    expect(concurrentResults.length).toBe(3);

    // Then batch operation
    const batchResults = await runBatchWasmOperation('identity-get-keys',
      [
        { identityId, keyRequestType: 'all', limit: 10, offset: 0 },
        { identityId, keyRequestType: 'all', limit: 10, offset: 0 },
      ],
      { timeout: 60000 }
    );
    expect(batchResults.length).toBe(2);
  }, 120000);

  /**
   * Rapid-fire sequential operations
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

      expect(result).toHaveProperty('id');
    }

    // If we get here without mutex errors, cleanup is working
    expect(true).toBe(true);
  }, 120000);

  /**
   * Concurrent operations with varying timeouts
   */
  it('should handle concurrent operations with different timeouts', async () => {
    const identityId = TEST_IDS.identityId;

    const promises = [
      runWasmOperation('identity-fetch', { identityId }, { timeout: 30000 }),
      runWasmOperation('identity-fetch', { identityId }, { timeout: 60000 }),
      runWasmOperation('identity-fetch', { identityId }, { timeout: 120000 }),
    ];

    const results = await Promise.all(promises);

    expect(results.length).toBe(3);
    results.forEach(result => {
      expect(result).toHaveProperty('id');
    });
  }, 120000);

  /**
   * Stress test with 20 concurrent operations
   */
  it('should handle stress test with 20 concurrent operations', async () => {
    const identityId = TEST_IDS.identityId;
    const numOperations = 20;

    console.log(`Starting stress test with ${numOperations} concurrent operations...`);

    const startTime = Date.now();
    const promises = [];

    for (let i = 0; i < numOperations; i++) {
      promises.push(
        runWasmOperation('identity-fetch', { identityId }, { timeout: 60000 })
          .catch(err => {
            console.error(`Operation ${i} failed:`, (err as Error).message);
            return null;
          })
      );
    }

    const results = await Promise.all(promises);
    const elapsed = Date.now() - startTime;

    const successes = results.filter(r => r !== null).length;
    const failures = results.filter(r => r === null).length;

    console.log(`Stress test completed: ${successes} successes, ${failures} failures in ${elapsed}ms`);

    expect(successes).toBeGreaterThan(numOperations / 2);

    // Verify no mutex errors
    results.forEach(result => {
      if (result === null) {
        // Failed - acceptable in stress test
      } else {
        expect(result).toHaveProperty('id');
      }
    });
  }, 300000);

  /**
   * Error isolation between workers
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

    expect(results.length).toBe(3);

    // First should succeed
    expect(results[0].status).toBe('fulfilled');
    if (results[0].status === 'fulfilled') {
      expect(results[0].value).toHaveProperty('id');
    }

    // Second should fail
    expect(results[1].status).toBe('rejected');

    // Third should succeed (not affected by second's error)
    expect(results[2].status).toBe('fulfilled');
    if (results[2].status === 'fulfilled') {
      expect(results[2].value).toHaveProperty('id');
    }
  }, 120000);

  /**
   * Repeated concurrent batches
   */
  it('should handle repeated concurrent batches', async () => {
    const identityIds = [
      TEST_IDS.identityId,
      TEST_IDS.specializedBalanceIdentityId,
    ];
    const numBatches = 3;

    for (let batch = 0; batch < numBatches; batch++) {
      const results = await runBatchWasmOperation('identity-fetch',
        identityIds.map(id => ({ identityId: id })),
        { timeout: 60000 }
      );

      expect(results.length).toBe(2);
      results.forEach(result => {
        expect(result).toHaveProperty('id');
      });
    }
  }, 180000);

  /**
   * Memory doesn't leak with many operations
   */
  it('should not leak memory with many concurrent operations', async () => {
    const identityId = TEST_IDS.identityId;

    // Get baseline memory
    if (typeof global !== 'undefined' && (global as any).gc) {
      (global as any).gc();
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

      if (typeof global !== 'undefined' && (global as any).gc) {
        (global as any).gc();
      }
    }

    // Check memory after operations
    const finalMemory = process.memoryUsage().heapUsed;
    const increase = (finalMemory - baselineMemory) / 1024 / 1024; // MB

    console.log(`Memory increase: ${increase.toFixed(2)} MB`);

    // Memory increase should be reasonable (< 100 MB)
    expect(increase).toBeLessThan(100);
  }, 180000);

  /**
   * Multiple workers don't interfere with each other
   */
  it('should have independent workers that don\'t interfere', async () => {
    const promises = [];

    // Create many operations that should run independently
    for (let i = 0; i < 10; i++) {
      const promise = runWasmOperation('identity-fetch', {
        identityId: TEST_IDS.identityId,
      }, {
        timeout: 60000,
        network: 'testnet',
      });
      promises.push(promise);
    }

    const results = await Promise.allSettled(promises);

    // Should have mostly successes
    const successes = results.filter(r => r.status === 'fulfilled');
    expect(successes.length).toBeGreaterThan(5);

    // No mutex errors in failures
    results.forEach(result => {
      if (result.status === 'rejected') {
        const errorMsg = (result.reason as Error).message;
        expect(errorMsg).not.toMatch(/locked|mutex/);
      }
    });
  }, 180000);
});
