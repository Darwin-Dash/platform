/**
 * WASM Concurrency Diagnostic Test Framework
 *
 * This framework isolates and reproduces WASM "already locked to a reader" errors
 * across different architectural patterns to identify viable solutions.
 */
import { createLogger } from '../../../src/identities/utils/identity-logger.js';
import { TestResultLogger } from './result-logger.js';
const logger = createLogger('WasmDiagnostics');
/**
 * Base diagnostic test runner
 */
export class WasmConcurrencyDiagnosticRunner {
    resultLogger;
    testIdentityId = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk'; // Known testnet identity
    constructor(outputDir = './test-results/wasm-diagnostics') {
        this.resultLogger = new TestResultLogger(outputDir);
    }
    /**
     * Run a diagnostic test case
     */
    async runTestCase(config, sdk) {
        logger.info(`Starting diagnostic test: ${config.name}`);
        const testStartTime = Date.now();
        const operationResults = [];
        let lockDetected = false;
        let firstLockAtOperation = -1;
        try {
            if (config.parallelism === 'sequential') {
                // Execute operations one at a time
                for (let i = 0; i < config.operationSequence.length; i++) {
                    const opType = config.operationSequence[i];
                    const result = await this.executeOperation(opType, sdk, config, i);
                    operationResults.push(result);
                    if (result.lockDetected && !lockDetected) {
                        lockDetected = true;
                        firstLockAtOperation = i;
                    }
                    // Reset WASM between operations if configured
                    if (config.resetWasmBetweenOps && i < config.operationSequence.length - 1) {
                        await this.resetWasm(sdk);
                    }
                    // Create new SDK between operations if configured
                    if (config.createNewSdkBetweenOps && i < config.operationSequence.length - 1) {
                        // This would require SDK recreation - handled by caller
                        logger.debug('Note: SDK recreation not handled in base runner');
                    }
                }
            }
            else if (config.parallelism === 'concurrent') {
                // Execute all operations in parallel
                const promises = config.operationSequence.map((opType, index) => this.executeOperation(opType, sdk, config, index));
                const results = await Promise.allSettled(promises);
                for (const result of results) {
                    if (result.status === 'fulfilled') {
                        operationResults.push(result.value);
                        if (result.value.lockDetected && !lockDetected) {
                            lockDetected = true;
                            firstLockAtOperation = operationResults.length - 1;
                        }
                    }
                    else {
                        lockDetected = true;
                        operationResults.push({
                            operationIndex: operationResults.length,
                            operationType: config.operationSequence[operationResults.length] || 'unknown',
                            success: false,
                            duration: 0,
                            error: String(result.reason),
                            lockDetected: true
                        });
                    }
                }
            }
        }
        catch (error) {
            logger.error(`Test case failed: ${config.name}`, error);
            lockDetected = true;
        }
        const testDuration = Date.now() - testStartTime;
        const successCount = operationResults.filter(r => r.success).length;
        const testResult = {
            testCase: config.name,
            description: config.description,
            scenario: JSON.stringify({
                operationSequence: config.operationSequence,
                parallelism: config.parallelism,
                useWorker: config.useWorker,
                workerStrategy: config.workerStrategy,
                poolSize: config.poolSize,
                resetWasmBetweenOps: config.resetWasmBetweenOps,
                createNewSdkBetweenOps: config.createNewSdkBetweenOps
            }),
            operationCount: config.operationSequence.length,
            successCount,
            failureCount: operationResults.length - successCount,
            firstLockAtOperation: lockDetected ? firstLockAtOperation : null,
            totalExecutionTime: testDuration,
            lockError: lockDetected,
            lockErrorMessage: operationResults.find(r => r.error)?.error || null,
            workerSpawned: config.useWorker,
            wasmInitialized: true,
            resetWasmCalled: config.resetWasmBetweenOps || false,
            timestamp: new Date().toISOString(),
            operationDetails: operationResults
        };
        // Log results
        await this.resultLogger.logResult(testResult);
        logger.info(`Test complete: ${config.name} - ${successCount}/${config.operationSequence.length} succeeded`);
        return testResult;
    }
    /**
     * Execute a single operation
     */
    async executeOperation(operationType, sdk, config, index) {
        const opStartTime = Date.now();
        const operation = {
            operationIndex: index,
            operationType,
            success: false,
            duration: 0,
            wasmState: 'initialized'
        };
        try {
            switch (operationType) {
                case 'fetch':
                    await sdk.identities.fetch(this.testIdentityId);
                    break;
                case 'fetch-with-proof':
                    await sdk.identities.fetchWithProof(this.testIdentityId);
                    break;
                case 'fetch-unproved':
                    await sdk.identities.fetchUnproved(this.testIdentityId);
                    break;
                case 'getKeys':
                    await sdk.identities.getKeys({
                        identityId: this.testIdentityId,
                        keyRequestType: 'all',
                        limit: 10
                    });
                    break;
                default:
                    throw new Error(`Unknown operation type: ${operationType}`);
            }
            operation.success = true;
            operation.duration = Date.now() - opStartTime;
        }
        catch (error) {
            const errorMessage = String(error);
            operation.success = false;
            operation.duration = Date.now() - opStartTime;
            operation.error = errorMessage;
            operation.lockDetected = errorMessage.includes('already locked to a reader');
            operation.wasmState = 'error';
        }
        return operation;
    }
    /**
     * Reset WASM SDK
     */
    async resetWasm(sdk) {
        try {
            await sdk.resetWasmSdk();
            logger.debug('WASM reset successful');
        }
        catch (error) {
            logger.warn('WASM reset failed:', error);
        }
    }
    /**
     * Get result logger for custom result handling
     */
    getResultLogger() {
        return this.resultLogger;
    }
}
