/**
 * TransactionStatusPoller
 *
 * Polls DAPI getTransaction() for each tracked txid to detect
 * InstantLock and ChainLock status via boolean flags.
 *
 * This provides reliable IS/CL detection independent of stream liveness.
 * The DAPI stream delivers ephemeral IS messages that are lost if the
 * stream stales before they arrive. Polling getTransaction() returns
 * persistent boolean flags (isInstantLocked, isChainLocked) that remain
 * true even after the original IS/CL messages have passed.
 *
 * Note: getTransaction() does NOT return raw IS proof bytes.
 * The instantLockHex field is only available from stream-based IS messages.
 */

import { TransactionTracker } from './TransactionTracker.js';
import { DAPIClientLike } from '../types/index.js';
import { Logger, createLogger } from '../utils/logger.js';

const MIN_POLL_INTERVAL_MS = 1000;
const DEFAULT_POLL_INTERVAL_MS = 2000;

export interface TransactionStatusPollerCallbacks {
  onInstantLock: (txid: string, timestamp: number) => void;
  onChainLock: (txid: string, timestamp: number) => void;
}

export class TransactionStatusPoller {
  private dapiClient: DAPIClientLike;
  private tracker: TransactionTracker;
  private callbacks: TransactionStatusPollerCallbacks;
  private pollIntervalMs: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private logger: Logger;

  constructor(
    dapiClient: DAPIClientLike,
    tracker: TransactionTracker,
    callbacks: TransactionStatusPollerCallbacks,
    pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS
  ) {
    this.dapiClient = dapiClient;
    this.tracker = tracker;
    this.callbacks = callbacks;
    this.pollIntervalMs = Math.max(MIN_POLL_INTERVAL_MS, pollIntervalMs);
    this.logger = createLogger('TransactionStatusPoller');
  }

  /**
   * Start polling for transaction status updates
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.logger.info(`Transaction status poller started (interval: ${this.pollIntervalMs}ms)`);

    this.pollTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.poll();
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stop polling
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.logger.info('Transaction status poller stopped');
  }

  /**
   * Check if poller is running
   */
  running(): boolean {
    return this.isRunning;
  }

  /**
   * Poll getTransaction() for each tracked txid that hasn't reached chainlocked status.
   * Calls are made serially to avoid bursting DAPI with concurrent requests.
   * Can be called directly for manual/test usage, or automatically via setInterval.
   */
  async poll(): Promise<void> {
    const allTxs = this.tracker.getAllTransactions();

    for (const tx of allTxs) {
      // Allow stop() to abort a poll cycle in progress
      if (this.pollTimer !== null && !this.isRunning) {
        break;
      }

      // Skip transactions that are already fully confirmed
      if (tx.status === 'chainlocked') {
        continue;
      }

      try {
        const response = await this.dapiClient.core.getTransaction(tx.txid);
        if (!response) {
          continue;
        }

        const timestamp = Date.now();

        // Handle both accessor methods and plain properties
        const isIL = typeof response.isInstantLocked === 'function'
          ? response.isInstantLocked()
          : response.isInstantLocked;

        const isCL = typeof response.isChainLocked === 'function'
          ? response.isChainLocked()
          : response.isChainLocked;

        // Check InstantLock — only fire if not already recorded
        if (isIL && !tx.instantLockTime) {
          const wasNew = this.tracker.recordInstantLock(tx.txid, timestamp);
          if (wasNew) {
            this.logger.debug(`Polling detected IS for ${tx.txid}`);
            this.callbacks.onInstantLock(tx.txid, timestamp);
          }
        }

        // Check ChainLock — only fire if not already recorded
        if (isCL && !tx.chainLockTime) {
          const wasNew = this.tracker.recordChainLockByTxid(tx.txid, timestamp);
          if (wasNew) {
            this.logger.debug(`Polling detected CL for ${tx.txid}`);
            this.callbacks.onChainLock(tx.txid, timestamp);
          }
        }
      } catch (error) {
        // Per-txid errors are non-fatal — retried on next poll cycle
        this.logger.debug(
          `Failed to poll status for ${tx.txid}: ${(error as Error).message}`
        );
      }
    }
  }
}
