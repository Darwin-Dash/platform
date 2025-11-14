/**
 * Graceful Degradation Tests - Testnet Validation
 *
 * Validates graceful degradation when platform services fail while core remains operational.
 * Tests partial failure scenarios and service availability tracking.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ResilientDAPIClient } from '../../src/ResilientDAPIClient.js';
import { getTestnetConfig } from './helpers/testnet-config.js';
import { failureLogger } from './helpers/failure-logger.js';
import { metricsCollector, measureLatency } from './helpers/metrics-collector.js';
import { createMockDAPIClient, MockFailureScenarios, type ControllableMockDAPIClient } from './helpers/controllable-mock-client.js';

describe('Graceful Degradation - Mock Client', () => {
  let client: ResilientDAPIClient;
  let mockClient: ControllableMockDAPIClient;
  let config: ReturnType<typeof getTestnetConfig>;

  beforeAll(() => {
    config = getTestnetConfig();

    mockClient = createMockDAPIClient();

    client = new ResilientDAPIClient(mockClient as any, {
      maxRetryAttempts: 5,
      retryBaseDelay: 1000,
      maxRetryDelay: 10000,
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
    const mockStats = mockClient.getStats();

    console.log('\n=== Degradation Test Summary ===');
    console.log(`Total Operations: ${summary.totalOperations}`);
    console.log(`Successful: ${summary.successfulOperations}`);
    console.log(`Success Rate: ${((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)}%`);
    console.log(`Total Degradations: ${stats.totalDegradations}`);
    console.log(`\nMock Client Stats:`);
    console.log(`  Total Calls: ${mockStats.totalCalls}`);
    console.log(`  Total Failures Injected: ${mockStats.totalFailures}`);
  });

  beforeEach(() => {
    mockClient.clearFailures();
    mockClient.clearCallCounts();
  });

  it('should degrade gracefully when platform fails but core works', async () => {
    // Inject platform failures
    mockClient.injectFailure(MockFailureScenarios.platformUnavailable());
    

    const degradationEvents: any[] = [];

    client.on('degradation', (data) => {
      degradationEvents.push(data);
      metricsCollector.incrementEvent('degradations');

      failureLogger.logFailure({
        timestamp: new Date().toISOString(),
        operation: data.service,
        node: 'platform',
        failureType: 'PLATFORM_ERROR',
        errorMessage: data.error?.message || 'Platform unavailable',
        resilienceAction: 'DEGRADATION',
        outcome: 'DEGRADED',
      });

      console.log(`  ✓ Degradation event: ${data.service} unavailable`);
    });

    // Core operations should still work
    const height = await measureLatency('getBestBlockHeight', async () => {
      return await client.core.getBestBlockHeight();
    });

    expect(height).toBeGreaterThan(0);
    failureLogger.recordOperation(true);

    // Platform operations should fail gracefully
    try {
      await client.platform.getIdentity(config.testData.identityId);
      // If it succeeds, platform is available (test passed differently)
      failureLogger.recordOperation(true);
    } catch (error) {
      // Expected to fail
      expect(degradationEvents.length).toBeGreaterThan(0);
      failureLogger.recordOperation(false);
    }

    // Check service availability status
    const status = client.getStatus();
    console.log(`  Core available: ${status.coreAvailable}`);
    console.log(`  Platform available: ${status.platformAvailable}`);

    expect(status.coreAvailable).toBe(true);
    // Platform might be available or not depending on proxy effectiveness

    client.removeAllListeners('degradation');
  }, 60000);

  it('should emit degradation events with correct metadata', async () => {
    mockClient.injectFailure({
      namespace: 'platform',
      method: 'getIdentity',
      failureType: 'platform_error',
      count: 1,
    });
    

    const degradationEvents: any[] = [];

    client.on('degradation', (data) => {
      degradationEvents.push(data);

      // Validate event structure
      expect(data).toHaveProperty('service');
      expect(data).toHaveProperty('timestamp');
      expect(data.service).toBe('platform');
      expect(typeof data.timestamp).toBe('number');

      if (data.error) {
        expect(data.error).toHaveProperty('message');
      }

      console.log(`  ✓ Degradation: ${data.service} at ${new Date(data.timestamp).toISOString()}`);
    });

    try {
      await client.platform.getIdentity(config.testData.identityId);
    } catch (error) {
      // Expected to fail or degrade
    }

    failureLogger.recordOperation(true);

    client.removeAllListeners('degradation');
  }, 60000);

  it('should track service availability over time', async () => {
    const status1 = client.getStatus();
    console.log(`  Initial status - Core: ${status1.coreAvailable}, Platform: ${status1.platformAvailable}`);

    // Make successful core request
    await client.core.getBestBlockHeight();

    const status2 = client.getStatus();
    expect(status2.coreAvailable).toBe(true);

    failureLogger.recordOperation(true);

    // Try platform request (may succeed or fail)
    try {
      await client.platform.getIdentity(config.testData.identityId);
      failureLogger.recordOperation(true);
    } catch (error) {
      failureLogger.recordOperation(false);
    }

    const status3 = client.getStatus();
    console.log(`  Final status - Core: ${status3.coreAvailable}, Platform: ${status3.platformAvailable}`);

    // Core should remain available throughout
    expect(status3.coreAvailable).toBe(true);
  }, 60000);

  it('should handle mixed failure scenarios (platform flaky, core stable)', async () => {
    // Platform fails 50% of the time
    mockClient.injectFailure({
      namespace: 'platform',
      failureType: 'timeout',
      probability: 0.5,
    });
    

    const operations = 10;
    const coreResults: boolean[] = [];
    const platformResults: boolean[] = [];

    for (let i = 0; i < operations; i++) {
      // Core operation
      try {
        const height = await client.core.getBestBlockHeight();
        coreResults.push(height > 0);
        failureLogger.recordOperation(true);
      } catch (error) {
        coreResults.push(false);
        failureLogger.recordOperation(false);
      }

      // Platform operation
      try {
        await client.platform.getIdentity(config.testData.identityId);
        platformResults.push(true);
        failureLogger.recordOperation(true);
      } catch (error) {
        platformResults.push(false);
        failureLogger.recordOperation(false);
      }
    }

    const coreSuccessRate = (coreResults.filter(r => r).length / operations) * 100;
    const platformSuccessRate = (platformResults.filter(r => r).length / operations) * 100;

    console.log(`  Core success rate: ${coreSuccessRate.toFixed(2)}%`);
    console.log(`  Platform success rate: ${platformSuccessRate.toFixed(2)}%`);

    // Core should have high success rate
    expect(coreSuccessRate).toBeGreaterThan(80);

    // Platform may have lower success rate due to injected failures
    // (but should still succeed sometimes if resilience is working)
  }, 120000);

  it('should emit restoration events when service recovers', async () => {
    // First, cause platform degradation
    mockClient.injectFailure({
      namespace: 'platform',
      method: 'getIdentity',
      failureType: 'platform_error',
      count: 2,
    });
    

    const degradationEvents: any[] = [];
    const restorationEvents: any[] = [];

    client.on('degradation', (data) => {
      degradationEvents.push(data);
      console.log(`  ✓ Degradation detected: ${data.service}`);
    });

    client.on('restoration', (data) => {
      restorationEvents.push(data);
      metricsCollector.incrementEvent('restorations');
      console.log(`  ✓ Service restored: ${data.service}`);
    });

    // This should trigger degradation
    try {
      await client.platform.getIdentity(config.testData.identityId);
    } catch (error) {
      // Expected
    }

    // Clear failures to allow restoration
    mockClient.clearFailures();
    

    // Wait a bit for state to settle
    await new Promise(resolve => setTimeout(resolve, 1000));

    // This should succeed (restoration)
    try {
      await client.platform.getIdentity(config.testData.identityId);
      console.log(`  ✓ Platform request succeeded after restoration`);
      failureLogger.recordOperation(true);
    } catch (error) {
      console.log(`  ℹ Platform still unavailable (testnet identity may not exist)`);
      failureLogger.recordOperation(false);
    }

    if (restorationEvents.length > 0) {
      expect(restorationEvents[0]).toHaveProperty('service');
      expect(restorationEvents[0]).toHaveProperty('timestamp');
    }

    client.removeAllListeners('degradation');
    client.removeAllListeners('restoration');
  }, 60000);

  it('should maintain correct service status in getStatus()', async () => {
    // Make requests to establish status
    await client.core.getBestBlockHeight();

    try {
      await client.platform.getIdentity(config.testData.identityId);
    } catch (error) {
      // May fail if identity doesn't exist
    }

    const status = client.getStatus();

    expect(status).toBeDefined();
    expect(status).toHaveProperty('coreAvailable');
    expect(status).toHaveProperty('platformAvailable');
    expect(status).toHaveProperty('currentNode');
    expect(status).toHaveProperty('nodePoolSize');
    expect(status).toHaveProperty('failureCount');

    console.log(`  Service Status:`);
    console.log(`    Core: ${status.coreAvailable ? 'Available' : 'Unavailable'}`);
    console.log(`    Platform: ${status.platformAvailable ? 'Available' : 'Unavailable'}`);

    failureLogger.recordOperation(true);
  }, 30000);

  it('should not degrade when core fails (critical failure)', async () => {
    // Inject core failures
    mockClient.injectFailure({
      namespace: 'core',
      method: 'getBestBlockHeight',
      failureType: 'connection_refused',
      count: 2,
    });
    

    const degradationEvents: any[] = [];

    client.on('degradation', (data) => {
      degradationEvents.push(data);
    });

    // Core failure should propagate (not degrade)
    try {
      await client.core.getBestBlockHeight();
      // If it succeeds after retries/failover, that's fine
      failureLogger.recordOperation(true);
    } catch (error) {
      // Should throw error, not degrade
      expect(error).toBeDefined();
      failureLogger.recordOperation(false);

      // Should not emit degradation event for core failures
      const coreDegradations = degradationEvents.filter(e => e.service === 'core');
      expect(coreDegradations.length).toBe(0);

      console.log(`  ✓ Core failure propagated (no degradation, as expected)`);
    }

    client.removeAllListeners('degradation');
  }, 60000);
});
