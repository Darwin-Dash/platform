/**
 * ChainLockHeightMonitor
 *
 * Polls Platform DAPI for the latest core chain locked height.
 * When new ChainLock height is detected, notifies TransactionTracker
 * to confirm all transactions in blocks up to that height.
 *
 * Uses Platform DAPI getEpochsInfo() endpoint which returns:
 * - Current epoch information
 * - Core blockchain sync status
 * - Core chain locked height (highest block confirmed by LLMQ)
 */

import { EventEmitter } from 'events';
import { TransactionTracker } from './TransactionTracker.js';
import { Logger, createLogger } from '../utils/logger.js';
import { DAPIClientLike } from '../types/index.js';

const CHAINLOCK_POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
const MIN_POLL_INTERVAL_MS = 1000; // Minimum to prevent DAPI abuse

export class ChainLockHeightMonitor extends EventEmitter {
  private dapiClient: DAPIClientLike;
  private tracker: TransactionTracker;
  private lastChainLockedHeight: number;
  private highWaterMark: number;
  private isRunning: boolean;
  private pollInterval: NodeJS.Timeout | null;
  private basePollIntervalMs: number;
  private currentPollIntervalMs: number;
  private maxPollIntervalMs: number;
  private adaptivePollingEnabled: boolean;
  private onChainLock?: (txids: string[], height: number) => void;
  private logger: Logger;
  private consecutiveFailures: number;
  private readonly MAX_CONSECUTIVE_FAILURES = 10;

  constructor(
    dapiClient: DAPIClientLike,
    tracker: TransactionTracker,
    onChainLock?: (txids: string[], height: number) => void,
    basePollIntervalMs: number = CHAINLOCK_POLL_INTERVAL_MS,
    maxPollIntervalMs: number = 30000,
    adaptivePolling: boolean = true
  ) {
    super();

    // Rate limiting validation
    if (basePollIntervalMs < MIN_POLL_INTERVAL_MS) {
      throw new Error(
        `Poll interval must be >= ${MIN_POLL_INTERVAL_MS}ms to prevent DAPI abuse. ` +
        `Got: ${basePollIntervalMs}ms`
      );
    }

    this.dapiClient = dapiClient;
    this.tracker = tracker;
    this.lastChainLockedHeight = 0;
    this.highWaterMark = 0;
    this.isRunning = false;
    this.pollInterval = null;
    this.basePollIntervalMs = basePollIntervalMs;
    this.currentPollIntervalMs = basePollIntervalMs;
    this.maxPollIntervalMs = maxPollIntervalMs;
    this.adaptivePollingEnabled = adaptivePolling;
    this.onChainLock = onChainLock;
    this.logger = createLogger('ChainLockHeightMonitor');
    this.consecutiveFailures = 0;
  }

