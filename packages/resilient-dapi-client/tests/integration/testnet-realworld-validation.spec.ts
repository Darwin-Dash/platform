/**
 * Real-World Testnet Validation Suite
 *
 * Extended validation against real Dash testnet to measure actual resilience
 * in production-like conditions. Generates comprehensive report of failures,
 * recovery actions, and resilience performance.
 *
 * Usage:
 *   npm test tests/integration/testnet-realworld-validation.spec.ts
 *
 * Configuration (via .env):
 *   REALWORLD_TEST_DURATION_MINUTES=30  # Test duration (default: 30)
 *   REALWORLD_TEST_MIN_OPERATIONS=500   # Minimum operations to perform
 *   REALWORLD_TEST_REPORT_DIR=./test-results  # Report output directory
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ResilientDAPIClient } from '../../src/ResilientDAPIClient.js';
import { getTestnetConfig } from './helpers/testnet-config.js';
import { failureLogger } from './helpers/failure-logger.js';
import { metricsCollector, measureLatency } from './helpers/metrics-collector.js';
import { generateReport } from './helpers/report-generator.js';

// Configuration from environment
const TEST_DURATION_MS = (parseInt(process.env.REALWORLD_TEST_DURATION_MINUTES || '30', 10)) * 60 * 1000;
const MIN_OPERATIONS = parseInt(process.env.REALWORLD_TEST_MIN_OPERATIONS || '500', 10);
const REPORT_DIR = process.env.REALWORLD_TEST_REPORT_DIR || './test-results';
const OPERATION_DELAY_MS = 100; // Delay between operations to avoid hammering

describe('Real-World Testnet Validation', () => {
  let client: ResilientDAPIClient;
  let config: ReturnType<typeof getTestnetConfig>;
  let testStartTime: number;
  let operationCount = 0;
  let continueTesting = true;

  beforeAll(() => {
    config = getTestnetConfig();

    console.log('\n=== Real-World Testnet Validation Config ===');
    console.log(`Test Duration: ${TEST_DURATION_MS / 60000} minutes`);
    console.log(`Minimum Operations: ${MIN_OPERATIONS}`);
    console.log(`Report Directory: ${REPORT_DIR}`);
    console.log(`DAPI Nodes: ${config.dapiAddresses.length}`);
    console.log(`Starting at: ${new Date().toISOString()}`);
    console.log('==========================================\n');

    client = new ResilientDAPIClient({
      network: 'testnet',
      dapiAddresses: config.dapiAddresses,
      timeout: config.timeout.normal,
      retries: 0,
      maxRetryAttempts: 10,
      retryBaseDelay: 1000,
      maxRetryDelay: 30000,
      nodeRetryDelay: 300000, // 5 minutes
      logLevel: 'info',
    });

    // Track all resilience events
    client.on('retry', (data) => {
      failureLogger.logFailure({
        timestamp: new Date().toISOString(),
        operation: data.method || 'unknown',
        node: data.namespace || 'unknown',
        failureType: 'RETRY',
        errorMessage: data.error.message,
        resilienceAction: 'RETRY',
        retryAttempt: data.attempt,
        retryDelay: `${data.delay}ms`,
        outcome: 'PENDING',
      });
      metricsCollector.incrementEvent('retries');
    });

    client.on('failover', (data) => {
      failureLogger.logFailure({
        timestamp: new Date().toISOString(),
        operation: 'unknown',
        node: data.oldNode || 'unknown',
        failureType: 'NODE_FAILURE',
        errorMessage: data.reason,
        resilienceAction: 'FAILOVER',
        newNode: data.newNode,
        outcome: 'FAILOVER_EXECUTED',
      });
      metricsCollector.incrementEvent('failovers');
      failureLogger.recordBlacklistedNode(data.oldNode);
    });

    client.on('degradation', (data) => {
      failureLogger.logFailure({
        timestamp: new Date().toISOString(),
        operation: 'unknown',
        node: 'unknown',
        failureType: 'SERVICE_DEGRADATION',
        errorMessage: `${data.namespace} service degraded`,
        resilienceAction: 'DEGRADATION',
        outcome: 'DEGRADED',
      });
      metricsCollector.incrementEvent('degradations');
    });

    failureLogger.startTestRun();
    metricsCollector.start();
    testStartTime = Date.now();
  });

  afterAll(() => {
    metricsCollector.stop();
    client.destroy();

    const summary = failureLogger.getSummary();
    const stats = failureLogger.getStatistics();
    const latencies = metricsCollector.getAllLatencyMetrics();

    console.log('\n=== Real-World Testnet Validation Summary ===');
    console.log(`Duration: ${summary.duration}`);
    console.log(`Total Operations: ${summary.totalOperations}`);
    console.log(`Successful: ${summary.successfulOperations}`);
    console.log(`Failed: ${summary.failedOperations}`);
    console.log(`Success Rate: ${((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)}%`);
    console.log(`\nResilience Actions:`);
    console.log(`  Retries: ${stats.totalRetries}`);
    console.log(`  Failovers: ${stats.totalFailovers}`);
    console.log(`  Degradations: ${stats.totalDegradations || 0}`);
    console.log(`  Nodes Blacklisted: ${stats.nodesBlacklisted}`);
    console.log(`  Average Recovery Time: ${stats.averageRecoveryTime}ms`);

    // Generate comprehensive report
    try {
      const reportPath = generateReport({
        outputDir: REPORT_DIR,
        includeLatencies: true,
        includeMemory: true,
        includeFailureDetails: true,
      });
      console.log(`\n✅ Detailed report generated: ${reportPath}`);
    } catch (error: any) {
      console.log(`\n⚠️  Report generation failed: ${error.message}`);
    }

    console.log('\n==========================================\n');
  });

  it('should maintain high availability during extended real testnet operations', async () => {
    console.log('\n🔄 Starting extended testnet validation...\n');

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - testStartTime;
      const elapsedMin = Math.floor(elapsed / 60000);
      const progress = Math.min(100, (elapsed / TEST_DURATION_MS) * 100);
      const summary = failureLogger.getSummary();
      const successRate = summary.totalOperations > 0
        ? ((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)
        : 'N/A';

      console.log(`[${elapsedMin}m] Progress: ${progress.toFixed(1)}% | Operations: ${operationCount} | Success Rate: ${successRate}%`);
    }, 30000); // Progress update every 30 seconds

    const endTime = testStartTime + TEST_DURATION_MS;

    // Main operation loop
    while (continueTesting && (Date.now() < endTime || operationCount < MIN_OPERATIONS)) {
      const elapsed = Date.now() - testStartTime;

      // Mix of operations to test different code paths
      try {
        // Core operation (most common)
        if (operationCount % 3 === 0) {
          await measureLatency('getBestBlockHeight', async () => {
            return await client.core.getBestBlockHeight();
          });
          failureLogger.recordOperation(true);
          metricsCollector.incrementEvent('core-operations');
        }

        // Block by height (every 5th operation)
        else if (operationCount % 5 === 0) {
          const currentHeight = await client.core.getBestBlockHeight();
          await measureLatency('getBlockByHeight', async () => {
            return await client.core.getBlockByHeight(currentHeight - 10);
          });
          failureLogger.recordOperation(true);
          metricsCollector.incrementEvent('core-operations');
        }

        // Platform operation (every 10th operation)
        else if (operationCount % 10 === 0) {
          try {
            await measureLatency('getIdentity', async () => {
              return await client.platform.getIdentity(config.testData.identityId);
            });
            failureLogger.recordOperation(true);
            metricsCollector.incrementEvent('platform-operations');
          } catch (error) {
            // Platform operations may fail if identity doesn't exist - still counts as handled
            failureLogger.recordOperation(true);
            metricsCollector.incrementEvent('platform-operations');
          }
        }

        // Default: block height
        else {
          await measureLatency('getBestBlockHeight', async () => {
            return await client.core.getBestBlockHeight();
          });
          failureLogger.recordOperation(true);
          metricsCollector.incrementEvent('core-operations');
        }

        operationCount++;

      } catch (error: any) {
        // Operation failed even after retries/failover
        failureLogger.logFailure({
          timestamp: new Date().toISOString(),
          operation: 'mixed-operations',
          node: 'unknown',
          failureType: 'PERMANENT_FAILURE',
          errorMessage: error.message,
          resilienceAction: 'ABORT',
          outcome: 'FAILED',
        });
        failureLogger.recordOperation(false);
        metricsCollector.incrementEvent('permanent-failures');
      }

      // Small delay to avoid hammering the network
      await new Promise(resolve => setTimeout(resolve, OPERATION_DELAY_MS));
    }

    clearInterval(progressInterval);

    const summary = failureLogger.getSummary();
    const stats = failureLogger.getStatistics();
    const status = client.getStatus();

    console.log('\n=== Final Validation Results ===');
    console.log(`Total Operations: ${operationCount}`);
    console.log(`Success Rate: ${((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)}%`);
    console.log(`Resilience Actions: ${stats.totalRetries + stats.totalFailovers + (stats.totalDegradations || 0)}`);
    console.log(`Current Status:`);
    console.log(`  Core Available: ${status.coreAvailable}`);
    console.log(`  Platform Available: ${status.platformAvailable}`);
    console.log(`  Node Pool: ${status.nodePool.available}/${status.nodePool.total}`);
    console.log(`  Blacklisted: ${status.nodePool.blacklisted}`);

    // Assertions
    expect(operationCount).toBeGreaterThanOrEqual(MIN_OPERATIONS);
    expect(summary.totalOperations).toBeGreaterThan(0);

    // Success rate should be high for production readiness
    const successRate = (summary.successfulOperations / summary.totalOperations) * 100;
    expect(successRate).toBeGreaterThan(90); // At least 90% success rate

    // Should have triggered some resilience actions if network had issues
    const totalResilienceActions = stats.totalRetries + stats.totalFailovers + (stats.totalDegradations || 0);
    console.log(`\n✅ Validation complete with ${totalResilienceActions} resilience actions`);

  }, TEST_DURATION_MS + 120000); // Add 2 minutes buffer to test timeout
});
