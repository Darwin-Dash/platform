/**
 * WASM Operation Queue - Serializes WASM operations to prevent mutex conflicts
 *
 * The WASM SDK has a global mutex that only allows one operation at a time.
 * This queue ensures operations execute sequentially, preventing "already locked" errors.
 *
 * Architecture:
 * - Single FIFO queue for all WASM operations
 * - Operations are enqueued and processed sequentially
 * - Maintains order and prevents concurrent WASM execution
 * - Handles errors gracefully and continues processing
 *
 * Usage:
 * ```typescript
 * import { wasmOperationQueue } from './utils/wasm-operation-queue.js';
 *
 * const result = await wasmOperationQueue.enqueue(async () => {
 *   // WASM operation here (e.g., identity creation)
 *   return wasmSdk.identityCreate(...);
 * });
 * ```
 */

interface QueuedOperation<T> {
  id: string;
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
  startTime?: number;
  endTime?: number;
}

export class WAsmOperationQueue {
  private queue: QueuedOperation<any>[] = [];
  private processing = false;
  private processedCount = 0;
  private failedCount = 0;
  private totalWaitTime = 0;

  /**
   * Enqueue an operation for execution
   * @param operation Async function to execute
   * @returns Promise that resolves when operation completes
   */
  async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const queued: QueuedOperation<T> = { id, operation, resolve, reject };

      this.queue.push(queued);

      // Start processing if not already running
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const queued = this.queue.shift()!;
      const waitTime = Date.now();
      queued.startTime = waitTime;

      try {
        const result = await queued.operation();
        queued.endTime = Date.now();
        this.totalWaitTime += queued.endTime - waitTime;
        this.processedCount++;
        queued.resolve(result);
      } catch (error) {
        queued.endTime = Date.now();
        this.totalWaitTime += queued.endTime - waitTime;
        this.failedCount++;
        queued.reject(error);
      }
    }

    this.processing = false;
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queueLength: number;
    processing: boolean;
    processedCount: number;
    failedCount: number;
    averageWaitTime: number;
  } {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      averageWaitTime: this.processedCount > 0 ? this.totalWaitTime / this.processedCount : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.processedCount = 0;
    this.failedCount = 0;
    this.totalWaitTime = 0;
  }
}

/**
 * Singleton instance of the WASM operation queue
 * Use this throughout the SDK for all WASM operations
 */
export const wasmOperationQueue = new WAsmOperationQueue();

export default wasmOperationQueue;
