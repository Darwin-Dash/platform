/**
 * Browser Web Worker for WASM Operations
 *
 * Runs WASM SDK operations in isolated Web Worker context to prevent mutex lock conflicts.
 * Mirrors the Node.js worker architecture but uses postMessage() for IPC.
 */

// Import operation handlers
import { operations } from './operations/index.js';

/**
 * Handle messages from main thread
 */
self.addEventListener('message', async (event) => {
  try {
    const { operation, params, paramsArray, batch, network, logs } = event.data;

    // Check if this is a batch operation
    if (batch && Array.isArray(paramsArray)) {
      // BATCH MODE: Process multiple operations in single worker
      if (typeof console !== 'undefined' && console.log) {
        console.log(`[Web Worker] Received BATCH operation: ${operation} (${paramsArray.length} items)`);
        console.log(`[Web Worker] Network: ${network}`);
      }

      // Look up operation handler
      const operationHandler = operations[operation];
      if (!operationHandler) {
        throw new Error(
          `Unknown operation type: ${operation}. Available: ${Object.keys(operations).join(', ')}`
        );
      }

      // Dynamic imports happen at runtime, SDK and WASM are already bundled
      const { EvoSDK } = await import('../dist/sdk.js');
      const wasmModule = await import('../dist/sdk.js');

      // CRITICAL: Initialize WASM via SDK instance
      if (typeof console !== 'undefined' && console.log) {
        console.log('[Web Worker] Creating SDK instance for batch...');
      }

      // Create SDK instance ONCE
      const sdkOptions = { network: network || 'testnet', trusted: true };
      if (logs) {
        sdkOptions.logs = logs;
      }
      const sdk = new EvoSDK(sdkOptions);

      if (typeof console !== 'undefined' && console.log) {
        console.log('[Web Worker] SDK instance created for batch');
      }

      // Process all operations sequentially with SHARED SDK instance
      const results = [];
      for (let i = 0; i < paramsArray.length; i++) {
        const operationParams = paramsArray[i];

        if (typeof console !== 'undefined' && console.log && i % 10 === 0) {
          console.log(
            `[Web Worker] Batch progress: ${i}/${paramsArray.length} (${((i / paramsArray.length) * 100).toFixed(
              0
            )}%)`
          );
        }

        const result = await operationHandler(operationParams, sdk, wasmModule);
        results.push(result);
      }

      if (typeof console !== 'undefined' && console.log) {
        console.log(`[Web Worker] Batch complete: ${results.length} operations processed`);
      }

      // Cleanup ONCE at end
      await sdk.resetWasmSdk();

      // Send all results back to main thread
      self.postMessage({ success: true, result: results });

    } else {
      // SINGLE MODE: Original behavior
      if (typeof console !== 'undefined' && console.log) {
        console.log(`[Web Worker] Received operation: ${operation}`);
        console.log(`[Web Worker] Network: ${network}`);
        if (logs) {
          console.log(`[Web Worker] WASM logging: ${logs}`);
        }
      }

      // Look up operation handler
      const operationHandler = operations[operation];
      if (!operationHandler) {
        throw new Error(
          `Unknown operation type: ${operation}. Available: ${Object.keys(operations).join(', ')}`
        );
      }

      // Dynamic imports happen at runtime, SDK and WASM are already bundled
      const { EvoSDK } = await import('../dist/sdk.js');
      const wasmModule = await import('../dist/sdk.js');

      if (typeof console !== 'undefined' && console.log) {
        console.log('[Web Worker] Creating SDK instance...');
      }

      // Create SDK instance for this worker with optional logging
      const sdkOptions = { network: network || 'testnet', trusted: true };
      if (logs) {
        sdkOptions.logs = logs;
      }
      const sdk = new EvoSDK(sdkOptions);

      if (typeof console !== 'undefined' && console.log) {
        console.log('[Web Worker] SDK instance created');
      }

      // Execute operation with fresh WASM context
      // The SDK will handle the prefetch+build on its first getWasmSdkConnected() call
      const result = await operationHandler(params, sdk, wasmModule);

      if (typeof console !== 'undefined' && console.log) {
        console.log(`[Web Worker] Operation ${operation} completed successfully`);
      }

      // CRITICAL: Free WASM resources before exit
      if (typeof console !== 'undefined' && console.log) {
        console.log('[Web Worker] Cleaning up WASM resources...');
      }
      await sdk.resetWasmSdk();
      if (typeof console !== 'undefined' && console.log) {
        console.log('[Web Worker] WASM cleanup completed');
      }

      // Send success result back to main thread
      self.postMessage({ success: true, result });
    }

  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[Web Worker] Operation failed:', error?.message);
    }

    // Send error back to main thread
    self.postMessage({
      success: false,
      error: error?.message || String(error),
      stack: error?.stack
    });
  }
});

/**
 * Handle unexpected errors in worker
 */
self.addEventListener('error', (event) => {
  if (typeof console !== 'undefined' && console.error) {
    console.error('[Web Worker] Uncaught error:', event.message);
  }

  self.postMessage({
    success: false,
    error: event.message,
    stack: event.filename + ':' + event.lineno
  });
});

/**
 * Handle unhandled promise rejections
 */
self.addEventListener('unhandledrejection', (event) => {
  if (typeof console !== 'undefined' && console.error) {
    console.error('[Web Worker] Unhandled rejection:', event.reason?.message);
  }

  const errorMessage = event.reason?.message || String(event.reason);
  const errorStack = event.reason?.stack || '';

  self.postMessage({
    success: false,
    error: errorMessage,
    stack: errorStack
  });
});
