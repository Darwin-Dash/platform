/**
 * ConfirmationTracker
 *
 * Standalone confirmation tracker for known transaction IDs.
 * No stream, no bloom filter — just polling.
 *
 * Use this when you already know the txid (e.g. asset lock confirmation)
 * and only need to wait for InstantLock / ChainLock status.
 *
 * Composes:
 * - TransactionStatusPoller (polls getTransaction per txid for IS/CL flags)
 * - ChainLockHeightMonitor (polls getEpochsInfo for chainLockHeight)
 * - TransactionTracker (state machine)
 */

import { TransactionTracker } from './TransactionTracker.js';
import { TransactionStatusPoller } from './TransactionStatusPoller.js';
import { ChainLockHeightMonitor } from './ChainLockHeightMonitor.js';
import { DAPIClientLike, TrackedTransaction } from '../types/index.js';
import { createLogger, Logger } from '../utils/logger.js';

export interface ConfirmationTrackerOptions {
  /** Transaction status poll interval in ms (default 2000, min 1000) */
  pollInterval?: number;
  /** ChainLock height poll interval in ms (default 5000) */
  chainLockPollInterval?: number;
}

export class ConfirmationTracker {
  private tracker: TransactionTracker;
  private poller: TransactionStatusPoller;
  private clMonitor: ChainLockHeightMonitor;
  private isRunning = false;
  private logger: Logger;

  // User callbacks
  private _onIS?: (txid: string, timestamp: number) => void;
  private _onCL?: (txid: string, timestamp: number) => void;

  constructor(dapiClient: DAPIClientLike, options?: ConfirmationTrackerOptions) {
    this.tracker = new TransactionTracker();
    this.logger = createLogger('ConfirmationTracker');

    this.poller = new TransactionStatusPoller(
      dapiClient,
      this.tracker,
      {
        onInstantLock: (txid, ts) => this._onIS?.(txid, ts),
        onChainLock: (txid, ts) => this._onCL?.(txid, ts),
      },
      options?.pollInterval ?? 2000
    );

    this.clMonitor = new ChainLockHeightMonitor(
      dapiClient,
      this.tracker,
      undefined,
      options?.chainLockPollInterval ?? 5000
    );
  }

  /**
   * Start both pollers
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    this.poller.start();

    try {
      await this.clMonitor.start();
    } catch (error) {
      this.logger.warn(
        'ChainLock monitor failed to start:',
        (error as Error).message
      );
      this.logger.warn('Continuing with InstantSend polling only');
    }
  }

  /**
   * Stop both pollers
   */
  stop(): void {
    this.isRunning = false;
    this.poller.stop();
    this.clMonitor.stop();
  }

  /**
   * Register a known txid for confirmation tracking
   */
  registerTransaction(txid: string): void {
    this.tracker.addBroadcast(txid);
  }

  /**
   * Get tracked transaction state
   */
  getTransaction(txid: string): TrackedTransaction | undefined {
    return this.tracker.getTransaction(txid);
  }

  /**
   * Get current ChainLock height
   */
  getChainLockHeight(): number {
    return this.clMonitor.getCurrentHeight();
  }

  /**
   * Check if tracker is running
   */
  running(): boolean {
    return this.isRunning;
  }

  /**
   * Register callback for InstantLock detection
   */
  onInstantLock(cb: (txid: string, timestamp: number) => void): void {
    this._onIS = cb;
  }

  /**
   * Register callback for ChainLock detection
   */
  onChainLock(cb: (txid: string, timestamp: number) => void): void {
    this._onCL = cb;
  }
}
