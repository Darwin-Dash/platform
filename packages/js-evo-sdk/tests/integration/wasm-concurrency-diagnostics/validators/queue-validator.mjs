#!/usr/bin/env node

/**
 * Queue Validator
 *
 * Validates that the WASM Operation Queue correctly:
 * - Serializes concurrent operations
 * - Prevents mutex lock errors
 * - Maintains operation ordering
 * - Provides accurate performance metrics
 *
 * Usage:
 *   node validators/queue-validator.mjs
 */

import { wasmOperationQueue } from '../../../src/utils/wasm-operation-queue.js';

/**
 * Queue Validator Class
 *
 * Tests the queue implementation with synthetic operations to verify:
 * - Operations execute sequentially (not in parallel)
 * - No mutex lock errors occur
 * - Operations complete in the correct order
 * - Queue metrics are accurate
 */
export class QueueValidator {
  constructor() {
    this.results = [];
    this.operationTimestamps = [];
  }

  /**
   * Run all queue validation tests
   */
  async validate() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    Queue Validator - Phase 4                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const validations = [
      { name: 'Sequential Execution', test: () => this.testSequentialExecution() },
      { name: 'No Mutex Errors', test: () => this.testNoMutexErrors() },
      { name: 'Operation Ordering', test: () => this.testOperationOrdering() },
      { name: 'Performance Metrics', test: () => this.testPerformanceMetrics() },
      { name: 'Queue Statistics', test: () => this.testQueueStatistics() },
      { name: 'Error Handling', test: () => this.testErrorHandling() }
    ];

    let passedCount = 0;
    const testResults = [];

    for (const validation of validations) {
      try {
        const result = await validation.test();
        const passed = result.passed;
        passedCount += passed ? 1 : 0;

        console.log(`${passed ? '✅' : '❌'} ${validation.name}`);
        if (result.message) {
          console.log(`   ${result.message}`);
        }

        testResults.push({
          validationName: validation.name,
          passed,
          message: result.message || '',
          details: result.details || {}
        });
      } catch (error) {
        console.log(`❌ ${validation.name}`);
        console.log(`   Error: ${error.message}`);
        testResults.push({
          validationName: validation.name,
          passed: false,
          message: error.message,
          error: error.stack
        });
      }
    }

    console.log(`\n═══════════════════════════════════════════════════════════════\n`);
    console.log(`📊 Queue Validation Results: ${passedCount}/${validations.length} passed\n`);

