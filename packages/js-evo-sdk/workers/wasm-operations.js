#!/usr/bin/env node

/**
 * Generic WASM Operations Worker
 *
 * Runs WASM SDK operations in isolated process to prevent mutex lock conflicts.
 * Supports multiple operation types through an operation registry.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import operation handlers
import { operations } from './operations/index.js';

process.on('message', async (msg) => {
  try {
    const { operation, params, paramsArray, batch, network, logs } = msg;

    // Check if this is a batch operation
    if (batch && Array.isArray(paramsArray)) {
      // BATCH MODE: Process multiple operations in sub-batches
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] Received BATCH operation: ${operation} (${paramsArray.length} items)`);
        console.log(`[Worker] Network: ${network}`);
      }

      // Look up operation handler
      const operationHandler = operations[operation];
      if (!operationHandler) {
        throw new Error(`Unknown operation type: ${operation}. Available: ${Object.keys(operations).join(', ')}`);
      }

      // Import EvoSDK and WASM module for batch operations
      const { EvoSDK } = await import(join(__dirname, '..', 'dist', 'sdk.js'));
      const wasmModule = await import(join(__dirname, '..', 'dist', 'wasm.js'));
      const { ensureInitialized: initWasm } = wasmModule;

      // Initialize WASM module once for the entire batch worker
      if (process.env.LOG_LEVEL === 'debug') {
        console.log('[Worker] Initializing WASM module for batch (without prefetch)...');
      }
      await initWasm();
      if (process.env.LOG_LEVEL === 'debug') {
        console.log('[Worker] WASM module initialized for batch');
      }

      // Process all operations with sub-batching to avoid mutex lock buildup
      // Each sub-batch gets a fresh SDK instance to prevent lock contention
      const SUB_BATCH_SIZE = 5;
      const results = [];

      for (let batchStartIdx = 0; batchStartIdx < paramsArray.length; batchStartIdx += SUB_BATCH_SIZE) {
        const batchEndIdx = Math.min(batchStartIdx + SUB_BATCH_SIZE, paramsArray.length);
        const subBatch = paramsArray.slice(batchStartIdx, batchEndIdx);

        if (process.env.LOG_LEVEL === 'debug') {
          console.log(`[Worker] Processing sub-batch: items ${batchStartIdx}-${batchEndIdx - 1}/${paramsArray.length}`);
        }

        // Create FRESH SDK instance for this sub-batch
        // This prevents mutex lock buildup from reusing the same SDK
        const sdkOptions = { network: network || 'testnet', trusted: true };
        if (logs) {
          sdkOptions.logs = logs;
        }
        const sdk = new EvoSDK(sdkOptions);

        // Process all items in this sub-batch with the fresh SDK
        for (let i = 0; i < subBatch.length; i++) {
          const operationParams = subBatch[i];
          const globalIdx = batchStartIdx + i;

          if (process.env.LOG_LEVEL === 'debug' && i === 0) {
            console.log(`[Worker] Sub-batch SDK instance created`);
          }

          const result = await operationHandler(operationParams, sdk, wasmModule);
          results.push(result);
        }

        // Cleanup SDK after sub-batch completes
        // This releases the Rust mutex locks created by this SDK instance
        await sdk.resetWasmSdk();

        if (process.env.LOG_LEVEL === 'debug') {
          console.log(`[Worker] Sub-batch complete: ${subBatch.length} operations processed`);
        }
      }

      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] Batch complete: ${results.length} total operations processed`);
      }

      // Send all results back to parent
      process.send({ success: true, result: results });
      process.exit(0);

    } else {
      // SINGLE MODE: Original behavior
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] Received operation: ${operation}`);
        console.log(`[Worker] Network: ${network}`);
        if (logs) {
          console.log(`[Worker] WASM logging: ${logs}`);
        }
      }

      // Look up operation handler
      const operationHandler = operations[operation];
      if (!operationHandler) {
        throw new Error(`Unknown operation type: ${operation}. Available: ${Object.keys(operations).join(', ')}`);
      }

      // Import EvoSDK and WASM module in worker process (fresh WASM memory)
      const { EvoSDK } = await import(join(__dirname, '..', 'dist', 'sdk.js'));
      const wasmModule = await import(join(__dirname, '..', 'dist', 'wasm.js'));
      const { ensureInitialized: initWasm } = wasmModule;

      // CRITICAL: Initialize WASM (NOT prefetch) to ensure __wbindgen_malloc is available
      // The prefetch methods (prefetchTrustedQuorumsTestnet) create global Rust mutex locks
      // that persist and conflict with later SDK initialization attempts.
      // We only need to initialize the WASM module itself, without prefetching.
      if (process.env.LOG_LEVEL === 'debug') {
        console.log('[Worker] Initializing WASM module (without prefetch)...');
      }
      await initWasm();
      if (process.env.LOG_LEVEL === 'debug') {
        console.log('[Worker] WASM module initialized');
      }

      // Create SDK instance for this worker with optional logging
      // Each worker process has its own WASM instance, so they can independently prefetch
      // and use trusted mode without mutex conflicts
      const sdkOptions = { network: network || 'testnet', trusted: true };
      if (logs) {
        sdkOptions.logs = logs;
      }
      const sdk = new EvoSDK(sdkOptions);

      if (process.env.LOG_LEVEL === 'debug') {
        console.log('[Worker] SDK instance created');
      }

      // CRITICAL: Connect SDK BEFORE running operations to complete prefetch + builder.build()
      // This ensures all WASM mutex locks are properly acquired and released before
      // any operation-specific WASM calls (like createAssetLockProof) are made.
      // Without this, static WASM functions may conflict with SDK connection.
      if (process.env.LOG_LEVEL === 'debug') {
        console.log('[Worker] Connecting SDK (prefetch + build)...');
      }
      await sdk.connect();
      if (process.env.LOG_LEVEL === 'debug') {
        console.log('[Worker] SDK connected');
      }

      // Execute operation with fully connected SDK
      // Pass network as 4th param for operations that need it
      const result = await operationHandler(params, sdk, wasmModule, network || 'testnet');

      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] Operation ${operation} completed successfully`);
      }

      // CRITICAL: Free WASM resources before exit
      if (process.env.LOG_LEVEL === 'debug') {
        console.log('[Worker] Cleaning up WASM resources...');
      }
      await sdk.resetWasmSdk();
      if (process.env.LOG_LEVEL === 'debug') {
        console.log('[Worker] WASM cleanup completed');
      }

      // Send success result back to parent
      process.send({ success: true, result });
      process.exit(0);
    }

  } catch (error) {
    // WASM throws strings, not Error objects, so handle both
    const errorMessage = typeof error === 'string' ? error : (error.message || String(error));
    const errorStack = typeof error === 'string' ? undefined : error.stack;

    console.error('[Worker] Operation failed:', errorMessage);

    // Send error back to parent
    process.send({
      success: false,
      error: errorMessage,
      stack: errorStack
    });
    process.exit(1);
  }
});

// Handle unexpected errors
process.on('uncaughtException', (error) => {
  console.error('[Worker] Uncaught exception:', error);
  process.send({
    success: false,
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('[Worker] Unhandled rejection:', error);
  process.send({
    success: false,
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
