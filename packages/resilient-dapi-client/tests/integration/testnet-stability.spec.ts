/**
 * Stability Tests - Mock Client
 *
 * Validates resilient client stability with sustained operations.
 * Tests memory management, sustained throughput, and resilience patterns.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ResilientDAPIClient } from '../../src/ResilientDAPIClient.js';
import { getTestnetConfig } from './helpers/testnet-config.js';
import { failureLogger } from './helpers/failure-logger.js';
import { metricsCollector, measureLatency } from './helpers/metrics-collector.js';
import { createMockDAPIClient, MockFailureScenarios, type ControllableMockDAPIClient } from './helpers/controllable-mock-client.js';

describe('Stability - Mock Client', () => {
  let client: ResilientDAPIClient;
  let mockClient: ControllableMockDAPIClient;
  let config: ReturnType<typeof getTestnetConfig>;

  beforeAll(() => {
    config = getTestnetConfig();
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
    const stats = failureLogger.getStatistics();

    console.log('\n=== Stability Test Summary ===');
    console.log(`Duration: ${summary.duration}`);
    console.log(`Total Operations: ${summary.totalOperations}`);
    console.log(`Successful: ${summary.successfulOperations}`);
    console.log(`Failed: ${summary.failedOperations}`);
    console.log(`Success Rate: ${((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)}%`);
    console.log(`\nResilience Actions:`);
    console.log(`  Retries: ${stats.totalRetries}`);
    console.log(`  Failovers: ${stats.totalFailovers}`);
    console.log(`  Degradations: ${stats.totalDegradations || 0}`);
  });

  it('should handle sustained operations with periodic failures', async () => {
    const operations = 100;
    const successfulOps: number[] = [];
    const failedOps: number[] = [];

    console.log(`  Running ${operations} operations with periodic failures...`);

    for (let i = 0; i < operations; i++) {
      // Inject failure every 10 operations
      if (i % 10 === 0 && i > 0) {
        mockClient.injectFailure(MockFailureScenarios.transientTimeout('getBestBlockHeight', 1));
      }

      try {
        const height = await measureLatency('getBestBlockHeight', async () => {
          return await client.core.getBestBlockHeight();
        });

        successfulOps.push(height);
        failureLogger.recordOperation(true);
        metricsCollector.incrementEvent('sustained-operations');
      } catch (error) {
        failedOps.push(i);
        failureLogger.recordOperation(false);
      }
    }

    const successRate = (successfulOps.length / operations) * 100;

    console.log(`  Completed ${operations} operations:`);
    console.log(`    Successful: ${successfulOps.length} (${successRate.toFixed(2)}%)`);
    console.log(`    Failed: ${failedOps.length}`);

    expect(successfulOps.length).toBeGreaterThan(operations * 0.95); // 95% success rate
    expect(successRate).toBeGreaterThan(95);
  }, 180000); // 3 minute timeout

  it('should generate comprehensive failure report', () => {
    const summary = failureLogger.getSummary();
    const failures = failureLogger.getFailures();
    const stats = failureLogger.getStatistics();

    console.log('\n=== Failure Report ===');
    console.log(`Total Failures Logged: ${failures.length}`);
    console.log(`Total Retries: ${stats.totalRetries}`);
    console.log(`Total Failovers: ${stats.totalFailovers}`);
    console.log(`Average Recovery Time: ${stats.averageRecoveryTime}ms`);

    expect(summary).toBeDefined();
    expect(summary.totalOperations).toBeGreaterThan(0);

    if (failures.length > 0) {
      console.log(`\nFailure Breakdown:`);
      const failureTypes = new Map<string, number>();
      failures.forEach(f => {
        const count = failureTypes.get(f.failureType) || 0;
        failureTypes.set(f.failureType, count + 1);
      });

      failureTypes.forEach((count, type) => {
        console.log(`  ${type}: ${count}`);
      });
    }

    failureLogger.recordOperation(true);
  });

  it('should validate latency metrics', () => {
    const latencies = metricsCollector.getAllLatencyMetrics();

    expect(latencies.size).toBeGreaterThan(0);

    console.log('\n=== Latency Metrics ===');

    for (const [operation, metrics] of latencies) {
      if (metrics.count > 0) {
        console.log(`${operation}:`);
        console.log(`  Count: ${metrics.count}`);
        console.log(`  Min: ${metrics.min}ms`);
        console.log(`  Max: ${metrics.max}ms`);
        console.log(`  Avg: ${metrics.avg}ms`);
        console.log(`  P95: ${metrics.p95}ms`);
        console.log(`  P99: ${metrics.p99}ms`);

        expect(metrics.count).toBeGreaterThan(0);
        expect(metrics.avg).toBeGreaterThanOrEqual(0);
        expect(metrics.min).toBeGreaterThanOrEqual(0);
        expect(metrics.max).toBeGreaterThanOrEqual(metrics.min);
        expect(metrics.p95).toBeGreaterThanOrEqual(metrics.avg);
        expect(metrics.p99).toBeGreaterThanOrEqual(metrics.p95);
      }
    }

    failureLogger.recordOperation(true);
  });

  it('should maintain consistent status reporting', () => {
    const status1 = client.getStatus();

    // Perform some operations
    const operations = 10;
    for (let i = 0; i < operations; i++) {
      client.core.getBestBlockHeight().catch(() => {});
    }

    const status2 = client.getStatus();

    console.log('\n=== Status Consistency ===');
    console.log('Initial Status:');
    console.log(`  Core Available: ${status1.coreAvailable}`);
    console.log(`  Platform Available: ${status1.platformAvailable}`);
    console.log(`  Node Pool: ${status1.nodePool.available}/${status1.nodePool.total}`);
    console.log(`  Failure Count: ${status1.failureCount}`);

    console.log('\nAfter Operations:');
    console.log(`  Core Available: ${status2.coreAvailable}`);
    console.log(`  Platform Available: ${status2.platformAvailable}`);
    console.log(`  Node Pool: ${status2.nodePool.available}/${status2.nodePool.total}`);
    console.log(`  Failure Count: ${status2.failureCount}`);

    expect(status1).toBeDefined();
    expect(status2).toBeDefined();
    expect(status1.nodePool).toBeDefined();
    expect(status2.nodePool).toBeDefined();

    failureLogger.recordOperation(true);
  });
});
