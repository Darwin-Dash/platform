/**
 * Dual-Mode WASM Worker Runner
 *
 * Spawns child processes (Node.js) or Web Workers (browser) to run WASM SDK operations
 * in isolation, preventing "already locked to a reader" errors from Rust mutex conflicts.
 *
 * Usage:
 *   const result = await runWasmOperation('identity-topup', params, options);
 */

// Declare process for Node.js environment (TypeScript compatibility)
declare const process: { env: { [key: string]: string | undefined }; versions?: { node?: string } };
declare const window: any;

// Operation type definitions
export type WasmOperationType =
  | 'identity-create'
  | 'identity-topup'
  | 'identity-discover'
  | 'identity-update'
  | 'credit-transfer'
  | 'credit-withdrawal'
  | 'identity-fetch'
  | 'identity-fetch-with-proof'
  | 'identity-fetch-unproved'
  | 'identity-get-keys';

export interface TransactionData {
  transactionId: string;
  transactionHex: string;
  instantLockHex: string | null;
  coreChainLockedHeight: number | null;
  proofType: 'instant' | 'chain';
}

export interface WasmWorkerOptions {
  timeout?: number;
  network?: 'mainnet' | 'testnet';
  logs?: string; // WASM SDK logging: 'off' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
}

export interface WasmOperationParams {
  [key: string]: any;
}

export interface WorkerMessage {
  operation: WasmOperationType;
  params: WasmOperationParams;
  network: string;
  logs?: string;
}

export interface WorkerResponse {
  success: boolean;
  result?: any;
  error?: string;
  stack?: string;
}

/**
 * Detect if running in Node.js environment
 */
function isNodeEnvironment(): boolean {
  return typeof window === 'undefined' && typeof process !== 'undefined' && Boolean(process.versions?.node);
}

/**
 * Run WASM operation in Node.js child process
 */
async function runNodeWorker<T = any>(
  operation: WasmOperationType,
  params: WasmOperationParams,
  options: WasmWorkerOptions
): Promise<T> {
  // Use dynamic import for Node.js modules to maintain ES module compatibility
  // @ts-ignore - Node.js built-in module
  const { createRequire } = await import('module');
  // @ts-ignore - import.meta.url is valid in ES modules
  const require = createRequire(import.meta.url);
  const { fork } = require('child_process');
  const path = require('path');
  // @ts-ignore - Node.js built-in url module
  const { fileURLToPath } = await import('url');

  // Get current file directory
  // @ts-ignore - import.meta.url is valid in ES modules
  const __filename = fileURLToPath(import.meta.url);
  const __dirname_local = path.dirname(__filename);

  // Worker path resolution:
  // From dist: dist/identities/utils/ → dist/ → packages/js-evo-sdk/ → workers/
  // From src: src/identities/utils/ → src/ → packages/js-evo-sdk/ → workers/
  // Go up 3 levels from current directory to reach package root
  const workerPath = path.join(__dirname_local, '..', '..', '..', 'workers', 'wasm-operations.js');

  const timeout = options.timeout || 180000; // 3 minutes default
  const network = options.network || 'testnet';
  const logs = options.logs; // Optional WASM SDK logging

  return new Promise<T>((resolve, reject) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DEBUG] Spawning WASM worker for operation: ${operation}`);
    }
    const worker = fork(workerPath);

    const timeoutHandle = setTimeout(() => {
      worker.kill();
      reject(new Error(`Worker timeout after ${timeout}ms for operation: ${operation}`));
    }, timeout);

    worker.on('message', (msg: WorkerResponse) => {
      clearTimeout(timeoutHandle);
      if (msg.success) {
        resolve(msg.result as T);
      } else {
        reject(new Error(`Worker failed: ${msg.error}`));
      }
    });

    worker.on('error', (error: Error) => {
      clearTimeout(timeoutHandle);
      reject(new Error(`Worker process error: ${error.message}`));
    });

    worker.on('exit', (code: number | null) => {
      clearTimeout(timeoutHandle);
      if (code !== 0 && code !== null) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });

    // Send operation request to worker
    const message: WorkerMessage = {
      operation,
      params,
      network,
      logs
    };

    worker.send(message);
  });
}

/**
 * Run WASM operation in Web Worker (browser environment)
 * Creates or reuses Web Worker to execute operation in isolation
 */
async function runWebWorker<T = any>(
  operation: WasmOperationType,
  params: WasmOperationParams,
  options: WasmWorkerOptions
): Promise<T> {
  // Determine worker script URL
  // In browser, we can access the worker from the dist directory
  // The path depends on how the app is served, but typically:
  // - dist/web-worker.js is the bundled worker
  // - Current page location: index.html (or in subdirectory)

  // Get the base URL for the worker script
  // If served from root: /dist/web-worker.js
  // If served from /demo: /dist/web-worker.js (relative to root)
  const workerScriptUrl = new URL('/dist/web-worker.js', location.origin).href;

  const timeout = options.timeout || 180000; // 3 minutes default
  const network = options.network || 'testnet';
  const logs = options.logs; // Optional WASM SDK logging

  return new Promise<T>((resolve, reject) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DEBUG] Creating Web Worker for operation: ${operation}`);
      console.log(`[DEBUG] Worker URL: ${workerScriptUrl}`);
    }

    let worker: Worker;
    try {
      // Create Web Worker with ES module support
      worker = new Worker(workerScriptUrl, { type: 'module' });
    } catch (error) {
      reject(
        new Error(
          `Failed to create Web Worker: ${error instanceof Error ? error.message : String(error)}. ` +
          `Ensure web-worker.js is built and accessible at ${workerScriptUrl}`
        )
      );
      return;
    }

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Worker timeout after ${timeout}ms for operation: ${operation}`));
    }, timeout);

    // Handle messages from worker
    worker.onmessage = (event: MessageEvent) => {
      clearTimeout(timeoutHandle);
      const msg = event.data as WorkerResponse;

      if (msg.success) {
        worker.terminate();
        resolve(msg.result as T);
      } else {
        worker.terminate();
        reject(new Error(`Worker failed: ${msg.error}`));
      }
    };

    // Handle worker errors
    worker.onerror = (error: ErrorEvent) => {
      clearTimeout(timeoutHandle);
      worker.terminate();
      reject(
        new Error(
          `Worker process error: ${error.message || error.error?.message || 'Unknown error'}`
        )
      );
    };

    // Send operation request to worker
    const message: WorkerMessage = {
      operation,
      params,
      network,
      logs
    };

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DEBUG] Sending message to Web Worker:`, message);
    }

    worker.postMessage(message);
  });
}

