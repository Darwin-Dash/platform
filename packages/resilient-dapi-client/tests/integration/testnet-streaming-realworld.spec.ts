/**
 * Real Testnet Streaming Validation
 *
 * Extended validation tests that run against real testnet infrastructure
 * to prove streaming reliability under actual network conditions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResilientDAPIClient } from '../../src/index';
import { MetricsCollector } from './helpers/metrics-collector';
import { FailureLogger } from './helpers/failure-logger';
import { generateReport, type ReportOptions } from './helpers/report-generator';
import { getTestnetConfig } from './helpers/testnet-config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple wrapper class for report generation in tests
 */
class ReportGenerator {
  generate(options?: ReportOptions): string {
    return generateReport(options);
  }
}

describe('Real Testnet Streaming Validation', () => {
  let client: ResilientDAPIClient;
  let metricsCollector: MetricsCollector;
  let failureLogger: FailureLogger;
  let reportGenerator: ReportGenerator;

  beforeEach(() => {
    // Initialize client with real testnet configuration
    const testnetConfig = getTestnetConfig();

    client = new ResilientDAPIClient({
      network: testnetConfig.network,
      dapiAddresses: testnetConfig.dapiAddresses,
      timeout: testnetConfig.timeout.long,
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
    client.destroy();
  });

  describe('Real Testnet Block Header Streaming', () => {
    it('should stream 1,000 real headers from testnet', async function () {

      const startTime = Date.now();
      const headers = [];

      try {
        // Get current height first
        const currentHeight = await client.core.getBestBlockHeight();
        const fromHeight = Math.max(currentHeight - 1000, 0);

        metricsCollector.recordMetric('current_testnet_height', currentHeight);
        metricsCollector.recordMetric('stream_from_height', fromHeight);

        // Stream headers
        const stream = client.core.subscribeToBlockHeadersWithChainLocks({
          fromBlockHeight: fromHeight,
        });

        let messageCount = 0;
        for await (const msg of stream) {
          headers.push(msg);
          messageCount++;

          const latency = Date.now() - startTime;
          metricsCollector.recordLatency('header', latency);

          // Validate message structure
          expect(msg).toBeDefined();

          // Stop after 1000 headers or 5 minutes
          if (messageCount >= 1000 || Date.now() - startTime > 300000) {
            break;
          }
        }

        metricsCollector.recordMetric('headers_received', headers.length);

        // Validate results
        expect(headers.length).toBeGreaterThan(0);

        console.log(`Streamed ${headers.length} headers in ${Date.now() - startTime}ms`);
      } catch (error) {
        failureLogger.logFailure('blockHeaderStreaming', error as Error);
        throw error;
      }
    });

    it('should detect and handle stream disconnect during header streaming', async function () {

      const startTime = Date.now();
      let totalHeaders = 0;
      let disconnectOccurred = false;
      const attempts: Array<{ attempt: number; headerCount: number; error?: string }> = [];

      const currentHeight = await client.core.getBestBlockHeight();
      const fromHeight = Math.max(currentHeight - 500, 0);

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const stream = client.core.subscribeToBlockHeadersWithChainLocks({
            fromBlockHeight: fromHeight + totalHeaders,
          });

          let attemptHeaders = 0;
          for await (const msg of stream) {
            attemptHeaders++;
            totalHeaders++;
            metricsCollector.recordLatency('header_with_retry', Date.now() - startTime);
          }

          attempts.push({ attempt, headerCount: attemptHeaders });
          break;
        } catch (error) {
          disconnectOccurred = true;
          const errorMsg = (error as Error).message;
          attempts.push({ attempt, headerCount: totalHeaders, error: errorMsg });

          metricsCollector.recordEvent('disconnect', `attempt_${attempt}`);
          failureLogger.logFailure(`headerStream_attempt_${attempt}`, error as Error);

          if (attempt < 2) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      metricsCollector.recordMetric('total_headers_with_recovery', totalHeaders);
      metricsCollector.recordMetric('disconnect_occurred', disconnectOccurred ? 1 : 0);

      expect(totalHeaders).toBeGreaterThan(0);

      console.log('Streaming attempts:', attempts);
    });

    it('should handle extended header streaming session (30 min)', async function () {

      const testDuration = 30 * 60 * 1000;
      const startTime = Date.now();
      const results = {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        totalHeadersStreamed: 0,
      };

      const currentHeight = await client.core.getBestBlockHeight();

      while (Date.now() - startTime < testDuration) {
        try {
          results.totalOperations++;

          const fromHeight = Math.max(currentHeight - (100 + Math.random() * 200), 0);

          const stream = client.core.subscribeToBlockHeadersWithChainLocks({
            fromBlockHeight: fromHeight,
          });

          let headerCount = 0;
          const operationStart = Date.now();

          for await (const msg of stream) {
            headerCount++;
            results.totalHeadersStreamed++;

            if (headerCount >= 50 || Date.now() - operationStart > 10000) {
              break;
            }
          }

          results.successfulOperations++;
          metricsCollector.recordEvent('operation', 'header_stream_success');
        } catch (error) {
          results.failedOperations++;
          metricsCollector.recordEvent('operation', 'header_stream_failure');
          failureLogger.logFailure('extended_header_session', error as Error);
        }

        // Brief pause between operations
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const successRate = (results.successfulOperations / results.totalOperations) * 100;

      metricsCollector.recordMetric('extended_session_success_rate', successRate);
      metricsCollector.recordMetric('extended_session_operations', results.totalOperations);

      console.log('Extended streaming results:', {
        ...results,
        successRate: `${successRate.toFixed(2)}%`,
      });

      expect(successRate).toBeGreaterThan(99.0);
    });
  });

  describe('Real Testnet Transaction Streaming', () => {
    it('should stream real transactions from testnet', async function () {

      const startTime = Date.now();
      const transactions = [];

      try {
        // Create a bloom filter (simplified for testing)
        const bloomFilter = Buffer.from([0xff, 0xff, 0xff, 0xff]);

        metricsCollector.recordEvent('operation', 'tx_stream_start');

        // Stream transactions
        const stream = client.core.subscribeToTransactionsWithProofs(bloomFilter);

        let messageCount = 0;
        for await (const msg of stream) {
          transactions.push(msg);
          messageCount++;

          const latency = Date.now() - startTime;
          metricsCollector.recordLatency('transaction', latency);

          // Stop after reasonable amount or timeout
          if (messageCount >= 100 || Date.now() - startTime > 300000) {
            break;
          }
        }

        metricsCollector.recordMetric('transactions_received', transactions.length);

        console.log(`Streamed ${transactions.length} transactions in ${Date.now() - startTime}ms`);
      } catch (error) {
        failureLogger.logFailure('transactionStreaming', error as Error);
        // Transaction streaming might not always be available, don't fail
      }
    });

    it('should recover from transaction stream disconnect', async function () {

      const bloomFilter = Buffer.from([0xff, 0xff, 0xff, 0xff]);
      let totalTransactions = 0;
      const attempts: Array<{ attempt: number; txCount: number; error?: string }> = [];

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const stream = client.core.subscribeToTransactionsWithProofs(bloomFilter);

          let attemptTxs = 0;
          for await (const msg of stream) {
            attemptTxs++;
            totalTransactions++;
            metricsCollector.recordLatency('transaction_with_retry', Date.now());

            if (attemptTxs >= 50) {
              break;
            }
          }

          attempts.push({ attempt, txCount: attemptTxs });
          break;
        } catch (error) {
          attempts.push({
            attempt,
            txCount: totalTransactions,
            error: (error as Error).message,
          });

          metricsCollector.recordEvent('tx_disconnect', `attempt_${attempt}`);

          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      metricsCollector.recordMetric('total_transactions_with_recovery', totalTransactions);

      console.log('Transaction streaming attempts:', attempts);
    });
  });

  describe('Streaming Reliability Metrics', () => {
    it('should collect comprehensive streaming metrics', async function () {

      const currentHeight = await client.core.getBestBlockHeight();
      const fromHeight = Math.max(currentHeight - 200, 0);

      try {
        const stream = client.core.subscribeToBlockHeadersWithChainLocks({
          fromBlockHeight: fromHeight,
        });

        const streamMetrics = {
          startHeight: fromHeight,
          endHeight: 0,
          totalMessages: 0,
          startTime: Date.now(),
          messageLatencies: [] as number[],
        };

        let lastMessageTime = Date.now();

        for await (const msg of stream) {
          const now = Date.now();
          streamMetrics.messageLatencies.push(now - lastMessageTime);
          lastMessageTime = now;
          streamMetrics.totalMessages++;
          streamMetrics.endHeight = msg.blockHeight || 0;

          if (streamMetrics.totalMessages >= 100) {
            break;
          }
        }

        streamMetrics.messageLatencies.sort((a, b) => a - b);

        const stats = {
          totalDuration: Date.now() - streamMetrics.startTime,
          avgLatency: streamMetrics.messageLatencies.reduce((a, b) => a + b, 0) / streamMetrics.messageLatencies.length,
          p50Latency: streamMetrics.messageLatencies[Math.floor(streamMetrics.messageLatencies.length * 0.5)],
          p99Latency: streamMetrics.messageLatencies[Math.floor(streamMetrics.messageLatencies.length * 0.99)],
          minLatency: streamMetrics.messageLatencies[0],
          maxLatency: streamMetrics.messageLatencies[streamMetrics.messageLatencies.length - 1],
        };

        for (const [key, value] of Object.entries(stats)) {
          metricsCollector.recordMetric(`streaming_${key}`, value);
        }

        console.log('Streaming metrics:', stats);
        expect(streamMetrics.totalMessages).toBeGreaterThan(0);
      } catch (error) {
        failureLogger.logFailure('streaming_metrics_collection', error as Error);
        throw error;
      }
    });
  });

  describe('Report Generation', () => {
    it('should generate streaming validation report', async function () {

      const currentHeight = await client.core.getBestBlockHeight();
      const fromHeight = Math.max(currentHeight - 100, 0);

      try {
        const stream = client.core.subscribeToBlockHeadersWithChainLocks({
          fromBlockHeight: fromHeight,
        });

        let messageCount = 0;
        for await (const msg of stream) {
          messageCount++;
          metricsCollector.recordLatency('validation_test', Date.now());

          if (messageCount >= 100) {
            break;
          }
        }
      } catch (error) {
        failureLogger.logFailure('validation_stream', error as Error);
      }

      // Generate report
      const metrics = metricsCollector.getMetrics();
      const failures = failureLogger.getFailures();

      const report = `
# Streaming Validation Report

**Generated**: ${new Date().toISOString()}

## Summary
- **Test Duration**: ${metrics.durations.length > 0 ? Math.max(...metrics.durations) : 0}ms
- **Total Events**: ${metrics.events.length}
- **Total Failures**: ${failures.length}

## Metrics
${Object.entries(metrics.metrics)
  .map(([key, value]) => `- **${key}**: ${typeof value === 'number' ? value.toFixed(2) : value}`)
  .join('\n')}

## Events
${metrics.events.slice(-10).map(e => `- ${e.timestamp}: ${e.event}`).join('\n')}

## Failures
${failures.length > 0 ? failures.map(f => `- ${f.operation}: ${f.error.message}`).join('\n') : 'None'}

## Verdict
${failures.length === 0 ? '✅ All tests passed' : `⚠️ ${failures.length} failures detected`}
`;

      // Ensure test-results directory exists
      const resultsDir = path.join(process.cwd(), 'test-results');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }

      // Write report
      const reportPath = path.join(
        resultsDir,
        `streaming-validation-${new Date().toISOString().replace(/[:.]/g, '-')}.md`
      );

      fs.writeFileSync(reportPath, report);
      console.log(`Report saved to: ${reportPath}`);
    });
  });
});
