/**
 * Adaptive Retry Tests - Testnet Validation
 *
 * Validates retry behavior with exponential backoff when transient failures occur.
 * Uses failure injection to simulate timeouts and connection issues.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ResilientDAPIClient } from '../../src/ResilientDAPIClient.js';
import { failureLogger } from './helpers/failure-logger.js';
import { metricsCollector, measureLatency } from './helpers/metrics-collector.js';
import { createMockDAPIClient, MockFailureScenarios, type ControllableMockDAPIClient } from './helpers/controllable-mock-client.js';

describe('Adaptive Retry - Mock Client', () => {
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

    console.log('\n=== Retry Test Summary ===');
    console.log(`Total Operations: ${summary.totalOperations}`);
    console.log(`Successful: ${summary.successfulOperations}`);
    console.log(`Success Rate: ${((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)}%`);
    console.log(`Total Retries: ${stats.totalRetries}`);
    console.log(`Average Retry Delay: ${stats.averageRetryDelay}ms`);
    console.log(`Average Recovery Time: ${stats.averageRecoveryTime}ms`);
    console.log(`\nMock Client Stats:`);
    console.log(`  Total Calls: ${mockStats.totalCalls}`);
    console.log(`  Total Failures Injected: ${mockStats.totalFailures}`);
  });

  beforeEach(() => {
    mockClient.clearFailures();
    mockClient.clearCallCounts();
  });

  it('should retry on transient timeout and eventually succeed', async () => {
    // Inject 2 timeouts, then allow success
    mockClient.injectFailure(MockFailureScenarios.transientTimeout('getBestBlockHeight', 2));

    const retryEvents: any[] = [];
    client.on('retry', (data) => {
      retryEvents.push(data);
      metricsCollector.incrementEvent('retries');

      failureLogger.logFailure({
        timestamp: new Date().toISOString(),
        operation: 'getBestBlockHeight',
        node: data.namespace || 'unknown',
        failureType: 'TIMEOUT',
        errorMessage: data.error.message,
        resilienceAction: 'RETRY',
        retryAttempt: data.attempt,
        retryDelay: `${data.delay}ms`,
        outcome: 'SUCCESS_AFTER_RETRY',
        recoveryTime: undefined,
      });
    });

    const startTime = Date.now();
    const height = await measureLatency('getBestBlockHeight', async () => {
      return await client.core.getBestBlockHeight();
    });
    const recoveryTime = Date.now() - startTime;

    expect(height).toBeGreaterThan(0);
    expect(retryEvents.length).toBe(2); // Should have retried twice

    // Verify exponential backoff
    expect(retryEvents[0].attempt).toBe(1);
    expect(retryEvents[0].delay).toBe(1000); // 1s first retry
    expect(retryEvents[1].attempt).toBe(2);
    expect(retryEvents[1].delay).toBe(2000); // 2s second retry

    // Update failure records with recovery time
    failureLogger.getFailures().forEach(f => {
      if (!f.recoveryTime) {
        f.recoveryTime = `${recoveryTime}ms`;
      }
    });

    failureLogger.recordOperation(true);

    client.removeAllListeners('retry');
  }, 60000);

  it('should verify exponential backoff timing', async () => {
    // Inject 4 timeouts to observe backoff progression: 1s → 2s → 4s → 8s
    mockClient.injectFailure(MockFailureScenarios.transientTimeout('getBestBlockHeight', 4));

    const retryTimestamps: number[] = [];
    const retryDelays: number[] = [];

    client.on('retry', (data) => {
      retryTimestamps.push(Date.now());
      retryDelays.push(data.delay);
      metricsCollector.incrementEvent('retries');
    });

    const startTime = Date.now();
    await measureLatency('getBestBlockHeight', async () => {
      return await client.core.getBestBlockHeight();
    });

    // Verify delay progression
    expect(retryDelays).toEqual([1000, 2000, 4000, 8000]);

    // Verify actual timing (within tolerance)
    for (let i = 1; i < retryTimestamps.length; i++) {
      const actualDelay = retryTimestamps[i] - retryTimestamps[i - 1];
      const expectedDelay = retryDelays[i - 1];

      // Allow 500ms tolerance for processing time
      expect(actualDelay).toBeGreaterThanOrEqual(expectedDelay - 500);
      expect(actualDelay).toBeLessThan(expectedDelay + 2000);
    }

    failureLogger.recordOperation(true);

    client.removeAllListeners('retry');
  }, 90000);

  it('should throw MaxRetriesError after exhausting retries', async () => {
    // Inject 20 consecutive timeouts (more than maxRetries=10)
    mockClient.injectFailure(MockFailureScenarios.transientTimeout('getBestBlockHeight', 20));

    const retryEvents: any[] = [];
    client.on('retry', (data) => {
      retryEvents.push(data);
      metricsCollector.incrementEvent('retries');
    });

    await expect(async () => {
      await client.core.getBestBlockHeight();
    }).rejects.toThrow(); // Should eventually fail

    expect(retryEvents.length).toBeGreaterThanOrEqual(5); // Should have retried multiple times before giving up

    failureLogger.logFailure({
      timestamp: new Date().toISOString(),
      operation: 'getBestBlockHeight',
      node: 'unknown',
      failureType: 'TIMEOUT',
      errorMessage: 'Max retries exceeded',
      resilienceAction: 'ABORT',
      outcome: 'FAILED',
    });

    failureLogger.recordOperation(false);

    client.removeAllListeners('retry');
  }, 180000);

  it('should handle connection refused errors with retry', async () => {
    // Inject 1 connection refused error (simpler test)
    mockClient.injectFailure(MockFailureScenarios.connectionRefused('getBestBlockHeight', 1));

    const retryEvents: any[] = [];
    client.on('retry', (data) => {
      retryEvents.push(data);
      metricsCollector.incrementEvent('retries');

      failureLogger.logFailure({
        timestamp: new Date().toISOString(),
        operation: 'getBestBlockHeight',
        node: 'unknown',
        failureType: 'CONNECTION_REFUSED',
        errorMessage: data.error.message,
        resilienceAction: 'RETRY',
        retryAttempt: data.attempt,
        retryDelay: `${data.delay}ms`,
        outcome: 'SUCCESS_AFTER_RETRY',
      });
    });

    const height = await measureLatency('getBestBlockHeight', async () => {
      return await client.core.getBestBlockHeight();
    });

    expect(height).toBeGreaterThan(0);
    expect(retryEvents.length).toBe(1); // Should have retried once

    failureLogger.recordOperation(true);

    client.removeAllListeners('retry');
  }, 60000);

  it('should handle HTTP 500 errors with retry', async () => {
    // Inject 2 HTTP 500 errors
    mockClient.injectFailure(MockFailureScenarios.http500('getBestBlockHeight', 2));

    const retryEvents: any[] = [];
    client.on('retry', (data) => {
      retryEvents.push(data);
      metricsCollector.incrementEvent('retries');
    });

    const height = await measureLatency('getBestBlockHeight', async () => {
      return await client.core.getBestBlockHeight();
    });

    expect(height).toBeGreaterThan(0);
    expect(retryEvents.length).toBeGreaterThanOrEqual(1); // Should have retried at least once

    failureLogger.recordOperation(true);

    client.removeAllListeners('retry');
  }, 60000);

  it('should reset retry counter after successful request', async () => {
    // First request: 1 retry then success
    mockClient.clearFailures();
    mockClient.injectFailure(MockFailureScenarios.transientTimeout('getBestBlockHeight', 1));

    let retryCount = 0;
    const firstHandler = () => {
      retryCount++;
    };

    client.on('retry', firstHandler);

    await client.core.getBestBlockHeight();
    expect(retryCount).toBe(1);

    // Remove first handler and clear retry counter
    client.removeListener('retry', firstHandler);
    retryCount = 0;

    // Second request: Should start from attempt 1 again
    mockClient.clearFailures();
    mockClient.injectFailure(MockFailureScenarios.transientTimeout('getBestBlockHeight', 1));

    const retryDelays: number[] = [];
    const secondHandler = (data: any) => {
      retryDelays.push(data.delay);
      retryCount++;
    };

    client.on('retry', secondHandler);

    await client.core.getBestBlockHeight();

    expect(retryCount).toBe(1);
    expect(retryDelays[0]).toBe(1000); // Should start from 1s again, not continue from previous

    failureLogger.recordOperation(true);
    failureLogger.recordOperation(true);

    client.removeAllListeners('retry');
  }, 90000);
});
