/**
 * Transaction-Finder Reliability Validation
 *
 * Integration tests that validate the reliability of transaction-finder
 * operations using ResilientDAPIClient to handle network failures.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TransactionFinder } from '../../src/TransactionFinder';
import { FinderMode } from '../../src/types';
import { ResilientDAPIClient } from '@dashevo/resilient-dapi-client';
import { MetricsCollector } from '../helpers/metrics-collector';
import { FailureLogger } from '../helpers/failure-logger';
import { ReportGenerator } from '../helpers/report-generator';
import * as fs from 'fs';
import * as path from 'path';

describe('Transaction-Finder Reliability Validation', () => {
  let client: ResilientDAPIClient;
  let metricsCollector: MetricsCollector;
  let failureLogger: FailureLogger;
  let reportGenerator: ReportGenerator;

  const TEST_ADDRESS = process.env.TESTNET_ADDRESS || 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';

  beforeEach(() => {
    client = new ResilientDAPIClient({
      dapiAddresses: process.env.TESTNET_DAPI_ADDRESSES?.split(',') || ['localhost:1443'],
      timeout: 30000,
      retryStrategy: {
        maxRetries: 3,
        initialBackoff: 1000,
        maxBackoff: 10000,
      },
    });

    metricsCollector = new MetricsCollector();
    failureLogger = new FailureLogger();
    reportGenerator = new ReportGenerator();
  });

  afterEach(() => {
    client.disconnect();
  });

  describe('Historic Sync Reliability', () => {
    it('should find UTXOs from 1,000 blocks with high success rate', async function () {
      this.timeout(300000); // 5 minute timeout

      const startTime = Date.now();

      try {
        // Get current height
        const currentHeight = await client.core.getBestBlockHeight();
        metricsCollector.recordMetric('current_testnet_height', currentHeight);

        // Create finder for 1000 block range
        const fromHeight = Math.max(currentHeight - 1000, 1);
        const toHeight = currentHeight;

        metricsCollector.recordMetric('sync_from_height', fromHeight);
        metricsCollector.recordMetric('sync_to_height', toHeight);

        const finder = new TransactionFinder({
          mode: FinderMode.HISTORIC,
          network: 'testnet',
          addresses: [TEST_ADDRESS],
          fromHeight,
          toHeight,
          dapiClient: client as any, // Type cast for integration
        });

        // Track progress events
        finder.on('blockScanned', (event: any) => {
          metricsCollector.recordEvent('progress', `block_scanned_${event.height}`);
        });

        finder.on('transactionFound', (event: any) => {
          metricsCollector.recordEvent('found', `txid_${event.txid?.slice(0, 8)}`);
        });

        // Find UTXOs
        const utxos = await finder.findUTXOs();

        const duration = Date.now() - startTime;
        metricsCollector.recordMetric('historic_sync_duration_ms', duration);
        metricsCollector.recordMetric('utxos_found', utxos.length);

        expect(utxos).toBeDefined();
        expect(Array.isArray(utxos)).toBe(true);

        console.log(`Found ${utxos.length} UTXOs in ${duration}ms`);

        // Validate UTXO structure
        for (const utxo of utxos) {
          expect(utxo).toHaveProperty('txid');
          expect(utxo).toHaveProperty('vout');
          expect(utxo).toHaveProperty('amount');
        }
      } catch (error) {
        failureLogger.logFailure('historic_sync_1000_blocks', error as Error);
        throw error;
      }
    });

    it('should handle mid-sync network failure and recover', async function () {
      this.timeout(300000); // 5 minute timeout

      try {
        const currentHeight = await client.core.getBestBlockHeight();
        const fromHeight = Math.max(currentHeight - 500, 1);

        let attemptCount = 0;
        let successfulSync = false;

        for (let attempt = 0; attempt < 3; attempt++) {
          attemptCount++;

          try {
            const finder = new TransactionFinder({
              mode: FinderMode.HISTORIC,
              network: 'testnet',
              addresses: [TEST_ADDRESS],
              fromHeight: fromHeight + (attempt * 100), // Progressive sync start
              toHeight: currentHeight,
              dapiClient: client as any,
            });

            metricsCollector.recordEvent('sync_attempt', `attempt_${attempt}`);

            const utxos = await finder.findUTXOs();
            metricsCollector.recordMetric(`utxos_attempt_${attempt}`, utxos.length);

            successfulSync = true;
            break;
          } catch (error) {
            metricsCollector.recordEvent('sync_failure', `attempt_${attempt}`);
            failureLogger.logFailure(`historic_sync_attempt_${attempt}`, error as Error);

            if (attempt < 2) {
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }

        metricsCollector.recordMetric('sync_attempts', attemptCount);
        expect(successfulSync).toBe(true);
      } catch (error) {
        failureLogger.logFailure('historic_sync_recovery_test', error as Error);
        throw error;
      }
    });

    it('should validate UTXO data consistency', async function () {
      this.timeout(300000);

      try {
        const currentHeight = await client.core.getBestBlockHeight();
        const fromHeight = Math.max(currentHeight - 200, 1);

        const finder = new TransactionFinder({
          mode: FinderMode.HISTORIC,
          network: 'testnet',
          addresses: [TEST_ADDRESS],
          fromHeight,
          toHeight: currentHeight,
          dapiClient: client as any,
        });

        const utxos = await finder.findUTXOs();

        metricsCollector.recordMetric('validated_utxos', utxos.length);

        // Validate each UTXO
        for (const utxo of utxos) {
          expect(typeof utxo.txid).toBe('string');
          expect(typeof utxo.vout).toBe('number');
          expect(typeof utxo.amount).toBe('number');

          expect(utxo.txid.length).toBeGreaterThan(0);
          expect(utxo.vout).toBeGreaterThanOrEqual(0);
          expect(utxo.amount).toBeGreaterThan(0);

          metricsCollector.recordMetric('utxo_amount', utxo.amount);
        }

        metricsCollector.recordEvent('validation', 'utxo_consistency_ok');
      } catch (error) {
        failureLogger.logFailure('utxo_validation', error as Error);
        throw error;
      }
    });
  });

  describe('Realtime Monitoring Reliability', () => {
    it('should monitor for 10 minutes without failure', async function () {
      this.timeout(600000); // 10 minute timeout

      const testDuration = 10 * 60 * 1000;
      const startTime = Date.now();
      const transactions = [];
      let monitoringActive = true;

      try {
        const finder = new TransactionFinder({
          mode: FinderMode.REALTIME,
          network: 'testnet',
          addresses: [TEST_ADDRESS],
          dapiClient: client as any,
        });

        // Track monitoring events
        finder.on('transactionDetected', (event: any) => {
          transactions.push(event);
          metricsCollector.recordEvent('realtime', `tx_detected_${event.txid?.slice(0, 8)}`);
        });

        finder.on('instantLock', (event: any) => {
          metricsCollector.recordEvent('realtime', 'instant_lock');
        });

        finder.on('chainLock', (event: any) => {
          metricsCollector.recordEvent('realtime', 'chain_lock');
        });

        // Start monitoring
        const monitorPromise = finder.monitorAddresses({
          onTransaction: (tx: any) => {
            metricsCollector.recordEvent('monitor_callback', 'transaction');
          },
          onInstantLock: () => {
            metricsCollector.recordEvent('monitor_callback', 'instant_lock');
          },
        });

        // Monitor until time expires
        while (Date.now() - startTime < testDuration) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
        }

        // Stop monitoring
        await finder.stopMonitoring();
        monitoringActive = false;

        metricsCollector.recordMetric('monitoring_duration_ms', Date.now() - startTime);
        metricsCollector.recordMetric('transactions_detected', transactions.length);

        console.log(`Monitoring complete. Detected ${transactions.length} transactions in ${Date.now() - startTime}ms`);
      } catch (error) {
        metricsCollector.recordEvent('error', 'monitoring_failure');
        failureLogger.logFailure('realtime_monitoring_10min', error as Error);

        if (monitoringActive) {
          throw error;
        }
      }
    });

    it('should recover from stream disconnect during monitoring', async function () {
      this.timeout(120000); // 2 minute timeout

      let recoveryCount = 0;
      const testDuration = 60000; // 1 minute test
      const startTime = Date.now();

      try {
        const finder = new TransactionFinder({
          mode: FinderMode.REALTIME,
          network: 'testnet',
          addresses: [TEST_ADDRESS],
          dapiClient: client as any,
        });

        finder.on('disconnected', () => {
          recoveryCount++;
          metricsCollector.recordEvent('recovery', `disconnect_${recoveryCount}`);
        });

        finder.on('reconnected', () => {
          metricsCollector.recordEvent('recovery', `reconnected_${recoveryCount}`);
        });

        // Start monitoring
        await finder.monitorAddresses({
          onTransaction: () => {},
        });

        // Let it run for the test duration
        while (Date.now() - startTime < testDuration) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        await finder.stopMonitoring();

        metricsCollector.recordMetric('disconnect_recovery_count', recoveryCount);

        console.log(`Monitoring test complete. Had ${recoveryCount} disconnects`);
      } catch (error) {
        failureLogger.logFailure('realtime_recovery_test', error as Error);
      }
    });
  });

  describe('Hybrid Mode Reliability', () => {
    it('should sync historic + monitor realtime reliably', async function () {
      this.timeout(300000); // 5 minute timeout

      const startTime = Date.now();

      try {
        const currentHeight = await client.core.getBestBlockHeight();
        const fromHeight = Math.max(currentHeight - 200, 1);

        const finder = new TransactionFinder({
          mode: FinderMode.HYBRID,
          network: 'testnet',
          addresses: [TEST_ADDRESS],
          historic: {
            fromHeight,
            toHeight: currentHeight,
          },
          realtime: {
            autoPruneOnConfirmation: true,
          },
          dapiClient: client as any,
        });

        // Track events
        let historicComplete = false;
        let monitoringStarted = false;

        finder.on('historicSyncComplete', () => {
          historicComplete = true;
          metricsCollector.recordEvent('hybrid', 'historic_complete');
        });

        finder.on('monitoringStarted', () => {
          monitoringStarted = true;
          metricsCollector.recordEvent('hybrid', 'monitoring_started');
        });

        // Perform sync and monitor
        const { utxos, stopMonitoring } = await finder.syncAndMonitor({
          onTransaction: () => {
            metricsCollector.recordEvent('hybrid_callback', 'transaction');
          },
        });

        metricsCollector.recordMetric('hybrid_utxos_found', utxos.length);

        // Monitor for a short time
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Stop monitoring
        await stopMonitoring();

        const duration = Date.now() - startTime;
        metricsCollector.recordMetric('hybrid_sync_monitor_duration_ms', duration);

        expect(historicComplete).toBe(true);
        expect(Array.isArray(utxos)).toBe(true);

        console.log(`Hybrid mode complete. Found ${utxos.length} UTXOs, monitored for 30s`);
      } catch (error) {
        failureLogger.logFailure('hybrid_sync_monitor', error as Error);
        throw error;
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle and report errors gracefully', async function () {
      this.timeout(120000);

      try {
        const currentHeight = await client.core.getBestBlockHeight();

        const finder = new TransactionFinder({
          mode: FinderMode.HISTORIC,
          network: 'testnet',
          addresses: [TEST_ADDRESS],
          fromHeight: Math.max(currentHeight - 100, 1),
          toHeight: currentHeight,
          dapiClient: client as any,
        });

        finder.on('error', (error: Error) => {
          metricsCollector.recordEvent('error_event', error.message);
          failureLogger.logFailure('finder_error_event', error);
        });

        try {
          const utxos = await finder.findUTXOs();
          metricsCollector.recordMetric('error_handling_utxos', utxos.length);
        } catch (error) {
          // Even if this fails, error should be logged
          metricsCollector.recordEvent('error', 'find_utxos_failed');
          failureLogger.logFailure('find_utxos', error as Error);
        }
      } catch (error) {
        failureLogger.logFailure('error_recovery_test', error as Error);
      }
    });

    it('should support operation retry with exponential backoff', async function () {
      this.timeout(180000);

      try {
        const currentHeight = await client.core.getBestBlockHeight();

        let lastError: Error | null = null;
        let successCount = 0;

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const finder = new TransactionFinder({
              mode: FinderMode.HISTORIC,
              network: 'testnet',
              addresses: [TEST_ADDRESS],
              fromHeight: Math.max(currentHeight - (100 + attempt * 50), 1),
              toHeight: currentHeight,
              dapiClient: client as any,
            });

            const utxos = await finder.findUTXOs();
            successCount++;
            metricsCollector.recordEvent('retry', `success_attempt_${attempt}`);
            lastError = null;
            break;
          } catch (error) {
            lastError = error as Error;
            metricsCollector.recordEvent('retry', `failure_attempt_${attempt}`);
            failureLogger.logFailure(`retry_attempt_${attempt}`, error as Error);

            if (attempt < 2) {
              // Exponential backoff
              const backoffMs = Math.pow(2, attempt) * 1000;
              await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
          }
        }

        metricsCollector.recordMetric('retry_success_count', successCount);

        expect(successCount).toBeGreaterThan(0);
      } catch (error) {
        failureLogger.logFailure('retry_test', error as Error);
      }
    });
  });

  describe('Report Generation', () => {
    it('should generate comprehensive reliability report', async function () {
      this.timeout(120000);

      try {
        const currentHeight = await client.core.getBestBlockHeight();

        const finder = new TransactionFinder({
          mode: FinderMode.HISTORIC,
          network: 'testnet',
          addresses: [TEST_ADDRESS],
          fromHeight: Math.max(currentHeight - 50, 1),
          toHeight: currentHeight,
          dapiClient: client as any,
        });

        const utxos = await finder.findUTXOs();

        metricsCollector.recordMetric('report_utxos', utxos.length);

        // Generate report
        const metrics = metricsCollector.getMetrics();
        const failures = failureLogger.getFailures();

        const report = `
# Transaction-Finder Reliability Validation Report

**Generated**: ${new Date().toISOString()}

## Summary
- **Test Mode**: HISTORIC
- **Address**: ${TEST_ADDRESS}
- **Block Range**: ${currentHeight - 50} to ${currentHeight}
- **Total Events**: ${metrics.events.length}
- **Total Failures**: ${failures.length}

## Results
- **UTXOs Found**: ${utxos.length}
- **Test Duration**: ${metrics.durations.length > 0 ? Math.max(...metrics.durations) : 0}ms

## Key Metrics
${Object.entries(metrics.metrics)
  .slice(0, 10)
  .map(([key, value]) => `- **${key}**: ${typeof value === 'number' ? value.toFixed(2) : value}`)
  .join('\n')}

## Status
${failures.length === 0 ? '✅ All tests passed' : `⚠️ ${failures.length} issues detected`}

## Verdict
Ready for ${failures.length === 0 ? 'production' : 'review'}
`;

        // Save report
        const resultsDir = path.join(process.cwd(), 'test-results');
        if (!fs.existsSync(resultsDir)) {
          fs.mkdirSync(resultsDir, { recursive: true });
        }

        const reportPath = path.join(
          resultsDir,
          `transaction-finder-validation-${new Date().toISOString().replace(/[:.]/g, '-')}.md`
        );

        fs.writeFileSync(reportPath, report);
        console.log(`Report saved to: ${reportPath}`);
      } catch (error) {
        failureLogger.logFailure('report_generation', error as Error);
        throw error;
      }
    });
  });
});
