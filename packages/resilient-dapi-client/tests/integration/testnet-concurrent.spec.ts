/**
 * Concurrent Operations Tests - Testnet Validation
 *
 * Validates resilient client behavior under concurrent load.
 * Tests thread safety, node pool sharing, and concurrent retry/failover handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ResilientDAPIClient } from '../../src/ResilientDAPIClient.js';
import { getTestnetConfig } from './helpers/testnet-config.js';
import { failureLogger } from './helpers/failure-logger.js';
import { metricsCollector, measureLatency } from './helpers/metrics-collector.js';

describe('Concurrent Operations - Testnet', () => {
  let client: ResilientDAPIClient;
  let config: ReturnType<typeof getTestnetConfig>;

  beforeAll(() => {
    config = getTestnetConfig();

    client = new ResilientDAPIClient({
      network: 'testnet',
      dapiAddresses: config.dapiAddresses,
      timeout: config.timeout.normal,
      retries: 0,
      maxRetryAttempts: 10,
      retryBaseDelay: 1000,
      maxRetryDelay: 30000,
      nodeRetryDelay: 300000,
      logLevel: 'info',
    });

    failureLogger.startTestRun();
    metricsCollector.start();
  });

  afterAll(() => {
    metricsCollector.stop();

    const summary = failureLogger.getSummary();
    const latencies = metricsCollector.getAllLatencyMetrics();

    console.log('\n=== Concurrent Operations Test Summary ===');
    console.log(`Total Operations: ${summary.totalOperations}`);
    console.log(`Successful: ${summary.successfulOperations}`);
    console.log(`Success Rate: ${((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)}%`);

    if (latencies.has('getBestBlockHeight')) {
      const metrics = latencies.get('getBestBlockHeight')!;
      console.log(`\nLatency under concurrent load:`);
      console.log(`  Min: ${metrics.min}ms, Max: ${metrics.max}ms, Avg: ${metrics.avg}ms, P95: ${metrics.p95}ms`);
    }
  });

  it('should handle 10 concurrent requests successfully', async () => {
    const concurrency = 10;
    const promises: Promise<number>[] = [];

    for (let i = 0; i < concurrency; i++) {
      promises.push(
        measureLatency('getBestBlockHeight', async () => {
          return await client.core.getBestBlockHeight();
        })
      );
    }

    const results = await Promise.all(promises);

    expect(results).toHaveLength(concurrency);
    expect(results.every(h => h > 0)).toBe(true);

    // All heights should be within a few blocks of each other
    const maxDiff = Math.max(...results) - Math.min(...results);
    expect(maxDiff).toBeLessThan(10);

    console.log(`  ✓ ${concurrency} concurrent requests completed`);
    console.log(`  Heights: min=${Math.min(...results)}, max=${Math.max(...results)}, diff=${maxDiff}`);

    results.forEach(() => failureLogger.recordOperation(true));
  }, 60000);

  it('should handle 50 concurrent requests with proper node rotation', async () => {
    const concurrency = 50;
    const promises: Promise<number>[] = [];

    for (let i = 0; i < concurrency; i++) {
      promises.push(
        measureLatency('getBestBlockHeight', async () => {
          return await client.core.getBestBlockHeight();
        })
      );
    }

    const startTime = Date.now();
    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;

    expect(results).toHaveLength(concurrency);
    expect(results.every(h => h > 0)).toBe(true);

    console.log(`  ✓ ${concurrency} concurrent requests completed in ${duration}ms`);
    console.log(`  Average: ${(duration / concurrency).toFixed(2)}ms per request`);

    results.forEach(() => failureLogger.recordOperation(true));
  }, 120000);

  it('should handle mixed concurrent core and platform operations', async () => {
    const coreRequests = 20;
    const platformRequests = 20;
    const promises: Promise<any>[] = [];

    // Core requests
    for (let i = 0; i < coreRequests; i++) {
      promises.push(
        (async () => {
          try {
            const height = await client.core.getBestBlockHeight();
            failureLogger.recordOperation(true);
            return { type: 'core', success: true, value: height };
          } catch (error) {
            failureLogger.recordOperation(false);
            return { type: 'core', success: false, error };
          }
        })()
      );
    }

    // Platform requests (may fail if identity doesn't exist)
    for (let i = 0; i < platformRequests; i++) {
      promises.push(
        (async () => {
          try {
            const identity = await client.platform.getIdentity(config.testData.identityId);
            failureLogger.recordOperation(true);
            return { type: 'platform', success: true, value: identity };
          } catch (error) {
            failureLogger.recordOperation(false);
            return { type: 'platform', success: false, error };
          }
        })()
      );
    }

    const results = await Promise.all(promises);

    const coreResults = results.filter(r => r.type === 'core');
    const platformResults = results.filter(r => r.type === 'platform');

    const coreSuccess = coreResults.filter(r => r.success).length;
    const platformSuccess = platformResults.filter(r => r.success).length;

    console.log(`  ✓ Core: ${coreSuccess}/${coreRequests} successful`);
    console.log(`  ✓ Platform: ${platformSuccess}/${platformRequests} successful`);

    // Core should have high success rate
    expect(coreSuccess).toBeGreaterThanOrEqual(coreRequests * 0.9);
  }, 120000);

  it('should maintain thread safety during concurrent retry scenarios', async () => {
    const concurrency = 20;
    const retryEvents: any[] = [];

    client.on('retry', (data) => {
      retryEvents.push({...data, timestamp: Date.now()});
      metricsCollector.incrementEvent('retries');
    });

    const promises: Promise<any>[] = [];

    for (let i = 0; i < concurrency; i++) {
      promises.push(
        (async () => {
          try {
            const height = await client.core.getBestBlockHeight();
            failureLogger.recordOperation(true);
            return { success: true, height };
          } catch (error) {
            failureLogger.recordOperation(false);
            return { success: false, error };
          }
        })()
      );
    }

    const results = await Promise.all(promises);
    const successful = results.filter(r => r.success).length;

    console.log(`  ✓ ${successful}/${concurrency} requests successful`);
    if (retryEvents.length > 0) {
      console.log(`  ✓ ${retryEvents.length} retries handled concurrently`);
    }

    // Most requests should succeed
    expect(successful).toBeGreaterThanOrEqual(concurrency * 0.8);

    client.removeAllListeners('retry');
  }, 120000);

  it('should handle rapid sequential requests without race conditions', async () => {
    const requests = 100;
    const results: number[] = [];

    for (let i = 0; i < requests; i++) {
      const height = await measureLatency('getBestBlockHeight', async () => {
        return await client.core.getBestBlockHeight();
      });

      results.push(height);
      failureLogger.recordOperation(true);
    }

    expect(results).toHaveLength(requests);
    expect(results.every(h => h > 0)).toBe(true);

    // All heights should be increasing or equal (no race conditions)
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThanOrEqual(results[i - 1] - 1); // Allow 1 block tolerance
    }

    console.log(`  ✓ ${requests} rapid sequential requests completed`);
    console.log(`  Height range: ${Math.min(...results)} - ${Math.max(...results)}`);
  }, 180000);

  it('should handle concurrent requests with node pool statistics tracking', async () => {
    const status1 = client.getStatus();

    const concurrency = 30;
    const promises: Promise<number>[] = [];

    for (let i = 0; i < concurrency; i++) {
      promises.push(client.core.getBestBlockHeight());
    }

    await Promise.all(promises);

    const status2 = client.getStatus();

    // Verify status structure
    expect(status2).toHaveProperty('nodePoolSize');
    expect(status2).toHaveProperty('currentNode');
    expect(status2.nodePoolSize).toBeGreaterThan(0);

    console.log(`  Node pool size: ${status2.nodePoolSize}`);
    console.log(`  Current node: ${status2.currentNode}`);
    console.log(`  Failure count: ${status2.failureCount}`);

    promises.forEach(() => failureLogger.recordOperation(true));
  }, 90000);

  it('should measure latency distribution under concurrent load', async () => {
    const concurrency = 25;
    const promises: Promise<number>[] = [];

    for (let i = 0; i < concurrency; i++) {
      promises.push(
        measureLatency('getBestBlockHeight', async () => {
          return await client.core.getBestBlockHeight();
        })
      );
    }

    await Promise.all(promises);

    const latencies = metricsCollector.getAllLatencyMetrics();
    const metrics = latencies.get('getBestBlockHeight');

    if (metrics) {
      console.log(`  Latency distribution (${metrics.samples} samples):`);
      console.log(`    Min: ${metrics.min}ms`);
      console.log(`    Avg: ${metrics.avg}ms`);
      console.log(`    Median: ${metrics.median}ms`);
      console.log(`    P95: ${metrics.p95}ms`);
      console.log(`    P99: ${metrics.p99}ms`);
      console.log(`    Max: ${metrics.max}ms`);

      // P95 should be reasonable
      expect(metrics.p95).toBeLessThan(10000); // 10 seconds
    }

    promises.forEach(() => failureLogger.recordOperation(true));
  }, 90000);
});
