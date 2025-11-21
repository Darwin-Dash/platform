/**
 * Test Framework Extension for Queue + DAPI POC Testing
 *
 * Extends the base WasmConcurrencyDiagnosticRunner to support:
 * - Queue-based write operations (identity-create, identity-topup)
 * - DAPI-based read operations (identity-retrieve-dapi)
 * - Mixed Queue + DAPI scenarios
 *
 * Integrates seamlessly with existing test infrastructure
 */

import { createLogger } from '../../../dist/identities/utils/identity-logger.js';
import { TestResultLogger } from './result-logger.mjs';

const logger = createLogger('QueueDAPIRunner');

/**
 * Extended test runner for Queue + DAPI scenarios
 *
 * Adds support for:
 * - queue-write operations (enqueued via SDK facade)
 * - dapi-read operations (gRPC bypass)
 * - validation of queue serialization
 * - validation of DAPI concurrency
 */
export class QueueDAPITestRunner {
  constructor(outputDir = './test-results/wasm-diagnostics') {
    this.resultLogger = new TestResultLogger(outputDir);
    this.mnemonic = null;
    this.testParams = null;
  }

  /**
   * Initialize test runner with configuration
   *
   * @param mnemonic - Test mnemonic to use
   * @param testParams - Test parameters (amounts, timeouts, etc)
   */
  initialize(mnemonic, testParams = {}) {
    this.mnemonic = mnemonic;
    this.testParams = {
      createAmount: testParams.createAmount || 200000,
      topUpAmount: testParams.topUpAmount || 50000,
      dapiTimeout: testParams.dapiTimeout || 10000,
      ...testParams
    };
    logger.info('QueueDAPITestRunner initialized');
  }

  /**
   * Run a POC scenario
   *
   * @param scenario - POC scenario definition
   * @param sdk - EvoSDK instance
   * @returns {Promise<object>} Test result
   */
  async runScenario(scenario, sdk) {
    logger.info(`Starting POC scenario: ${scenario.name}`);

    const testStartTime = Date.now();
    const operationResults = [];
    let lockDetected = false;
    let firstLockAtOperation = -1;

    try {
      // Validate configuration
      if (!this.mnemonic) {
        throw new Error('Test runner not initialized. Call initialize(mnemonic, testParams) first.');
      }

      // Connect SDK if needed
      if (!sdk.isConnected) {
        await sdk.connect();
      }

      // Execute scenario based on type
      if (scenario.operationType === 'mixed') {
        // Mixed Queue + DAPI: Execute writes and reads concurrently
        const results = await this.executeMixedScenario(scenario, sdk);
        operationResults.push(...results);
      } else if (scenario.useQueue) {
        // Queue-based write operations: Execute concurrently (will be serialized by queue)
        const results = await this.executeQueueScenario(scenario, sdk);
        operationResults.push(...results);
      } else if (scenario.useDapi) {
        // DAPI read operations: Execute concurrently via gRPC
        const results = await this.executeDAPIScenario(scenario, sdk);
        operationResults.push(...results);
      }

      // Check for lock detection
      for (let i = 0; i < operationResults.length; i++) {
        const result = operationResults[i];
        if (result.lockDetected && !lockDetected) {
          lockDetected = true;
          firstLockAtOperation = i;
        }
      }
    } catch (error) {
      logger.error(`Scenario failed: ${scenario.name}`, error);
      lockDetected = true;

      operationResults.push({
        operationIndex: 0,
        operationType: 'unknown',
        success: false,
        duration: 0,
        error: error.message,
        lockDetected: true
      });
    }

    const testDuration = Date.now() - testStartTime;
    const successCount = operationResults.filter(r => r.success).length;

    const testResult = {
      testCase: scenario.name,
      description: scenario.description,
      scenario: JSON.stringify({
        operationType: scenario.operationType,
        operationCount: scenario.operationCount,
        parallelism: scenario.parallelism,
        useQueue: scenario.useQueue,
        useDapi: scenario.useDapi,
        expectedBehavior: scenario.expectedBehavior
      }),
      operationCount: scenario.operationCount || operationResults.length,
      successCount,
      failureCount: operationResults.length - successCount,
      firstLockAtOperation: lockDetected ? firstLockAtOperation : null,
      totalExecutionTime: testDuration,
      lockError: lockDetected,
      lockErrorMessage: operationResults.find(r => r.error)?.error || null,
      queueUsed: scenario.useQueue || false,
      dapiUsed: scenario.useDapi || false,
      timestamp: new Date().toISOString(),
      operationDetails: operationResults
    };

    // Log results
    await this.resultLogger.logResult(testResult);

    logger.info(`Scenario complete: ${scenario.name} - ${successCount}/${scenario.operationCount || operationResults.length} succeeded`);

    return testResult;
  }