/**
 * Run a WASM SDK operation in an isolated worker process (Node.js) or Web Worker (browser)
 *
 * @param operation - Operation type to run
 * @param params - Operation-specific parameters
 * @param options - Worker options (timeout, network)
 * @returns Promise that resolves to operation result
 * @throws Error if worker fails or times out
 */
export async function runWasmOperation<T = any>(
  operation: WasmOperationType,
  params: WasmOperationParams,
  options: WasmWorkerOptions = {}
): Promise<T> {
  if (isNodeEnvironment()) {
    // Node.js: Use child_process fork
    return runNodeWorker<T>(operation, params, options);
  } else {
    // Browser: Use Web Worker (Phase 2)
    return runWebWorker<T>(operation, params, options);
  }
}

/**
 * Run a batch of WASM SDK operations in a single persistent worker
 * Spawns ONE worker that processes all operations sequentially
 * Major optimization: Prefetch happens once instead of per-operation
 *
 * @param operation - Operation type to run
 * @param paramsArray - Array of operation parameters (one per operation)
 * @param options - Worker options (timeout applies PER operation, not total)
 * @returns Promise that resolves to array of operation results
 * @throws Error if worker fails or any operation times out
 */
export async function runBatchWasmOperation<T = any>(
  operation: WasmOperationType,
  paramsArray: WasmOperationParams[],
  options: WasmWorkerOptions = {}
): Promise<T[]> {
  if (!paramsArray || paramsArray.length === 0) {
    return [];
  }

  if (!isNodeEnvironment()) {
    throw new Error('Batch WASM operations are not supported in browser environment');
  }

  // Use dynamic import for Node.js modules
  // @ts-ignore - Node.js built-in module
  const { createRequire } = await import('module');
  // @ts-ignore - import.meta.url is valid in ES modules
  const require = createRequire(import.meta.url);
  const { fork } = require('child_process');
  const path = require('path');
  // @ts-ignore - Node.js built-in url module
  const { fileURLToPath } = await import('url');

  // Get worker path
  // @ts-ignore - import.meta.url is valid in ES modules
  const __filename = fileURLToPath(import.meta.url);
  const __dirname_local = path.dirname(__filename);
  // Go up 3 levels from current directory to reach package root
  const workerPath = path.join(__dirname_local, '..', '..', '..', 'workers', 'wasm-operations.js');

  const timeout = options.timeout || 180000; // Timeout per operation
  const network = options.network || 'testnet';
  const logs = options.logs;

  return new Promise<T[]>((resolve, reject) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DEBUG] Spawning BATCH WASM worker for ${paramsArray.length} ${operation} operations`);
    }

    const worker = fork(workerPath);

    // Total timeout: per-operation timeout × number of operations + 10s buffer
    const totalTimeout = (timeout * paramsArray.length) + 10000;
    const timeoutHandle = setTimeout(() => {
      worker.kill();
      reject(new Error(`Batch worker timeout after ${totalTimeout}ms for ${paramsArray.length} operations`));
    }, totalTimeout);

    worker.on('message', (msg: WorkerResponse) => {
      clearTimeout(timeoutHandle);
      if (msg.success) {
        resolve(msg.result as T[]);
      } else {
        reject(new Error(`Batch worker failed: ${msg.error}`));
      }
    });

    worker.on('error', (error: Error) => {
      clearTimeout(timeoutHandle);
      reject(new Error(`Batch worker process error: ${error.message}`));
    });

    worker.on('exit', (code: number | null) => {
      clearTimeout(timeoutHandle);
      if (code !== 0 && code !== null) {
        reject(new Error(`Batch worker exited with code ${code}`));
      }
    });

    // Send batch operation request to worker
    const message: any = {
      operation,
      batch: true,
      paramsArray,
      network,
      logs
    };

    worker.send(message);
  });
}
