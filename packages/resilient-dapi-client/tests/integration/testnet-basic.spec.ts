/**
 * Basic Connectivity Tests - Testnet Validation
 *
 * Validates basic connectivity to testnet DAPI nodes and ensures
 * the resilient client can successfully perform simple operations.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ResilientDAPIClient } from '../../src/ResilientDAPIClient.js';
import { getTestnetConfig, printConfig } from './helpers/testnet-config.js';
import { failureLogger } from './helpers/failure-logger.js';
import { metricsCollector, measureLatency } from './helpers/metrics-collector.js';

describe('Basic Connectivity - Testnet', () => {
  let client: ResilientDAPIClient;
  let config: ReturnType<typeof getTestnetConfig>;

  beforeAll(() => {
    config = getTestnetConfig();
    printConfig(config);

    client = new ResilientDAPIClient({
      network: 'testnet',
      dapiAddresses: config.dapiAddresses,
      timeout: config.timeout.normal,
      retries: 0, // Disable DAPI client retries, use ResilientDAPIClient's
      maxRetryAttempts: 10,
      retryBaseDelay: 1000,
      maxRetryDelay: 30000,
      nodeRetryDelay: 300000, // 5 minutes
      logLevel: 'info',
    });

    failureLogger.startTestRun();
    metricsCollector.start();
  });

  afterAll(() => {
    metricsCollector.stop();

    const summary = failureLogger.getSummary();
    const stats = failureLogger.getStatistics();
    const latencies = metricsCollector.getAllLatencyMetrics();

    console.log('\n=== Test Run Summary ===');
    console.log(`Duration: ${summary.duration}`);
    console.log(`Total Operations: ${summary.totalOperations}`);
    console.log(`Successful: ${summary.successfulOperations}`);
    console.log(`Failed: ${summary.failedOperations}`);
    console.log(`Success Rate: ${((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)}%`);

    console.log('\n=== Resilience Statistics ===');
    console.log(`Total Retries: ${stats.totalRetries}`);
    console.log(`Total Failovers: ${stats.totalFailovers}`);
    console.log(`Average Recovery Time: ${stats.averageRecoveryTime}`);

    console.log('\n=== Latency Metrics ===');
    for (const [operation, metrics] of latencies) {
      console.log(`${operation}:`);
      console.log(`  Min: ${metrics.min}ms, Max: ${metrics.max}ms, Avg: ${metrics.avg}ms`);
      console.log(`  P95: ${metrics.p95}ms, P99: ${metrics.p99}ms`);
    }
  });

  it('should connect to testnet successfully', async () => {
    const height = await measureLatency('getBestBlockHeight', async () => {
      return await client.core.getBestBlockHeight();
    });

    expect(height).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(500000); // Testnet is well past this block

    failureLogger.recordOperation(true);
  }, 30000);

  it('should return valid status information', async () => {
    const status = client.getStatus();

    expect(status).toBeDefined();
    expect(status).toHaveProperty('coreAvailable');
    expect(status).toHaveProperty('platformAvailable');
    expect(status).toHaveProperty('currentNode');
    expect(status).toHaveProperty('nodePoolSize');
    expect(status).toHaveProperty('failureCount');
    expect(status.coreAvailable).toBe(true);
    expect(status.platformAvailable).toBe(true);

    failureLogger.recordOperation(true);
  });

  it('should have event emitter capabilities', async () => {
    const events: string[] = [];

    client.on('retry', (data) => {
      events.push('retry');
      metricsCollector.incrementEvent('retries');
    });

    client.on('failover', (data) => {
      events.push('failover');
      metricsCollector.incrementEvent('failovers');
    });

    client.on('degradation', (data) => {
      events.push('degradation');
      metricsCollector.incrementEvent('degradations');
    });

    // Perform operation (may or may not emit events)
    await client.core.getBestBlockHeight();

    // Just verify event listeners are working
    expect(client.listenerCount('retry')).toBeGreaterThanOrEqual(1);
    expect(client.listenerCount('failover')).toBeGreaterThanOrEqual(1);
    expect(client.listenerCount('degradation')).toBeGreaterThanOrEqual(1);

    failureLogger.recordOperation(true);
  }, 30000);

  it('should successfully fetch block by height', async () => {
    // First get current height
    const currentHeight = await client.core.getBestBlockHeight();

    // Fetch a recent block
    const blockHeight = currentHeight - 10;
    const block = await measureLatency('getBlockByHeight', async () => {
      return await client.core.getBlockByHeight(blockHeight);
    });

    expect(block).toBeDefined();
    // Block is returned as a Buffer from the DAPI client
    expect(Buffer.isBuffer(block)).toBe(true);
    expect(block.length).toBeGreaterThan(0);

    failureLogger.recordOperation(true);
  }, 30000);

  it('should handle multiple sequential requests', async () => {
    const requests = 10;
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

    // All heights should be close to each other (within a few blocks)
    const maxDiff = Math.max(...results) - Math.min(...results);
    expect(maxDiff).toBeLessThan(10);
  }, 60000);

  it('should maintain consistent block height across requests', async () => {
    const height1 = await client.core.getBestBlockHeight();
    await new Promise(resolve => setTimeout(resolve, 1000));
    const height2 = await client.core.getBestBlockHeight();
    await new Promise(resolve => setTimeout(resolve, 1000));
    const height3 = await client.core.getBestBlockHeight();

    expect(height1).toBeGreaterThan(0);
    expect(height2).toBeGreaterThanOrEqual(height1);
    expect(height3).toBeGreaterThanOrEqual(height2);

    // Heights should be within reasonable range (< 10 blocks in ~2 seconds)
    expect(height3 - height1).toBeLessThan(10);

    failureLogger.recordOperation(true);
    failureLogger.recordOperation(true);
    failureLogger.recordOperation(true);
  }, 10000);

  it('should report successful operations in statistics', () => {
    const summary = failureLogger.getSummary();

    expect(summary.totalOperations).toBeGreaterThan(0);
    expect(summary.successfulOperations).toBeGreaterThan(0);

    const successRate = (summary.successfulOperations / summary.totalOperations) * 100;
    expect(successRate).toBeGreaterThan(90); // At least 90% success rate
  });
});
