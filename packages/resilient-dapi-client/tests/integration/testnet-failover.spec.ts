/**
 * Node Failover Tests - Mock Client
 *
 * Validates node pool status tracking and statistics.
 * Note: Full failover testing requires multi-node mock support (future enhancement).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ResilientDAPIClient } from '../../src/ResilientDAPIClient.js';
import { failureLogger } from './helpers/failure-logger.js';
import { metricsCollector } from './helpers/metrics-collector.js';
import { createMockDAPIClient, type ControllableMockDAPIClient } from './helpers/controllable-mock-client.js';

describe('Node Failover - Mock Client', () => {
  let client: ResilientDAPIClient;
  let mockClient: ControllableMockDAPIClient;

  beforeAll(() => {
    mockClient = createMockDAPIClient();

    client = new ResilientDAPIClient(mockClient as any, {
      maxRetryAttempts: 10,
      retryBaseDelay: 1000,
      maxRetryDelay: 30000,
      nodeRetryDelay: 5000,
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

    console.log('\n=== Failover Test Summary ===');
    console.log(`Total Operations: ${summary.totalOperations}`);
    console.log(`Successful: ${summary.successfulOperations}`);
    console.log(`Success Rate: ${((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)}%`);
    console.log(`Total Failovers: ${stats.totalFailovers}`);
    console.log(`Nodes Blacklisted: ${stats.nodesBlacklisted}`);
    console.log(`Average Recovery Time: ${stats.averageRecoveryTime}ms`);
  });

  beforeEach(() => {
    mockClient.clearFailures();
    mockClient.clearCallCounts();
  });

  it('should maintain node pool statistics in status', async () => {
    const status = client.getStatus();

    expect(status.nodePool).toBeDefined();
    expect(status.nodePool).toHaveProperty('total');
    expect(status.nodePool).toHaveProperty('available');
    expect(status.nodePool).toHaveProperty('blacklisted');

    expect(status.nodePool.total).toBeGreaterThanOrEqual(0);
    expect(status.nodePool.available).toBeGreaterThanOrEqual(0);
    expect(status.nodePool.blacklisted).toBeGreaterThanOrEqual(0);

    // Available + blacklisted should equal total
    expect(status.nodePool.available + status.nodePool.blacklisted).toBe(status.nodePool.total);

    console.log(`  Node Pool: ${status.nodePool.available}/${status.nodePool.total} available, ${status.nodePool.blacklisted} blacklisted`);

    failureLogger.recordOperation(true);
  });

  it('should track core and platform availability', async () => {
    const status = client.getStatus();

    expect(status).toHaveProperty('coreAvailable');
    expect(status).toHaveProperty('platformAvailable');
    expect(status).toHaveProperty('currentNode');
    expect(status).toHaveProperty('nodePoolSize');
    expect(status).toHaveProperty('failureCount');

    console.log(`  Status:`);
    console.log(`    Core: ${status.coreAvailable ? 'Available' : 'Unavailable'}`);
    console.log(`    Platform: ${status.platformAvailable ? 'Available' : 'Unavailable'}`);
    console.log(`    Current Node: ${status.currentNode || 'N/A'}`);
    console.log(`    Pool Size: ${status.nodePoolSize}`);
    console.log(`    Failure Count: ${status.failureCount}`);

    failureLogger.recordOperation(true);
  });

  it('should handle successful requests without failover', async () => {
    const height = await client.core.getBestBlockHeight();

    expect(height).toBeGreaterThan(0);

    const status = client.getStatus();
    expect(status.coreAvailable).toBe(true);

    failureLogger.recordOperation(true);
  });
});
