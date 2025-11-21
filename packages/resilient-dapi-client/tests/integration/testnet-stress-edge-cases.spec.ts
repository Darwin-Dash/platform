/**
 * Stress & Edge Case Tests - Resilience Validation
 *
 * Tests edge cases and stress scenarios that push the resilience infrastructure to its limits.
 * Inspired by transaction-finder's header cache miss scenarios and high-volume operations.
 *
 * These tests validate that the ResilientDAPIClient can handle:
 * - Cascade failures (one failure triggering additional operations)
 * - Large response payloads (500+ documents)
 * - Out-of-order operation completion
 * - Extreme concurrency scenarios
 * - Resource exhaustion prevention
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ResilientDAPIClient } from '../../src/ResilientDAPIClient.js';
import { failureLogger } from './helpers/failure-logger.js';
import { metricsCollector, measureLatency } from './helpers/metrics-collector.js';
import { createMockDAPIClient, MockFailureScenarios, type ControllableMockDAPIClient } from './helpers/controllable-mock-client.js';

describe('Stress & Edge Cases - Mock Client', () => {
  let client: ResilientDAPIClient;
  let mockClient: ControllableMockDAPIClient;

  beforeAll(() => {
    mockClient = createMockDAPIClient();

    client = new ResilientDAPIClient(mockClient as any, {
      maxRetryAttempts: 10,
      retryBaseDelay: 1000,
      maxRetryDelay: 30000,
      logLevel: 'info',
    });

    failureLogger.startTestRun();
    metricsCollector.start();
  });

  afterAll(() => {
    metricsCollector.stop();
    client.destroy();

    const summary = failureLogger.getSummary();
    const stats = failureLogger.getStatistics();
    const mockStats = mockClient.getStats();

    console.log('\n=== Stress & Edge Case Test Summary ===');
    console.log(`Total Operations: ${summary.totalOperations}`);
    console.log(`Successful: ${summary.successfulOperations}`);
    console.log(`Success Rate: ${((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)}%`);
    console.log(`Total Retries: ${stats.totalRetries}`);
    console.log(`Total Failovers: ${stats.totalFailovers}`);
    console.log(`\nMock Client Stats:`);
    console.log(`  Total Calls: ${mockStats.totalCalls}`);
    console.log(`  Total Failures Injected: ${mockStats.totalFailures}`);
  });

  beforeEach(() => {
    mockClient.clearFailures();
    mockClient.clearCallCounts();
  });

  describe('Cascade Failure Scenarios', () => {
    it('should handle cascade failures with core retry (header cache miss pattern)', async () => {
      /**
       * Simulates transaction-finder's header cache miss scenario:
       * 1. Primary operation fails (getBlockByHeight)
       * 2. Core operations retry (not degrade like platform)
       * 3. On persistent failure, triggers fallback operation
       */

      const blockHeight = 2000000;
      const txCount = 5;

      // Inject failures on 2 block fetches (core retries, doesn't degrade)
      mockClient.injectFailure({
        method: 'getBlockByHeight',
        failureType: 'timeout',
        count: 2, // Fail 2 out of 5 block fetches
      });

      const retryEvents: any[] = [];
      const cascadeOperations: string[] = [];

      client.on('retry', (data) => {
        retryEvents.push(data);
        metricsCollector.incrementEvent('retries');
      });

      const startTime = Date.now();

      // Fetch blocks - core operations retry and succeed (no degradation for core)
      for (let i = 0; i < txCount; i++) {
        // Core operations retry, not degrade
        const block = await client.core.getBlockByHeight(blockHeight + i);
        cascadeOperations.push('getBlockByHeight:success');
        failureLogger.recordOperation(true);
      }

      const totalTime = Date.now() - startTime;

      // Verify retries happened (core operations retry, not degrade)
      expect(retryEvents.length).toBe(2);
      expect(mockClient.getCallCount('core', 'getBlockByHeight')).toBe(txCount + 2); // 5 blocks + 2 retries

      console.log(`  Cascade failure test (core retry behavior):`);
      console.log(`    Operations: ${cascadeOperations.join(' → ')}`);
      console.log(`    Retries: ${retryEvents.length}`);
      console.log(`    Total time: ${totalTime}ms`);

      client.removeAllListeners('retry');
    }, 120000);

    it('should handle platform degradation in cascade scenarios', async () => {
      /**
       * Tests that platform operations degrade gracefully on failure.
       * Platform failures trigger degradation, not exhaustive retries.
       */

      // Inject failures on platform operations (will cause degradation)
      mockClient.injectFailure({ method: 'getIdentity', failureType: 'timeout', count: 1 });

      const retryEventsByMethod: Record<string, number> = {};
      const degradationEvents: any[] = [];

      client.on('retry', (data) => {
        const method = data.method || 'unknown';
        retryEventsByMethod[method] = (retryEventsByMethod[method] || 0) + 1;
        metricsCollector.incrementEvent('retries');
      });
      client.on('degradation', (data) => {
        degradationEvents.push(data);
      });

      const identityId = 'test-cascade-retry-budget';

      // Execute cascade: getIdentity degrades, then reset and continue
      const identity = await client.platform.getIdentity(identityId);
      expect(identity).toBeNull(); // Degraded
      expect(degradationEvents.length).toBe(1);

      // Reset and continue
      client.resetResilience();
      const nonce = await client.platform.getIdentityNonce(identityId);
      expect(nonce).toBeGreaterThanOrEqual(0);

      // Each operation should have been called once (degradation prevents retries)
      console.log(`  Retry distribution:`, retryEventsByMethod);
      console.log(`  Degradations: ${degradationEvents.length}`);

      // Verify degradation behavior
      expect(mockClient.getCallCount('platform', 'getIdentity')).toBe(1); // 1 fail → degrade
      expect(mockClient.getCallCount('platform', 'getIdentityNonce')).toBe(1); // Success after reset

      failureLogger.recordOperation(false); // getIdentity degraded
      failureLogger.recordOperation(true); // getIdentityNonce succeeded

      client.removeAllListeners('retry');
      client.removeAllListeners('degradation');
    }, 90000);

    it('should handle multi-level cascade with degradation and recovery', async () => {
      /**
       * Tests deeply nested cascade scenarios with degradation:
       * Operation A fails → degrades → reset → B succeeds → C succeeds
       */

      // Inject failure on first operation
      mockClient.injectFailure({ method: 'getDataContract', failureType: 'timeout', count: 1 });

      const operationSequence: string[] = [];
      const degradationEvents: any[] = [];

      client.on('degradation', (data) => {
        degradationEvents.push(data);
      });

      const startTime = Date.now();

      // Level 1: Try to get contract - degrades
      const contract = await client.platform.getDataContract('test-contract');
      if (contract === null) {
        operationSequence.push('getDataContract:degraded');

        // Reset to continue
        client.resetResilience();

        // Level 2: Fallback to identity (succeeds after reset)
        const identity = await client.platform.getIdentity('fallback-identity');
        operationSequence.push('getIdentity:success');

        // Level 3: Finally get documents
        const docs = await client.platform.getDocuments('backup-contract', 'doc', {});
        operationSequence.push('getDocuments:success');
      } else {
        operationSequence.push('getDataContract:success');
      }

      const totalTime = Date.now() - startTime;

      console.log(`  Multi-level cascade with degradation: ${operationSequence.join(' → ')}`);
      console.log(`  Degradations: ${degradationEvents.length}`);
      console.log(`  Total time: ${totalTime}ms`);

      // Verify the cascade occurred with degradation
      expect(operationSequence.length).toBeGreaterThan(1);
      expect(degradationEvents.length).toBe(1);

      failureLogger.recordOperation(false); // First degraded
      failureLogger.recordOperation(true); // Second succeeded
      failureLogger.recordOperation(true); // Third succeeded

      client.removeAllListeners('degradation');
    }, 120000);
  });

  describe('Large Response Handling', () => {
    it('should handle 500+ document responses efficiently', async () => {
      const documentCount = 500;
      const contractId = 'test-contract-large';

      // Create large mock response
      const largeDocuments = Array.from({ length: documentCount }, (_, i) => ({
        id: `doc-${i}`,
        name: `Document ${i}`,
        data: {
          value: i,
          timestamp: Date.now(),
          metadata: `Metadata for document ${i}`.repeat(10), // Add some size
        },
      }));

      mockClient.setResponse('platform', 'getDocuments', largeDocuments);

      const startTime = Date.now();

      const documents = await measureLatency('getDocuments', async () => {
        return await client.platform.getDocuments(contractId, 'largeDoc', {});
      });

      const totalTime = Date.now() - startTime;

      expect(documents.length).toBe(documentCount);

      // Rough size calculation (for logging)
      const responseSize = JSON.stringify(documents).length;

      console.log(`  Large response test:`);
      console.log(`    Documents: ${documentCount}`);
      console.log(`    Approximate size: ${(responseSize / 1024).toFixed(2)} KB`);
      console.log(`    Fetch time: ${totalTime}ms`);
      console.log(`    Throughput: ${(documentCount / (totalTime / 1000)).toFixed(2)} docs/sec`);

      failureLogger.recordOperation(true);
    }, 60000);

    it('should degrade gracefully on timeout with large response', async () => {
      const documentCount = 1000;

      const largeDocuments = Array.from({ length: documentCount }, (_, i) => ({
        id: `doc-${i}`,
        data: { value: i },
      }));

      mockClient.setResponse('platform', 'getDocuments', largeDocuments);

      // Inject timeout on first attempt (simulating slow large response)
      mockClient.injectFailure({ method: 'getDocuments', failureType: 'timeout', count: 1 });

      const retryEvents: any[] = [];
      const degradationEvents: any[] = [];
      client.on('retry', (data) => {
        retryEvents.push(data);
        metricsCollector.incrementEvent('retries');
      });
      client.on('degradation', (data) => {
        degradationEvents.push(data);
      });

      const startTime = Date.now();

      const documents = await client.platform.getDocuments('contract-id', 'largeDoc', {});

      const totalTime = Date.now() - startTime;

      // Platform degrades on failure
      expect(documents).toBeNull();
      expect(retryEvents.length).toBe(1); // 1 retry event before degradation
      expect(degradationEvents.length).toBe(1);

      console.log(`  Large response degraded gracefully in ${totalTime}ms`);

      failureLogger.recordOperation(false); // Operation degraded

      client.removeAllListeners('retry');
      client.removeAllListeners('degradation');
    }, 90000);

    it('should handle multiple concurrent large response queries', async () => {
      const documentCount = 200;
      const concurrentQueries = 5;

      const largeDocuments = Array.from({ length: documentCount }, (_, i) => ({
        id: `doc-${i}`,
        data: { value: i },
      }));

      mockClient.setResponse('platform', 'getDocuments', largeDocuments);

      const startTime = Date.now();

      // Execute concurrent queries
      const promises = Array.from({ length: concurrentQueries }, (_, i) =>
        measureLatency('getDocuments', async () => {
          return await client.platform.getDocuments(`contract-${i}`, 'largeDoc', {});
        })
      );

      const results = await Promise.all(promises);

      const totalTime = Date.now() - startTime;

      expect(results.length).toBe(concurrentQueries);
      results.forEach(docs => {
        expect(docs.length).toBe(documentCount);
      });

      const totalDocuments = results.reduce((sum, docs) => sum + docs.length, 0);

      console.log(`  Concurrent large queries:`);
      console.log(`    Queries: ${concurrentQueries}`);
      console.log(`    Total documents: ${totalDocuments}`);
      console.log(`    Total time: ${totalTime}ms`);
      console.log(`    Average per query: ${(totalTime / concurrentQueries).toFixed(2)}ms`);

      for (let i = 0; i < concurrentQueries; i++) {
        failureLogger.recordOperation(true);
      }
    }, 120000);
  });

  describe('Out-of-Order Operation Completion', () => {
    // NOTE: Skipped for mock client - mock operations complete instantly without respecting delays,
    // making order-based assertions meaningless
    it.skip('should handle operations completing in different order than submitted', async () => {
      /**
       * Submit operations A1, A2, B1, B2, C1, C2 where:
       * - A operations are slow (simulated delay)
       * - B operations are fast
       * - C operations fail then retry
       * Expected completion order: B → C → A
       */

      // Configure different response times
      mockClient.setResponse('platform', 'getIdentity', { id: 'A', delay: 2000 }); // Slow
      mockClient.setResponse('platform', 'getDataContract', { id: 'B', delay: 0 }); // Fast
      mockClient.setResponse('core', 'getBestBlockHeight', 2000000); // Medium

      // Inject failures on C operations
      mockClient.injectFailure({ method: 'getDocuments', failureType: 'timeout', count: 1 });

      const completionOrder: string[] = [];
      const startTime = Date.now();

      // Submit all operations concurrently (handle null results from degradation)
      const promises = [
        client.platform.getIdentity('A1').then((result) => {
          if (result !== null) completionOrder.push('A1');
          return result ? 'A1' : null;
        }),
        client.platform.getIdentity('A2').then((result) => {
          if (result !== null) completionOrder.push('A2');
          return result ? 'A2' : null;
        }),
        client.platform.getDataContract('B1').then((result) => {
          if (result !== null) completionOrder.push('B1');
          return result ? 'B1' : null;
        }),
        client.platform.getDataContract('B2').then((result) => {
          if (result !== null) completionOrder.push('B2');
          return result ? 'B2' : null;
        }),
        client.platform.getDocuments('C1', 'doc', {}).then((result) => {
          if (result !== null) completionOrder.push('C1');
          return result ? 'C1' : null;
        }),
        client.platform.getDocuments('C2', 'doc', {}).then((result) => {
          if (result !== null) completionOrder.push('C2');
          return result ? 'C2' : null;
        }),
      ];

      const results = await Promise.all(promises);

      const totalTime = Date.now() - startTime;

      console.log(`  Out-of-order completion:`);
      console.log(`    Submission order: A1, A2, B1, B2, C1, C2`);
      console.log(`    Completion order: ${completionOrder.join(', ')}`);
      console.log(`    Total time: ${totalTime}ms`);

      // Verify all operations completed (some may be null from degradation)
      expect(results.length).toBe(6);
      expect(completionOrder.length).toBeGreaterThan(0); // Some may be null

      // B operations (fast) should complete before A operations (slow) - if they succeeded
      const b1Index = completionOrder.indexOf('B1');
      const b2Index = completionOrder.indexOf('B2');
      const a1Index = completionOrder.indexOf('A1');
      const a2Index = completionOrder.indexOf('A2');

      if (b1Index !== -1 && a1Index !== -1) {
        expect(b1Index).toBeLessThan(a1Index);
      }
      if (b2Index !== -1 && a2Index !== -1) {
        expect(b2Index).toBeLessThan(a2Index);
      }

      for (let i = 0; i < 6; i++) {
        failureLogger.recordOperation(true);
      }
    }, 120000);

    it('should handle rapid operation reordering under mixed latency', async () => {
      const operationCount = 20;

      // Random latency simulation by alternating fast/slow operations
      const promises: Promise<any>[] = [];
      const submissionOrder: string[] = [];
      const completionOrder: string[] = [];

      // Reset before test to clear degradation state
      client.resetResilience();

      for (let i = 0; i < operationCount; i++) {
        const opId = `op-${i}`;
        submissionOrder.push(opId);

        // Alternate between fast (core) and slow (platform - no failures)
        if (i % 2 === 0) {
          // Fast core operation
          promises.push(
            client.core.getBestBlockHeight().then(() => {
              completionOrder.push(opId);
            })
          );
        } else {
          // Platform operation (no failures injected - should succeed)
          promises.push(
            client.platform.getIdentity(`id-${i}`).then((result) => {
              if (result !== null) {
                completionOrder.push(opId);
              }
            })
          );
        }
      }

      const startTime = Date.now();
      await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      console.log(`  Rapid reordering test: ${operationCount} ops in ${totalTime}ms`);
      console.log(`    Submission: ${submissionOrder.slice(0, 5).join(', ')}...`);
      console.log(`    Completion: ${completionOrder.slice(0, 5).join(', ')}...`);

      // Verify all operations completed
      expect(completionOrder.length).toBe(operationCount);

      for (let i = 0; i < operationCount; i++) {
        failureLogger.recordOperation(true);
      }
    }, 120000);
  });

  describe('Extreme Concurrency', () => {
    it('should handle 500 concurrent operations', async () => {
      const concurrentOps = 500;

      // Inject random 2% failure rate
      mockClient.injectFailure({
        failureType: 'timeout',
        probability: 0.02,
      });

      const retryEvents: any[] = [];
      client.on('retry', (data) => {
        retryEvents.push(data);
        metricsCollector.incrementEvent('retries');
      });

      const startTime = Date.now();

      const promises = Array.from({ length: concurrentOps }, (_, i) =>
        client.core.getBestBlockHeight()
      );

      const results = await Promise.all(promises);

      const totalTime = Date.now() - startTime;

      expect(results.length).toBe(concurrentOps);

      const mockStats = mockClient.getStats();

      console.log(`  Extreme concurrency (${concurrentOps} concurrent ops):`);
      console.log(`    Total time: ${totalTime}ms`);
      console.log(`    Average time per op: ${(totalTime / concurrentOps).toFixed(2)}ms`);
      console.log(`    Retries: ${retryEvents.length}`);
      console.log(`    Total calls: ${mockStats.totalCalls}`);
      console.log(`    Failures: ${mockStats.totalFailures}`);

      for (let i = 0; i < concurrentOps; i++) {
        failureLogger.recordOperation(true);
      }

      client.removeAllListeners('retry');
    }, 180000);

    it('should maintain state consistency under extreme concurrency', async () => {
      const concurrentOps = 100;

      // All operations should see consistent state
      const results: number[] = [];

      const promises = Array.from({ length: concurrentOps }, () =>
        client.core.getBestBlockHeight().then(height => {
          results.push(height);
        })
      );

      await Promise.all(promises);

      // All results should be the same (mock returns constant)
      const uniqueHeights = new Set(results);

      expect(results.length).toBe(concurrentOps);
      expect(uniqueHeights.size).toBe(1); // All should be same height (2000000)

      console.log(`  State consistency: ${concurrentOps} concurrent ops returned consistent state`);

      for (let i = 0; i < concurrentOps; i++) {
        failureLogger.recordOperation(true);
      }
    }, 120000);
  });

  describe('Resource Management', () => {
    it('should not accumulate stale listeners after many operations', async () => {
      const operationCount = 100;

      // Add and remove listeners repeatedly
      for (let i = 0; i < operationCount; i++) {
        const handler = () => { };
        client.on('retry', handler);

        await client.core.getBestBlockHeight();

        client.removeListener('retry', handler);

        failureLogger.recordOperation(true);
      }

      // Check listener count (should be minimal)
      const listenerCount = client.listenerCount('retry');

      console.log(`  Listener cleanup: ${listenerCount} listeners after ${operationCount} ops`);

      expect(listenerCount).toBeLessThan(10); // Should not accumulate
    }, 120000);
  });
});