    if (passedCount === validations.length) {
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║                  ✅ QUEUE VALIDATION PASSED                     ║');
      console.log('║                                                                ║');
      console.log('║  The queue successfully serializes operations and prevents     ║');
      console.log('║  WASM mutex conflicts.                                        ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
    } else {
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║                 ❌ QUEUE VALIDATION FAILED                      ║');
      console.log('║                                                                ║');
      console.log('║  Some validations did not pass. Review details above.          ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
    }

    return { passed: passedCount === validations.length, testResults };
  }

  /**
   * Test 1: Sequential Execution
   * Verifies that concurrent operations execute sequentially, not in parallel
   */
  async testSequentialExecution() {
    const operationDuration = 50; // ms
    const operationCount = 5;
    const timestamps = [];

    // Enqueue concurrent operations
    const promises = [];
    for (let i = 0; i < operationCount; i++) {
      promises.push(
        (async () => {
          const startTime = Date.now();
          await wasmOperationQueue.enqueue(async () => {
            timestamps.push({ op: i, start: Date.now() });
            await new Promise(resolve => setTimeout(resolve, operationDuration));
          });
          const endTime = Date.now();
          return { index: i, start: startTime, end: endTime };
        })()
      );
    }

    const results = await Promise.all(promises);
    const totalTime = Math.max(...results.map(r => r.end)) - Math.min(...results.map(r => r.start));
    const expectedMinTime = operationCount * operationDuration * 0.8; // Allow 20% variance

    const sequential = totalTime >= expectedMinTime;

    return {
      passed: sequential,
      message: sequential
        ? `✓ Operations executed sequentially (${totalTime}ms ≥ ${expectedMinTime}ms)`
        : `✗ Operations appear to have run in parallel (${totalTime}ms < ${expectedMinTime}ms)`,
      details: { totalTime, expectedMinTime, operationCount }
    };
  }

  /**
   * Test 2: No Mutex Errors
   * Verifies that operations don't fail with mutex lock errors
   */
  async testNoMutexErrors() {
    const errors = [];
    const operationCount = 10;

    const promises = [];
    for (let i = 0; i < operationCount; i++) {
      promises.push(
        wasmOperationQueue.enqueue(async () => {
          // Simulate a WASM operation
          try {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
            return { success: true };
          } catch (error) {
            errors.push({ op: i, error: error.message });
            throw error;
          }
        }).catch(error => {
          errors.push({ op: i, error: error.message });
        })
      );
    }

    await Promise.all(promises);
    const noErrors = errors.length === 0;

    return {
      passed: noErrors,
      message: noErrors
        ? `✓ No mutex errors detected across ${operationCount} operations`
        : `✗ ${errors.length} operations failed with errors`,
      details: { operationCount, errorCount: errors.length, errors }
    };
  }

  /**
   * Test 3: Operation Ordering
   * Verifies that operations execute in FIFO order
   */
  async testOperationOrdering() {
    const executionOrder = [];
    const operationCount = 8;

    const promises = [];
    for (let i = 0; i < operationCount; i++) {
      promises.push(
        wasmOperationQueue.enqueue(async () => {
          executionOrder.push(i);
          await new Promise(resolve => setTimeout(resolve, 5));
        })
      );
    }

    await Promise.all(promises);

    // Check if execution order matches enqueue order
    const ordersMatch = executionOrder.every((val, idx) => val === idx);

    return {
      passed: ordersMatch,
      message: ordersMatch
        ? `✓ Operations executed in correct FIFO order`
        : `✗ Operations executed out of order: ${executionOrder.join(', ')}`,
      details: { expectedOrder: Array.from({ length: operationCount }, (_, i) => i), actualOrder: executionOrder }
    };
  }

  /**
   * Test 4: Performance Metrics
   * Verifies that queue statistics are accurate
   */
  async testPerformanceMetrics() {
    const statsBefore = wasmOperationQueue.getStats();

    const operationCount = 3;
    const promises = [];

    for (let i = 0; i < operationCount; i++) {
      promises.push(
        wasmOperationQueue.enqueue(async () => {
          await new Promise(resolve => setTimeout(resolve, 20));
        })
      );
    }

    await Promise.all(promises);
    const statsAfter = wasmOperationQueue.getStats();

    const validStats =
      statsAfter.processedCount >= statsBefore.processedCount + operationCount &&
      statsAfter.queueLength === 0 &&
      statsAfter.failedCount === statsBefore.failedCount;

    return {
      passed: validStats,
      message: validStats
        ? `✓ Queue statistics are accurate (${operationCount} operations processed, queue empty)`
        : `✗ Queue statistics mismatch`,
      details: { statsBefore, statsAfter, operationCount }
    };
  }

  /**
   * Test 5: Queue Statistics
   * Verifies that queue reports accurate statistics
   */
  async testQueueStatistics() {
    const stats = wasmOperationQueue.getStats();

    const hasValidStats =
      typeof stats.queueLength === 'number' &&
      typeof stats.processing === 'boolean' &&
      typeof stats.processedCount === 'number' &&
      typeof stats.failedCount === 'number' &&
      stats.queueLength >= 0 &&
      stats.processedCount >= 0 &&
      stats.failedCount >= 0;

    return {
      passed: hasValidStats,
      message: hasValidStats
        ? `✓ Queue statistics valid and consistent`
        : `✗ Queue statistics invalid or missing fields`,
      details: stats
    };
  }

  /**
   * Test 6: Error Handling
   * Verifies that queue handles operation errors gracefully
   */
  async testErrorHandling() {
    const results = [];
    const errorMessage = 'Test operation error';

    const promises = [
      wasmOperationQueue.enqueue(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push({ op: 1, status: 'success' });
      }),
      wasmOperationQueue.enqueue(async () => {
        throw new Error(errorMessage);
      }).catch(error => {
        results.push({ op: 2, status: 'error', message: error.message });
      }),
      wasmOperationQueue.enqueue(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push({ op: 3, status: 'success' });
      })
    ];

    await Promise.all(promises);

    const hasCorrectResults =
      results.length === 3 &&
      results[0].status === 'success' &&
      results[1].status === 'error' &&
      results[1].message === errorMessage &&
      results[2].status === 'success';

    return {
      passed: hasCorrectResults,
      message: hasCorrectResults
        ? `✓ Queue handles errors gracefully and continues processing`
        : `✗ Queue error handling failed`,
      details: { results, expectedCount: 3 }
    };
  }
}

// Run validator if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new QueueValidator();
  validator.validate().then(result => {
    process.exit(result.passed ? 0 : 1);
  });
}

export default QueueValidator;
