/**
 * Intensive Polling Tests - Resilience Validation
 *
 * Tests high-frequency polling patterns that stress the resilience infrastructure.
 * Inspired by transaction-finder's ChainLockHeightMonitor which polls getEpochsInfo
 * every 5 seconds continuously.
 *
 * These tests validate that the ResilientDAPIClient can handle:
 * - High-frequency repeated calls to the same method
 * - Scattered failures during long-running polling
 * - Adaptive backoff and recovery during sustained load
 * - Mixed operation types under sustained polling load
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ResilientDAPIClient } from '../../src/ResilientDAPIClient.js';
import { failureLogger } from './helpers/failure-logger.js';
import { metricsCollector, measureLatency } from './helpers/metrics-collector.js';
import { createMockDAPIClient, MockFailureScenarios, type ControllableMockDAPIClient } from './helpers/controllable-mock-client.js';

describe('Intensive Polling - Mock Client', () => {
  let client: ResilientDAPIClient;
  let mockClient: ControllableMockDAPIClient;

  beforeAll(() => {
    mockClient = createMockDAPIClient();

    client = new ResilientDAPIClient(mockClient as any, {
      maxRetryAttempts: 10,
      retryBaseDelay: 500, // Faster retries for polling tests
      maxRetryDelay: 5000,
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

    console.log('\n=== Polling Test Summary ===');
    console.log(`Total Operations: ${summary.totalOperations}`);
    console.log(`Successful: ${summary.successfulOperations}`);
    console.log(`Success Rate: ${((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)}%`);
    console.log(`Total Retries: ${stats.totalRetries}`);
    console.log(`\nMock Client Stats:`);
    console.log(`  Total Calls: ${mockStats.totalCalls}`);
    console.log(`  Total Failures Injected: ${mockStats.totalFailures}`);
  });

  beforeEach(() => {
    mockClient.clearFailures();
    mockClient.clearCallCounts();
  });

  describe('High-Frequency Polling', () => {
    it('should handle 60 consecutive getEpochsInfo calls (1 per second)', async () => {
      const pollCount = 60;
      const pollInterval = 1000; // 1 second

      const results: any[] = [];
      const latencies: number[] = [];

      const startTime = Date.now();

      // Poll getEpochsInfo repeatedly
      for (let i = 0; i < pollCount; i++) {
        const pollStart = Date.now();

        const epochInfo = await measureLatency('getEpochsInfo', async () => {
          return await client.platform.getEpochsInfo();
        });

        const pollLatency = Date.now() - pollStart;
        latencies.push(pollLatency);
        results.push(epochInfo);

        failureLogger.recordOperation(true);

        // Wait for interval (subtract operation time to maintain consistent rate)
        const waitTime = Math.max(0, pollInterval - pollLatency);
        if (i < pollCount - 1 && waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      const totalTime = Date.now() - startTime;

      // Verify all polls succeeded
      expect(results.length).toBe(pollCount);
      expect(mockClient.getCallCount('platform', 'getEpochsInfo')).toBe(pollCount);

      // Calculate latency statistics
      const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      console.log(`  ${pollCount} polls completed in ${totalTime}ms`);
      console.log(`  Latency: avg=${avgLatency.toFixed(2)}ms, min=${minLatency}ms, max=${maxLatency}ms`);
      console.log(`  Expected time: ~${pollCount * pollInterval}ms, Actual: ${totalTime}ms`);
    }, 120000);

    it('should handle scattered failures during continuous polling (10% failure rate)', async () => {
      const pollCount = 30;
      const pollInterval = 500; // 0.5 seconds for faster test

      // Inject 3 deterministic failures (instead of probability-based)
      mockClient.injectFailure({
        method: 'getEpochsInfo',
        failureType: 'timeout',
        count: 3,
      });

      const retryEvents: any[] = [];
      client.on('retry', (data) => {
        retryEvents.push(data);
        metricsCollector.incrementEvent('retries');
      });

      const results: any[] = [];
      const startTime = Date.now();

      // Poll continuously
      for (let i = 0; i < pollCount; i++) {
        const epochInfo = await client.platform.getEpochsInfo();
        results.push(epochInfo);
        failureLogger.recordOperation(true);

        if (i < pollCount - 1) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }

      const totalTime = Date.now() - startTime;

      // All polls should eventually succeed despite failures
      expect(results.length).toBe(pollCount);

      // Should have some retries due to 10% failure rate
      const totalCalls = mockClient.getCallCount('platform', 'getEpochsInfo');
      const failureCount = mockClient.getFailureCount('platform', 'getEpochsInfo', 'timeout');

      console.log(`  ${pollCount} polls with ~10% failure rate:`);
      console.log(`    Total calls: ${totalCalls}, Failures: ${failureCount}, Retries: ${retryEvents.length}`);
      console.log(`    Completed in ${totalTime}ms`);

      // Verify resilience - exactly 3 failures injected, all operations should succeed
      expect(failureCount).toBe(3); // Exactly 3 failures injected

      client.removeAllListeners('retry');
    }, 60000);

    it('should handle burst of failures followed by recovery', async () => {
      const pollCount = 20;
      const pollInterval = 500;

      // Inject 5 consecutive failures starting from call 10
      let callIndex = 0;
      mockClient.injectFailure({
        method: 'getEpochsInfo',
        failureType: 'connection_refused',
        count: 5,
      });

      const retryEvents: any[] = [];
      const failureTimestamps: number[] = [];

      client.on('retry', (data) => {
        retryEvents.push(data);
        failureTimestamps.push(Date.now());
        metricsCollector.incrementEvent('retries');
      });

      const results: any[] = [];
      const startTime = Date.now();

      // Poll continuously through the failure burst
      for (let i = 0; i < pollCount; i++) {
        const epochInfo = await client.platform.getEpochsInfo();
        results.push(epochInfo);
        failureLogger.recordOperation(true);

        if (i < pollCount - 1) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }

      const totalTime = Date.now() - startTime;

      // All polls should eventually succeed
      expect(results.length).toBe(pollCount);

      // Should have 5 retries
      expect(retryEvents.length).toBe(5);

      console.log(`  ${pollCount} polls with burst of 5 failures:`);
      console.log(`    Total time: ${totalTime}ms`);
      console.log(`    Recovery after ${retryEvents.length} retries`);

      client.removeAllListeners('retry');
    }, 60000);
  });

  describe('Sustained Mixed Load', () => {
    it('should handle sustained mixed operations (5 minutes simulation)', async () => {
      // Shortened to 30 seconds for practical testing (can be increased)
      const durationSeconds = 30;
      const operationTypes = ['getIdentity', 'getEpochsInfo', 'getBestBlockHeight', 'getDataContract'];

      // Inject occasional failures (5% rate)
      mockClient.injectFailure({
        failureType: 'timeout',
        probability: 0.05,
      });

      const retryEvents: any[] = [];
      client.on('retry', (data) => {
        retryEvents.push(data);
        metricsCollector.incrementEvent('retries');
      });

      const results: any[] = [];
      const operationCounts: Record<string, number> = {};
      const startTime = Date.now();

      // Run mixed operations until duration expires
      let iteration = 0;
      while ((Date.now() - startTime) < durationSeconds * 1000) {
        // Rotate through operation types
        const opType = operationTypes[iteration % operationTypes.length];
        iteration++;

        try {
          let result;
          switch (opType) {
            case 'getIdentity':
              result = await client.platform.getIdentity('test-id');
              break;
            case 'getEpochsInfo':
              result = await client.platform.getEpochsInfo();
              break;
            case 'getBestBlockHeight':
              result = await client.core.getBestBlockHeight();
              break;
            case 'getDataContract':
              result = await client.platform.getDataContract('test-contract');
              break;
          }

          results.push({ type: opType, result });
          operationCounts[opType] = (operationCounts[opType] || 0) + 1;
          failureLogger.recordOperation(true);
        } catch (error) {
          // Operation failed even after retries
          failureLogger.recordOperation(false);
        }

        // Small delay between operations
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const totalTime = Date.now() - startTime;
      const mockStats = mockClient.getStats();

      console.log(`  Sustained load test (${durationSeconds}s):`);
      console.log(`    Total operations: ${results.length}`);
      console.log(`    Operation breakdown:`, operationCounts);
      console.log(`    Retries: ${retryEvents.length}`);
      console.log(`    Mock failures: ${mockStats.totalFailures}`);
      console.log(`    Actual duration: ${totalTime}ms`);

      // Verify reasonable operation count (should be at least 200 ops in 30s with 100ms delay)
      expect(results.length).toBeGreaterThan(200);

      // Should have some retries due to 5% failure rate
      expect(retryEvents.length).toBeGreaterThan(0);

      client.removeAllListeners('retry');
    }, 120000);

    // NOTE: Skipped for mock client - mock operations complete instantly,
    // making performance degradation testing meaningless
    it.skip('should maintain consistent performance under sustained polling load', async () => {
      const pollCount = 100;
      const pollInterval = 200; // 5 ops/sec

      const latencies: number[] = [];
      const startTime = Date.now();

      for (let i = 0; i < pollCount; i++) {
        const opStart = Date.now();

        await client.platform.getEpochsInfo();

        const opLatency = Date.now() - opStart;
        latencies.push(opLatency);

        failureLogger.recordOperation(true);

        const waitTime = Math.max(0, pollInterval - opLatency);
        if (i < pollCount - 1 && waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      const totalTime = Date.now() - startTime;

      // Calculate latency statistics
      const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
      const p95Index = Math.floor(latencies.length * 0.95);
      const sortedLatencies = [...latencies].sort((a, b) => a - b);
      const p95Latency = sortedLatencies[p95Index];

      // First half vs second half average (to detect degradation)
      const firstHalfAvg = latencies.slice(0, 50).reduce((sum, l) => sum + l, 0) / 50;
      const secondHalfAvg = latencies.slice(50).reduce((sum, l) => sum + l, 0) / 50;

      console.log(`  Performance consistency over ${pollCount} polls:`);
      console.log(`    Average latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`    P95 latency: ${p95Latency}ms`);
      console.log(`    First half avg: ${firstHalfAvg.toFixed(2)}ms`);
      console.log(`    Second half avg: ${secondHalfAvg.toFixed(2)}ms`);
      console.log(`    Degradation: ${((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100).toFixed(2)}%`);

      // Performance should not degrade significantly
      expect(secondHalfAvg).toBeLessThan(firstHalfAvg * 1.5); // < 50% degradation

      expect(mockClient.getCallCount('platform', 'getEpochsInfo')).toBe(pollCount);
    }, 60000);
  });

  describe('Adaptive Backoff During Polling', () => {
    it('should apply exponential backoff during polling failures', async () => {
      // Inject 3 consecutive failures to trigger backoff (using core operation which retries)
      mockClient.injectFailure({
        method: 'getBestBlockHeight',
        failureType: 'timeout',
        count: 3,
      });

      const retryDelays: number[] = [];
      const retryTimestamps: number[] = [];

      client.on('retry', (data) => {
        retryDelays.push(data.delay);
        retryTimestamps.push(Date.now());
        metricsCollector.incrementEvent('retries');
      });

      const startTime = Date.now();

      // Single poll that will fail 3 times (core operation retries)
      const result = await client.core.getBestBlockHeight();

      const totalTime = Date.now() - startTime;

      expect(result).toBeDefined();

      // Verify exponential backoff delays: 500ms, 1000ms, 2000ms (with our faster settings)
      expect(retryDelays.length).toBe(3);
      expect(retryDelays[0]).toBe(500);   // First retry
      expect(retryDelays[1]).toBe(1000);  // Second retry (doubled)
      expect(retryDelays[2]).toBe(2000);  // Third retry (doubled again)

      // Verify actual timing
      for (let i = 1; i < retryTimestamps.length; i++) {
        const actualDelay = retryTimestamps[i] - retryTimestamps[i - 1];
        const expectedDelay = retryDelays[i - 1];

        // Allow 300ms tolerance
        expect(actualDelay).toBeGreaterThanOrEqual(expectedDelay - 300);
        expect(actualDelay).toBeLessThan(expectedDelay + 1000);
      }

      console.log(`  Backoff test: ${retryDelays.length} retries with delays ${retryDelays.join('ms, ')}ms`);
      console.log(`  Total time: ${totalTime}ms`);

      failureLogger.recordOperation(true);

      client.removeAllListeners('retry');
    }, 60000);

    it('should resume normal polling after recovery', async () => {
      // Inject 2 failures, then allow success (using core operation which retries)
      mockClient.injectFailure({
        method: 'getBestBlockHeight',
        failureType: 'timeout',
        count: 2,
      });

      let retryCount = 0;
      client.on('retry', () => {
        retryCount++;
      });

      // First poll - will retry (core operation)
      await client.core.getBestBlockHeight();
      expect(retryCount).toBe(2);

      // Clear listener and counter
      client.removeAllListeners('retry');
      retryCount = 0;

      // Second poll - should not trigger any retries (back to normal)
      const secondHandler = () => {
        retryCount++;
      };
      client.on('retry', secondHandler);

      await client.core.getBestBlockHeight();
      expect(retryCount).toBe(0); // No retries on recovered connection

      console.log(`  Polling resumed normally after recovery`);

      failureLogger.recordOperation(true);
      failureLogger.recordOperation(true);

      client.removeAllListeners('retry');
    }, 60000);
  });

  describe('Polling Statistics', () => {
    it('should accurately track polling operation counts', async () => {
      const pollCount = 50;

      for (let i = 0; i < pollCount; i++) {
        await client.platform.getEpochsInfo();
        failureLogger.recordOperation(true);
      }

      const mockStats = mockClient.getStats();

      expect(mockStats.totalCalls).toBe(pollCount);
      expect(mockStats.callsByMethod['platform.getEpochsInfo']).toBe(pollCount);

      console.log(`  Tracked ${pollCount} polling operations accurately`);
    }, 60000);
  });
});