  /**
   * Start monitoring ChainLock heights with retry logic
   * @param maxRetries Maximum retry attempts for initial connection (default: 5)
   */
  async start(maxRetries: number = 5): Promise<void> {
    this.isRunning = true;

    // Retry initial poll with exponential backoff
    let lastError: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.poll();

        this.logger.info('✅ ChainLock monitor started successfully');

        // Set up interval polling with current interval
        this.pollInterval = setInterval(async () => {
          if (this.isRunning) {
            await this.poll();
          }
        }, this.currentPollIntervalMs);

        return; // Success!
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries - 1) {
          const delay = 3000 * Math.pow(2, attempt); // 3s, 6s, 12s, 24s, 48s
          this.logger.warn(`⚠️  ChainLock monitor start failed (attempt ${attempt + 1}/${maxRetries}): ${(error as any).message}`);
          this.logger.warn(`   Retrying in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    // All retries exhausted - this is a CRITICAL FAILURE
    const errorMsg = `ChainLock monitor initialization failed after ${maxRetries} attempts: ${(lastError as any).message}`;
    this.logger.error('❌ CRITICAL:', errorMsg);
    throw new Error(errorMsg);
  }

  /**
   * Poll Platform DAPI for current ChainLock height
   */
  private async poll(): Promise<void> {
    try {
      // Use Platform DAPI getEpochsInfo to get core chain locked height
      const platform = (this.dapiClient as any).platform;
      if (!platform) {
        throw new Error('DAPI client does not have platform namespace');
      }

      const response = await platform.getEpochsInfo(0, 1, { prove: false });
      const metadata = response.getMetadata();
      const coreChainLockedHeight = metadata.getCoreChainLockedHeight();

      // Reset failure counter on success
      this.consecutiveFailures = 0;

      // CRITICAL: Monotonic high-water mark to handle stale DAPI nodes.
      // DAPI rotates between multiple nodes, some of which may be behind in sync.
      // This prevents ChainLock height from "jumping backwards" when we hit a stale node.
      // Example: Node A reports 1413589, Node B (stale) reports 1410263 - we keep 1413589.
      if (coreChainLockedHeight > this.highWaterMark) {
        this.highWaterMark = coreChainLockedHeight;
      } else if (coreChainLockedHeight < this.highWaterMark) {
        this.logger.debug(
          `📊 ChainLock poll: ${coreChainLockedHeight} (stale node, using high-water mark: ${this.highWaterMark})`
        );
      }

      this.logger.debug(`📊 ChainLock poll: ${coreChainLockedHeight} (high-water mark: ${this.highWaterMark})`);

      // Log when ChainLock height advances
      if (this.highWaterMark > this.lastChainLockedHeight) {
        this.logger.info(`🔗 New ChainLock height: ${this.highWaterMark}`);
        this.lastChainLockedHeight = this.highWaterMark;
      }

      // IMPORTANT: Always check for transactions that can be confirmed at current height.
      // This handles txs that were added to blocks AFTER we first observed this ChainLock height.
      // The tracker handles deduplication - it only marks a tx as chainlocked if !tx.chainLockTime.
      // Use highWaterMark instead of raw coreChainLockedHeight to avoid missing confirmations
      // when we hit a stale DAPI node.
      const timestamp = Date.now();
      const confirmedTxids = this.tracker.recordChainLock(this.highWaterMark, timestamp);

      if (confirmedTxids.length > 0) {
        this.logger.info(`🔗 ChainLock confirmed ${confirmedTxids.length} transaction(s) at height ${this.highWaterMark}`);
        this.logger.debug(`   Confirmed txids: ${confirmedTxids.join(', ')}`);

        // Notify callback
        if (this.onChainLock) {
          this.onChainLock(confirmedTxids, this.highWaterMark);
        }
      }

      // Adaptive polling: reduce interval on success
      this.adjustPollInterval();
    } catch (error) {
      this.consecutiveFailures++;

      this.logger.error(`❌ ChainLock poll failed (${this.consecutiveFailures}/${this.MAX_CONSECUTIVE_FAILURES}): ${(error as any).message}`);

      // Adaptive polling: increase interval on failure
      this.adjustPollInterval();

      // CRITICAL: If we hit the limit, this is a real problem
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        const criticalError = new Error(
          `ChainLock polling failed ${this.MAX_CONSECUTIVE_FAILURES} consecutive times - Platform DAPI unavailable`
        );

        this.logger.error('❌ CRITICAL FAILURE: ChainLock polling failed', this.MAX_CONSECUTIVE_FAILURES, 'consecutive times');
        this.logger.error('   Platform DAPI is unavailable - cannot confirm ChainLocks');

        this.emit('criticalFailure', criticalError);
        this.stop(); // Stop polling
        throw criticalError; // Propagate to caller
      }
    }
  }

  /**
   * Adjust polling interval based on success/failure (adaptive polling)
   * - On success: reduce to base interval
   * - On failure: increase interval (up to max)
   */
  private adjustPollInterval(): void {
    if (!this.adaptivePollingEnabled) {
      return; // Adaptive polling disabled
    }

    const oldInterval = this.currentPollIntervalMs;

    if (this.consecutiveFailures === 0) {
      // Success - reduce to base interval
      this.currentPollIntervalMs = this.basePollIntervalMs;
    } else {
      // Failure - increase interval exponentially
      // Formula: base * (2 ^ failures), capped at maxPollInterval
      const multiplier = Math.pow(2, Math.min(this.consecutiveFailures, 5));
      this.currentPollIntervalMs = Math.min(
        this.basePollIntervalMs * multiplier,
        this.maxPollIntervalMs
      );
    }

    // Restart interval if changed
    if (oldInterval !== this.currentPollIntervalMs && this.pollInterval) {
      this.logger.debug(`Adjusting poll interval: ${oldInterval}ms → ${this.currentPollIntervalMs}ms`);

      clearInterval(this.pollInterval);
      this.pollInterval = setInterval(async () => {
        if (this.isRunning) {
          await this.poll();
        }
      }, this.currentPollIntervalMs);
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Get current ChainLock height
   */
  getCurrentHeight(): number {
    return this.lastChainLockedHeight;
  }

  /**
   * Check if monitor is running
   */
  running(): boolean {
    return this.isRunning;
  }
}
