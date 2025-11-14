/**
 * Core Operations Tests - Mock Client
 *
 * Validates core DAPI operations (blockchain queries) with resilience features.
 * Tests retry behavior and error handling for core blockchain operations.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ResilientDAPIClient } from '../../src/ResilientDAPIClient.js';
import { failureLogger } from './helpers/failure-logger.js';
import { metricsCollector, measureLatency } from './helpers/metrics-collector.js';
import { createMockDAPIClient, MockFailureScenarios, type ControllableMockDAPIClient } from './helpers/controllable-mock-client.js';

describe('Core Operations - Mock Client', () => {
  let client: ResilientDAPIClient;
  let mockClient: ControllableMockDAPIClient;

  beforeAll(() => {
    mockClient = createMockDAPIClient();

    client = new ResilientDAPIClient(mockClient as any, {
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
    client.destroy();

    const summary = failureLogger.getSummary();
    const latencies = metricsCollector.getAllLatencyMetrics();

    console.log('\n=== Core Operations Test Summary ===');
    console.log(`Total Operations: ${summary.totalOperations}`);
    console.log(`Successful: ${summary.successfulOperations}`);
    console.log(`Success Rate: ${((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)}%`);

    console.log('\n=== Operation Latencies ===');
    for (const [operation, metrics] of latencies) {
      console.log(`${operation}: avg=${metrics.avg}ms, p95=${metrics.p95}ms, p99=${metrics.p99}ms`);
    }
  });

  beforeEach(() => {
    mockClient.clearFailures();
    mockClient.clearCallCounts();
  });

  it('should get best block height successfully', async () => {
    const height = await measureLatency('getBestBlockHeight', async () => {
      return await client.core.getBestBlockHeight();
    });

    expect(height).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(500000); // Mock returns 2000000

    console.log(`  Current block height: ${height}`);

    failureLogger.recordOperation(true);
  }, 30000);

  it('should get best block height with retry on timeout', async () => {
    // Inject 2 timeouts
    mockClient.injectFailure(MockFailureScenarios.transientTimeout('getBestBlockHeight', 2));

    const retryEvents: any[] = [];
    client.on('retry', (data) => {
      retryEvents.push(data);
      metricsCollector.incrementEvent('retries');
    });

    const height = await measureLatency('getBestBlockHeight', async () => {
      return await client.core.getBestBlockHeight();
    });

    expect(height).toBeGreaterThan(0);
    expect(retryEvents.length).toBe(2);

    console.log(`  ✓ Succeeded after ${retryEvents.length} retries`);

    failureLogger.recordOperation(true);

    client.removeAllListeners('retry');
  }, 30000);

  it('should get block by height successfully', async () => {
    const currentHeight = await client.core.getBestBlockHeight();
    const targetHeight = currentHeight - 10;

    const block = await measureLatency('getBlockByHeight', async () => {
      return await client.core.getBlockByHeight(targetHeight);
    });

    expect(block).toBeDefined();

    console.log(`  Block at height ${targetHeight} retrieved successfully`);

    failureLogger.recordOperation(true);
  }, 30000);

  it('should get block by height with retry on failure', async () => {
    // Inject 1 failure
    mockClient.injectFailure(MockFailureScenarios.http500('getBlockByHeight', 1));

    const retryEvents: any[] = [];
    client.on('retry', (data) => {
      retryEvents.push(data);
    });

    const currentHeight = await client.core.getBestBlockHeight();
    const block = await measureLatency('getBlockByHeight', async () => {
      return await client.core.getBlockByHeight(currentHeight - 10);
    });

    expect(block).toBeDefined();
    expect(retryEvents.length).toBeGreaterThanOrEqual(1);

    console.log(`  ✓ Recovered from failure via retry`);

    failureLogger.recordOperation(true);

    client.removeAllListeners('retry');
  }, 30000);

  it('should get resilient status successfully', async () => {
    const status = client.getStatus();

    expect(status).toBeDefined();
    expect(status.coreAvailable).toBeDefined();
    expect(status.platformAvailable).toBeDefined();
    expect(status.nodePool).toBeDefined();

    console.log(`  Status: core=${status.coreAvailable}, platform=${status.platformAvailable}`);

    failureLogger.recordOperation(true);
  }, 30000);

  it('should handle multiple sequential block queries', async () => {
    const operations = 5;
    const results: number[] = [];

    for (let i = 0; i < operations; i++) {
      const height = await client.core.getBestBlockHeight();
      results.push(height);
      metricsCollector.incrementEvent('sequential-queries');
    }

    expect(results.length).toBe(operations);
    results.forEach(height => {
      expect(height).toBeGreaterThan(0);
    });

    // Heights should be relatively consistent
    const minHeight = Math.min(...results);
    const maxHeight = Math.max(...results);
    expect(maxHeight - minHeight).toBeLessThan(10);

    console.log(`  ✓ ${operations} sequential queries: ${minHeight}-${maxHeight}`);

    failureLogger.recordOperation(true);
  }, 60000);

  it('should measure operation latencies', () => {
    const latencies = metricsCollector.getAllLatencyMetrics();

    expect(latencies.size).toBeGreaterThan(0);

    for (const [operation, metrics] of latencies) {
      if (metrics.count > 0) {
        expect(metrics.avg).toBeGreaterThanOrEqual(0);
        expect(metrics.min).toBeGreaterThanOrEqual(0);
        expect(metrics.max).toBeGreaterThanOrEqual(0);

        console.log(`  ${operation}: ${metrics.count} calls, avg=${metrics.avg}ms`);
      }
    }

    failureLogger.recordOperation(true);
  });
});
