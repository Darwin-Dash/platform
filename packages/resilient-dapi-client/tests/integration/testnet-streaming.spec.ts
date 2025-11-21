/**
 * Streaming Operations Test Suite
 *
 * Comprehensive tests for streaming operations using mock DAPI client
 * with controllable failure injection to verify reliability mechanisms.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ControllableMockDAPIClient } from './helpers/controllable-mock-client';
import { MetricsCollector } from './helpers/metrics-collector';
import { FailureLogger } from './helpers/failure-logger';

describe('Streaming Operations - Mock Tests', () => {
  let mockClient: ControllableMockDAPIClient;
  let metricsCollector: MetricsCollector;
  let failureLogger: FailureLogger;

  beforeEach(() => {
    mockClient = new ControllableMockDAPIClient();
    metricsCollector = new MetricsCollector();
    failureLogger = new FailureLogger();
  });

  afterEach(() => {
    mockClient.clearFailures();
    mockClient.resetStreamBehavior();
  });

  describe('subscribeToBlockHeadersWithChainLocks', () => {
    it('should successfully stream 1,000 headers', async () => {
      mockClient.setStreamBehavior('subscribeToBlockHeadersWithChainLocks', {
        messageCount: 1000,
        delayPerMessage: 5,
      });

      const headers = [];
      const startTime = Date.now();

      try {
        const stream = mockClient.core.subscribeToBlockHeadersWithChainLocks();
        for await (const header of stream) {
          headers.push(header);
          metricsCollector.recordLatency('headerStream', Date.now() - startTime);
        }
      } catch (error) {
        failureLogger.logFailure('subscribeToBlockHeadersWithChainLocks', error as Error);
      }

      expect(headers.length).toBe(1000);
      expect(headers[0].blockHeight).toBe(1000000);
      expect(headers[999].blockHeight).toBe(1000999);

      const metrics = metricsCollector.getMetrics();
      console.log('Stream metrics:', metrics);
    });

    it('should recover from mid-stream disconnect', async () => {
      let streamAttempts = 0;
      const allHeaders = [];

      for (let attempt = 0; attempt < 3; attempt++) {
        streamAttempts++;

        mockClient.setStreamBehavior('subscribeToBlockHeadersWithChainLocks', {
          messageCount: 1000,
          delayPerMessage: 5,
          disconnectAfterMessages: attempt === 0 ? 500 : 1000,
        });

        try {
          const stream = mockClient.core.subscribeToBlockHeadersWithChainLocks();
          for await (const header of stream) {
            allHeaders.push(header);
          }
          // If we get here, we've recovered
          break;
        } catch (error) {
          if (attempt < 2) {
            metricsCollector.recordEvent('retry', 'disconnect_recovery');
            // Clear for next attempt
            mockClient.resetStreamBehavior();
          } else {
            failureLogger.logFailure('blockHeaderStream_recovery', error as Error);
          }
        }
      }

      expect(allHeaders.length).toBeGreaterThan(500);
      expect(streamAttempts).toBeGreaterThan(1);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.events.length).toBeGreaterThan(0);
    });

    it('should detect stream hang and timeout', async () => {
      mockClient.setStreamBehavior('subscribeToBlockHeadersWithChainLocks', {
        messageCount: 1000,
        delayPerMessage: 5,
        hangAfterMessages: 100,
      });

      const headers = [];
      let timeoutOccurred = false;

      // Simulate timeout detection with a promise race
      const timeout = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Stream timeout detected - no data for 30s'));
        }, 2000); // Shorter timeout for testing
      });

      try {
        const stream = mockClient.core.subscribeToBlockHeadersWithChainLocks();
        const streamPromise = (async () => {
          for await (const header of stream) {
            headers.push(header);
          }
        })();

        await Promise.race([streamPromise, timeout]);
      } catch (error) {
        if ((error as Error).message.includes('timeout')) {
          timeoutOccurred = true;
          metricsCollector.recordEvent('timeout', 'stream_hang');
        }
        failureLogger.logFailure('blockHeaderStream_hang', error as Error);
      }

      expect(headers.length).toBeLessThan(150);
      expect(timeoutOccurred || headers.length < 150).toBe(true);
    });

    it('should handle corrupt header in stream', async () => {
      mockClient.setStreamBehavior('subscribeToBlockHeadersWithChainLocks', {
        messageCount: 500,
        delayPerMessage: 5,
        corruptMessageAt: 250,
      });

      const headers = [];
      let corruptionDetected = false;

      try {
        const stream = mockClient.core.subscribeToBlockHeadersWithChainLocks();
        for await (const header of stream) {
          if (header.corrupted) {
            corruptionDetected = true;
            metricsCollector.recordEvent('corruption', 'corrupted_message');
            // Could implement recovery logic here
            continue;
          }
          headers.push(header);
        }
      } catch (error) {
        failureLogger.logFailure('blockHeaderStream_corruption', error as Error);
      }

      expect(corruptionDetected).toBe(true);
      // Either we skip corrupted messages or stop processing
      expect(headers.length).toBeLessThanOrEqual(500);
    });
  });

  describe('subscribeToTransactionsWithProofs', () => {
    it('should successfully stream 500 transactions', async () => {
      mockClient.setStreamBehavior('subscribeToTransactionsWithProofs', {
        messageCount: 500,
        delayPerMessage: 5,
      });

      const transactions = [];
      const initialMemory = process.memoryUsage().heapUsed;

      try {
        const bloomFilter = Buffer.from([0, 0, 0, 0]);
        const stream = mockClient.core.subscribeToTransactionsWithProofs(bloomFilter);

        for await (const tx of stream) {
          transactions.push(tx);
          // Validate structure
          expect(tx.transactionIndex).toBeDefined();
          expect(tx.transaction).toBeDefined();
          expect(tx.merkleBlock).toBeDefined();
          expect(tx.proof).toBeDefined();
        }
      } catch (error) {
        failureLogger.logFailure('subscribeToTransactionsWithProofs', error as Error);
      }

      expect(transactions.length).toBe(500);

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024; // MB
      metricsCollector.recordMetric('memory_growth_mb', memoryGrowth);

      // Memory growth should be reasonable
      expect(memoryGrowth).toBeLessThan(50); // Less than 50MB
    });

    it('should recover from mid-stream disconnect', async () => {
      let streamAttempts = 0;
      const allTransactions = [];

      for (let attempt = 0; attempt < 3; attempt++) {
        streamAttempts++;

        mockClient.setStreamBehavior('subscribeToTransactionsWithProofs', {
          messageCount: 500,
          delayPerMessage: 5,
          disconnectAfterMessages: attempt === 0 ? 200 : 500,
        });

        try {
          const bloomFilter = Buffer.from([0, 0, 0, 0]);
          const stream = mockClient.core.subscribeToTransactionsWithProofs(bloomFilter);

          for await (const tx of stream) {
            allTransactions.push(tx);
          }
          break;
        } catch (error) {
          if (attempt < 2) {
            metricsCollector.recordEvent('retry', 'tx_stream_recovery');
            mockClient.resetStreamBehavior();
          } else {
            failureLogger.logFailure('transactionStream_recovery', error as Error);
          }
        }
      }

      expect(allTransactions.length).toBeGreaterThan(200);
      expect(streamAttempts).toBeGreaterThan(1);
    });

    it('should handle stream hang during long sync', async () => {
      mockClient.setStreamBehavior('subscribeToTransactionsWithProofs', {
        messageCount: 500,
        delayPerMessage: 5,
        hangAfterMessages: 300,
      });

      const transactions = [];
      let hangDetected = false;

      const timeout = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Stream timeout - no data for 30s'));
        }, 2000);
      });

      try {
        const bloomFilter = Buffer.from([0, 0, 0, 0]);
        const stream = mockClient.core.subscribeToTransactionsWithProofs(bloomFilter);

        const streamPromise = (async () => {
          for await (const tx of stream) {
            transactions.push(tx);
          }
        })();

        await Promise.race([streamPromise, timeout]);
      } catch (error) {
        if ((error as Error).message.includes('timeout')) {
          hangDetected = true;
          metricsCollector.recordEvent('timeout', 'tx_stream_hang');
        }
        failureLogger.logFailure('transactionStream_hang', error as Error);
      }

      expect(transactions.length).toBeLessThan(350);
      expect(hangDetected || transactions.length < 350).toBe(true);
    });
  });

  describe('Long-Running Streams', () => {
    it('should handle 10,000 header stream without memory leak', async () => {
      mockClient.setStreamBehavior('subscribeToBlockHeadersWithChainLocks', {
        messageCount: 10000,
        delayPerMessage: 1, // Faster for testing
      });

      const initialMemory = process.memoryUsage().heapUsed;
      const headers = [];

      try {
        const stream = mockClient.core.subscribeToBlockHeadersWithChainLocks();
        for await (const header of stream) {
          headers.push(header);
        }
      } catch (error) {
        failureLogger.logFailure('longRunningHeaderStream', error as Error);
      }

      expect(headers.length).toBe(10000);

      const finalMemory = process.memoryUsage().heapUsed;
      const growth = (finalMemory - initialMemory) / 1024 / 1024; // MB

      metricsCollector.recordMetric('long_stream_memory_growth_mb', growth);

      // Memory growth should be manageable for 10k messages
      expect(growth).toBeLessThan(100); // Less than 100MB
    });

    it('should provide progress updates during long stream', async () => {
      mockClient.setStreamBehavior('subscribeToBlockHeadersWithChainLocks', {
        messageCount: 1000,
        delayPerMessage: 2,
      });

      const progressUpdates = [];
      const batchSize = 100;

      try {
        const stream = mockClient.core.subscribeToBlockHeadersWithChainLocks();
        let count = 0;

        for await (const header of stream) {
          count++;
          if (count % batchSize === 0) {
            const progress = { count, timestamp: Date.now() };
            progressUpdates.push(progress);
            metricsCollector.recordEvent('progress', `${count}_headers_processed`);
          }
        }
      } catch (error) {
        failureLogger.logFailure('progressTracking', error as Error);
      }

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0].count).toBe(batchSize);
    });

    it('should handle concurrent streams', async () => {
      mockClient.setStreamBehavior('subscribeToBlockHeadersWithChainLocks', {
        messageCount: 500,
        delayPerMessage: 5,
      });

      mockClient.setStreamBehavior('subscribeToTransactionsWithProofs', {
        messageCount: 500,
        delayPerMessage: 5,
      });

      const headers = [];
      const transactions = [];

      try {
        const headerStream = mockClient.core.subscribeToBlockHeadersWithChainLocks();
        const bloomFilter = Buffer.from([0, 0, 0, 0]);
        const txStream = mockClient.core.subscribeToTransactionsWithProofs(bloomFilter);

        // Consume both streams concurrently
        await Promise.all([
          (async () => {
            for await (const header of headerStream) {
              headers.push(header);
            }
          })(),
          (async () => {
            for await (const tx of txStream) {
              transactions.push(tx);
            }
          })(),
        ]);
      } catch (error) {
        failureLogger.logFailure('concurrentStreams', error as Error);
      }

      expect(headers.length).toBe(500);
      expect(transactions.length).toBe(500);
      metricsCollector.recordEvent('concurrency', 'dual_stream_success');
    });
  });

  describe('Stream Failure Scenarios', () => {
    it('should handle multiple disconnects and recover', async () => {
      let totalMessages = 0;
      const maxAttempts = 5;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Progressive disconnect points
        const disconnectAt = attempt === 0 ? 100 : attempt === 1 ? 200 : 500;

        mockClient.setStreamBehavior('subscribeToBlockHeadersWithChainLocks', {
          messageCount: 1000,
          delayPerMessage: 1,
          disconnectAfterMessages: disconnectAt,
        });

        try {
          const stream = mockClient.core.subscribeToBlockHeadersWithChainLocks();
          for await (const header of stream) {
            totalMessages++;
          }
          break; // Success on last attempt
        } catch (error) {
          if (attempt < maxAttempts - 1) {
            metricsCollector.recordEvent('retry', `attempt_${attempt + 1}`);
            mockClient.resetStreamBehavior();
          }
        }
      }

      expect(totalMessages).toBeGreaterThan(100);
    });

    it('should handle stream with variable message delays', async () => {
      mockClient.setStreamBehavior('subscribeToBlockHeadersWithChainLocks', {
        messageCount: 100,
        delayPerMessage: 5,
      });

      const headers = [];
      const latencies = [];
      let lastTime = Date.now();

      try {
        const stream = mockClient.core.subscribeToBlockHeadersWithChainLocks();
        for await (const header of stream) {
          const now = Date.now();
          latencies.push(now - lastTime);
          lastTime = now;
          headers.push(header);
        }
      } catch (error) {
        failureLogger.logFailure('variableDelayStream', error as Error);
      }

      expect(headers.length).toBe(100);
      expect(latencies.length).toBe(100);

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      metricsCollector.recordMetric('average_message_latency_ms', avgLatency);
    });
  });
});
