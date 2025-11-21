import { createLogger } from './identity-logger.js';
import type { WalletAccount } from '../types/wallet-types.js';

const logger = createLogger('WalletCleanup');

// Declare process for Node.js environment (TypeScript compatibility)
declare const process: { env: { [key: string]: string | undefined } };

/**
 * Wallet Cleanup Utility
 *
 * Provides intelligent state-based waiting for wallet-lib background workers to complete,
 * replacing hard-coded delays with adaptive polling.
 */

/**
 * Wait for wallet-lib background workers to complete processing
 *
 * Polls worker state every 50ms until all workers finish execution or timeout occurs.
 * This prevents race conditions when transitioning from wallet operations to WASM SDK operations.
 *
 * @param account - wallet-lib Account instance with plugins.workers
 * @param maxWaitMs - Maximum time to wait in milliseconds (default: 3000ms)
 * @returns Promise that resolves when workers complete or timeout occurs
 *
 * @example
 * ```typescript
 * // After wallet operations, before WASM SDK
 * await waitForWalletCleanup(freshAccount, 3000);
 * ```
 */
export async function waitForWalletCleanup(
  account: WalletAccount,
  maxWaitMs: number = 3000
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 50; // Check every 50ms
  let iterationCount = 0;
  const maxIterations = Math.ceil(maxWaitMs / pollInterval);

  while (iterationCount < maxIterations) {
    // Check if any workers are currently executing
    let hasRunningWorkers = false;
    let runningWorkerNames: string[] = [];

    if (account && account.plugins && account.plugins.workers) {
      for (const workerName in account.plugins.workers) {
        const worker = account.plugins.workers[workerName];
        if (worker && worker.isWorkerRunning === true) {
          hasRunningWorkers = true;
          runningWorkerNames.push(workerName);
        }
      }
    }

    // If no workers running, cleanup complete
    if (!hasRunningWorkers) {
      const actualWaitTime = Date.now() - startTime;
      logger.debug(`Wallet cleanup complete (${actualWaitTime}ms, ${iterationCount} iterations)`);
      return;
    }

    // Log which workers are still running (debug only)
    if (iterationCount % 20 === 0) {
      logger.debug(`Waiting for workers to complete: ${runningWorkerNames.join(', ')} (${Date.now() - startTime}ms elapsed)`);
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    iterationCount++;
  }

  // Timeout reached - log warning but don't fail
  const totalWaitTime = Date.now() - startTime;
  logger.warn(`Wallet cleanup timeout after ${totalWaitTime}ms (max: ${maxWaitMs}ms) - proceeding anyway`);
}

/**
 * Check if wallet account has any running background workers
 *
 * @param account - wallet-lib Account instance
 * @returns true if any workers are currently executing, false otherwise
 */
export function hasRunningWorkers(account: WalletAccount): boolean {
  if (!account || !account.plugins || !account.plugins.workers) {
    return false;
  }

  for (const workerName in account.plugins.workers) {
    const worker = account.plugins.workers[workerName];
    if (worker && worker.isWorkerRunning === true) {
      return true;
    }
  }

  return false;
}

/**
 * Get list of currently running worker names
 *
 * @param account - wallet-lib Account instance
 * @returns Array of worker names currently executing
 */
export function getRunningWorkerNames(account: WalletAccount): string[] {
  const runningWorkers: string[] = [];

  if (!account || !account.plugins || !account.plugins.workers) {
    return runningWorkers;
  }

  for (const workerName in account.plugins.workers) {
    const worker = account.plugins.workers[workerName];
    if (worker && worker.isWorkerRunning === true) {
      runningWorkers.push(workerName);
    }
  }

  return runningWorkers;
}