  /**
   * Execute a queue-based write scenario
   *
   * All operations are called concurrently, but the queue serializes them
   *
   * @private
   */
  async executeQueueScenario(scenario, sdk) {
    const operationResults = [];
    const promises = [];

    // Spawn all operations concurrently (they'll be queued internally)
    for (let i = 0; i < scenario.operationCount; i++) {
      const promise = this.executeQueueOperation(scenario.operationType, sdk, i);
      promises.push(promise);
    }

    // Collect results
    const settled = await Promise.allSettled(promises);
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        operationResults.push(result.value);
      } else {
        operationResults.push({
          operationIndex: operationResults.length,
          operationType: scenario.operationType,
          success: false,
          duration: 0,
          error: String(result.reason),
          lockDetected: true
        });
      }
    }

    return operationResults;
  }

  /**
   * Execute a DAPI-based read scenario
   *
   * All operations execute concurrently via gRPC (no WASM blocking)
   *
   * @private
   */
  async executeDAPIScenario(scenario, sdk) {
    const operationResults = [];
    const promises = [];

    // Spawn all DAPI read operations concurrently
    for (let i = 0; i < scenario.operationCount; i++) {
      const promise = this.executeDAPIOperation(sdk, i);
      promises.push(promise);
    }

    // Collect results
    const settled = await Promise.allSettled(promises);
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        operationResults.push(result.value);
      } else {
        operationResults.push({
          operationIndex: operationResults.length,
          operationType: 'identity-retrieve-dapi',
          success: false,
          duration: 0,
          error: String(result.reason),
          lockDetected: false // DAPI doesn't use WASM locks
        });
      }
    }

    return operationResults;
  }

  /**
   * Execute a mixed Queue + DAPI scenario
   *
   * Writes are queued, reads execute concurrently in parallel
   *
   * @private
   */
  async executeMixedScenario(scenario, sdk) {
    const operationResults = [];

    // Fire both write and read operations at the same time (mixed execution)
    const writePromises = [];
    const readPromises = [];

    // Queue write operations
    for (let i = 0; i < scenario.writeOperations.count; i++) {
      const promise = this.executeQueueOperation(scenario.writeOperations.type, sdk, i);
      writePromises.push(promise);
    }

    // Fire DAPI read operations immediately (don't wait for writes)
    for (let i = 0; i < scenario.readOperations.count; i++) {
      const promise = this.executeDAPIOperation(sdk, i);
      readPromises.push(promise);
    }

    // Collect all results
    const allSettled = await Promise.allSettled([...writePromises, ...readPromises]);
    for (let i = 0; i < allSettled.length; i++) {
      const result = allSettled[i];
      if (result.status === 'fulfilled') {
        operationResults.push(result.value);
      } else {
        operationResults.push({
          operationIndex: i,
          operationType: i < writePromises.length ? scenario.writeOperations.type : scenario.readOperations.type,
          success: false,
          duration: 0,
          error: String(result.reason),
          lockDetected: i < writePromises.length // Only writes use WASM locks
        });
      }
    }

    return operationResults;
  }

  /**
   * Execute a single queue operation
   *
   * @private
   */
  async executeQueueOperation(operationType, sdk, index) {
    const opStartTime = Date.now();

    try {
      switch (operationType) {
        case 'identity-create':
          await sdk.identityCreate(
            this.mnemonic,
            this.testParams.createAmount
          );
          break;

        case 'identity-topup': {
          // For this POC, we'll use a test identity ID
          // In real scenarios, this would be discovered first
          const testIdentityId = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk';
          await sdk.identityTopUp(
            testIdentityId,
            this.testParams.topUpAmount,
            this.mnemonic
          );
          break;
        }

        default:
          throw new Error(`Unknown queue operation type: ${operationType}`);
      }

      const opDuration = Date.now() - opStartTime;
      return {
        operationIndex: index,
        operationType,
        success: true,
        duration: opDuration,
        lockDetected: false,
        startTime: opStartTime,
        endTime: Date.now()
      };
    } catch (error) {
      const opDuration = Date.now() - opStartTime;
      const errorMessage = error.message || String(error);

      // Detect mutex lock errors
      const lockDetected = errorMessage.includes('already locked') || errorMessage.includes('mutex');

      return {
        operationIndex: index,
        operationType,
        success: false,
        duration: opDuration,
        error: errorMessage,
        lockDetected,
        startTime: opStartTime,
        endTime: Date.now()
      };
    }
  }

  /**
   * Execute a single DAPI operation
   *
   * @private
   */
  async executeDAPIOperation(sdk, index) {
    const opStartTime = Date.now();

    try {
      // Execute DAPI read via SDK facade (no WASM involved)
      const identities = await sdk.getIdentitiesForMnemonic(this.mnemonic);

      const opDuration = Date.now() - opStartTime;
      return {
        operationIndex: index,
        operationType: 'identity-retrieve-dapi',
        success: true,
        duration: opDuration,
        lockDetected: false,
        identitiesFound: identities.length,
        startTime: opStartTime,
        endTime: Date.now()
      };
    } catch (error) {
      const opDuration = Date.now() - opStartTime;
      const errorMessage = error.message || String(error);

      return {
        operationIndex: index,
        operationType: 'identity-retrieve-dapi',
        success: false,
        duration: opDuration,
        error: errorMessage,
        lockDetected: false, // DAPI doesn't use WASM
        startTime: opStartTime,
        endTime: Date.now()
      };
    }
  }
}

export default QueueDAPITestRunner;
