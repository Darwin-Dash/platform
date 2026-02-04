/**
 * RealtimeFinder - Real-time InstantSend/ChainLock monitoring
 *
 * Monitors addresses for incoming transactions and tracks confirmation
 * through InstantLock and ChainLock stages.
 *
 * Features:
 * - InstantLock detection (~1-3 seconds)
 * - ChainLock confirmation (~1-3 minutes)
 * - Periodic stream reconnection to catch missed transactions
 * - Two-phase grace period: HUNT (reconnect until tx found) → WAIT (pause for IS proof)
 * - Polling-based IS/CL fallback (TransactionStatusPoller)
 * - Transaction state tracking
 *
 * The DAPI subscribeToTransactionsWithProofs stream only bloom-filter-tests
 * block transactions on the first block after connection. For subsequent blocks,
 * if the internal ZMQ rawtx event was missed, the transaction is silently dropped.
 * Periodic reconnection forces the server to re-run its historical + mempool scan,
 * catching anything missed in continuous mode.
 */

import { EventEmitter } from 'events';
import { BloomFilterBuilder } from '../core/BloomFilterBuilder.js';
import { StreamWrapper } from '../core/StreamWrapper.js';
import { TransactionTracker } from '../monitoring/TransactionTracker.js';
import { ChainLockHeightMonitor } from '../monitoring/ChainLockHeightMonitor.js';
import { TransactionStatusPoller } from '../monitoring/TransactionStatusPoller.js';
import {
  RealtimeFinderConfig,
  ConfirmationOptions,
  ConfirmationResult,
  TransactionEvent,
  InstantLockEvent,
  ChainLockEvent,
  BlockInclusionEvent,
} from '../types/index.js';
import { createLogger, Logger } from '../utils/logger.js';
import dashcore from '@dashevo/dashcore-lib';

const { Transaction, MerkleBlock, InstantLock } = dashcore;

export interface RealtimeFinderCallbacks {
  /** Called when transaction is detected in DAPI stream */
  onTransaction?: (tx: TransactionEvent) => void;
  /** Called when InstantLock is received */
  onInstantLock?: (lock: InstantLockEvent) => void;
  /** Called when ChainLock confirms transaction */
  onChainLock?: (cl: ChainLockEvent) => void;
  /** Called when block inclusion is detected */
  onBlockInclusion?: (block: BlockInclusionEvent) => void;
}

export class RealtimeFinder extends EventEmitter {
  private config: RealtimeFinderConfig;
  private tracker: TransactionTracker;
  private chainLockMonitor: ChainLockHeightMonitor | null;
  private statusPoller: TransactionStatusPoller | null;
  private stream: any;
  private isActive: boolean;
  private logger: Logger;
  private lastBlockHeight: number = 0;

  // Reconnection state
  private monitoredAddresses: string[] = [];
  private monitoredCallbacks: RealtimeFinderCallbacks = {};
  private bloomFilter: any = null;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private isReconnecting: boolean = false;

  // Two-phase grace period for IS proof delivery:
  // HUNT phase: after preRegisterTransaction(), reconnection continues normally.
  //   Each reconnect forces DAPI to re-scan mempool until the tx is found.
  // WAIT phase: when the stream detects a pre-registered tx, reconnectPausedUntil
  //   is set to pause periodic reconnection so IS proof bytes can arrive (~1-2s).
  private reconnectPausedUntil: number = 0;
  private preRegisteredTxids: Set<string> = new Set();

  constructor(config: RealtimeFinderConfig) {
    super();
    this.config = config;
    this.tracker = new TransactionTracker(
      config.autoPruneOnConfirmation ?? false,
      config.maxTrackedTransactions ?? 1000
    );
    this.chainLockMonitor = null;
    this.statusPoller = null;
    this.stream = null;
    this.isActive = false;
    this.logger = createLogger('RealtimeFinder');
  }

  /**
   * Monitor specific addresses for incoming transactions
   * @param addresses Address or array of addresses to monitor
   * @param callbacks Event callbacks for transactions, locks, etc.
   * @returns Cleanup function to stop monitoring
   */
  async monitorAddresses(
    addresses: string | string[],
    callbacks: RealtimeFinderCallbacks
  ): Promise<() => void> {
    const addressArray = Array.isArray(addresses) ? addresses : [addresses];
    this.isActive = true;

    // Get current blockchain height
    const core = (this.config.dapiClient as any).core;
    if (!core) {
      throw new Error('DAPI client does not have core namespace');
    }

    const currentHeight = await core.getBestBlockHeight();

    // Create bloom filter for addresses
    const bloomFilter = BloomFilterBuilder.build(
      addressArray,
      this.config.network
    );

    // Store state for reconnection
    this.monitoredAddresses = addressArray;
    this.monitoredCallbacks = callbacks;
    this.bloomFilter = bloomFilter;

    // Subscribe to DAPI stream
    let rawStream = core.subscribeToTransactionsWithProofs(bloomFilter, {
      fromBlockHeight: currentHeight,
      count: 0, // Continuous monitoring
    });

    // Handle async stream
    if (rawStream && typeof rawStream.then === 'function') {
      rawStream = await rawStream;
    }

    this.stream = rawStream;
    this.lastBlockHeight = currentHeight;

    // Convert to async iterable IMMEDIATELY after getting the stream.
    // This attaches EventEmitter listeners before any async operations
    // (like ChainLock monitor start) that could allow the stream to emit
    // data before listeners are ready. The EventEmitter-based wrapper
    // queues incoming messages, so nothing is lost.
    const asyncStream = StreamWrapper.makeAsyncIterable(rawStream);

    // Start ChainLock monitoring
    this.chainLockMonitor = new ChainLockHeightMonitor(
      this.config.dapiClient,
      this.tracker,
      (txids, height) => {
        // Fire ChainLock callback for each confirmed transaction
        txids.forEach((txid) => {
          if (callbacks.onChainLock && this.tracker.isMonitored(txid)) {
            const tx = this.tracker.getTransaction(txid);
            if (tx) {
              // Calculate latency from earliest known timestamp
              // Use instantLockTime, then broadcastTime, otherwise latency is 0
              const referenceTime = tx.instantLockTime || tx.broadcastTime;
              const latency = referenceTime ? tx.chainLockTime! - referenceTime : 0;

              callbacks.onChainLock({
                txid,
                timestamp: tx.chainLockTime!,
                blockHeight: tx.blockHeight!,
                chainLockedHeight: height,
                latency,
              });
            }
          }
        });
      }
    );

    try {
      await this.chainLockMonitor.start();
    } catch (error) {
      this.logger.warn('ChainLock monitor failed to start:', (error as any).message);
      this.logger.warn('Continuing with InstantSend monitoring only');
    }

    // Start transaction status poller for reliable IS/CL detection via getTransaction()
    const enablePolling = this.config.enableTransactionPolling ?? true;
    if (enablePolling) {
      const pollInterval = Math.max(1000, this.config.transactionPollInterval ?? 2000);
      this.statusPoller = new TransactionStatusPoller(
        this.config.dapiClient,
        this.tracker,
        {
          onInstantLock: (txid, timestamp) => {
            if (callbacks.onInstantLock && this.tracker.isMonitored(txid)) {
              const tx = this.tracker.getTransaction(txid);
              callbacks.onInstantLock({
                txid,
                timestamp,
                latency: tx?.broadcastTime ? timestamp - tx.broadcastTime : 0,
                // instantLockHex not available from polling
              });
            }
          },
          onChainLock: (txid, timestamp) => {
            if (callbacks.onChainLock && this.tracker.isMonitored(txid)) {
              const tx = this.tracker.getTransaction(txid);
              const referenceTime = tx?.instantLockTime || tx?.broadcastTime;
              callbacks.onChainLock({
                txid,
                timestamp,
                blockHeight: tx?.blockHeight || 0,
                chainLockedHeight: tx?.chainLockBlockHeight || 0,
                latency: referenceTime ? timestamp - referenceTime : 0,
              });
            }
          },
        },
        pollInterval
      );
      this.statusPoller.start();
    }

    // Process stream in background — fire-and-forget.
    // If the stream dies, the poller continues to detect IS/CL independently.
    this.processStream(asyncStream, addressArray, callbacks, currentHeight)
      .catch((error) => {
        // Only log errors if still active - aborts during shutdown are expected
        if (this.isActive) {
          this.logger.error('Stream processing error:', (error as Error).message);
          this.emit('error', error);
        }
      });

    // Start periodic stream reconnection to catch missed transactions.
    // Each reconnection forces DAPI to re-run history + mempool scan.
    // Two-phase grace period:
    //   HUNT: reconnection continues normally after preRegisterTransaction()
    //   WAIT: reconnection pauses when stream finds the pre-registered tx,
    //         keeping the stream alive for IS proof byte delivery
    const reconnectInterval = this.config.streamReconnectInterval ?? 10000;
    if (reconnectInterval > 0) {
      this.reconnectTimer = setInterval(() => {
        if (this.isActive && Date.now() >= this.reconnectPausedUntil) {
          this.reconnectStream().catch((err) =>
            this.logger.warn('Periodic reconnect failed:', (err as Error).message)
          );
        } else if (this.isActive && Date.now() < this.reconnectPausedUntil) {
          this.logger.debug('Periodic reconnect skipped (WAIT phase: stream alive for IS proof bytes)');
        }
      }, reconnectInterval);
    }

    // Return cleanup function
    return () => this.stop();
  }

  /**
   * Reconnect the DAPI stream from lastBlockHeight.
   * Forces the server to re-run its historical data + mempool scan phases,
   * catching any transactions missed during continuous streaming.
   * @private
   */
  private async reconnectStream(): Promise<void> {
    if (!this.isActive || this.isReconnecting || this.monitoredAddresses.length === 0) return;
    this.isReconnecting = true;
    try {
      // Cancel current stream. Attach a no-op error listener first to
      // suppress unhandled rejection from gRPC internals on cancel.
      if (this.stream) {
        const oldStream = this.stream;
        this.stream = null;
        if (typeof oldStream.on === 'function') {
          oldStream.on('error', () => {});
        }
        if (typeof oldStream.cancel === 'function') {
          try { oldStream.cancel(); } catch (_) { /* ignore cleanup errors */ }
        }
      }

      // Re-subscribe from lastBlockHeight. Use max(1, lastBlockHeight - 1)
      // to ensure we request a block height that definitely exists on the
      // DAPI node (lastBlockHeight may have been speculatively incremented
      // from a MerkleBlock before the block is available on the next node).
      const reconnectHeight = Math.max(1, this.lastBlockHeight - 1);
      const core = (this.config.dapiClient as any).core;
      let rawStream = core.subscribeToTransactionsWithProofs(this.bloomFilter, {
        fromBlockHeight: reconnectHeight,
        count: 0,
      });
      if (rawStream && typeof rawStream.then === 'function') {
        rawStream = await rawStream;
      }
      this.stream = rawStream;
      const asyncStream = StreamWrapper.makeAsyncIterable(rawStream);

      // Process in background (fire-and-forget)
      this.processStream(asyncStream, this.monitoredAddresses, this.monitoredCallbacks, reconnectHeight)
        .catch((error) => {
          if (this.isActive) {
            this.logger.warn('Stream processing error after reconnect:', (error as Error).message);
          }
        });

      this.logger.info(`Stream reconnected from height ${reconnectHeight}`);
    } catch (error) {
      this.logger.warn('Stream reconnection failed:', (error as Error).message);
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Process stream messages
   * @private
   */
  private async processStream(
    stream: AsyncIterable<any>,
    addresses: string[],
    callbacks: RealtimeFinderCallbacks,
    startHeight: number
  ): Promise<void> {
    let currentBlockHeight = startHeight;

    try {
      for await (const message of stream) {

        if (!this.isActive) {
          break;
        }

        const msg = message as any;

        // Parse transactions
        const rawTxs = typeof msg.getRawTransactions === 'function'
          ? msg.getRawTransactions()
          : msg.rawTransactions;

        if (rawTxs) {
          const txList = typeof (rawTxs as any).getTransactionsList === 'function'
            ? (rawTxs as any).getTransactionsList()
            : (Array.isArray(rawTxs) ? rawTxs : null);

          if (txList && txList.length > 0) {
            this.logger.info(`📥 DAPI stream: ${txList.length} transaction(s) received`);
            for (const txBuf of txList) {
              try {
                const tx = new Transaction(Buffer.from(txBuf));
                const txid = tx.hash;

                // Check if transaction involves monitored addresses
                const involvesAddress = this.transactionInvolvesAddresses(tx, addresses);

                if (involvesAddress) {
                  // Only fire callback for genuinely new transactions.
                  // Reconnections re-deliver txs from mempool, so the tracker
                  // deduplicates: if it already knows this txid, skip the callback.
                  const isNew = !this.tracker.getTransaction(txid);
                  this.tracker.addBroadcast(txid, tx);

                  if (isNew && callbacks.onTransaction) {
                    callbacks.onTransaction({
                      txid,
                      timestamp: Date.now(),
                      transaction: tx,
                    });
                  }

                  // WAIT phase: pre-registered tx found on stream — start grace period
                  // to keep the stream alive for IS proof byte delivery (~1-2s after detection).
                  if (this.preRegisteredTxids.has(txid) && Date.now() >= this.reconnectPausedUntil) {
                    const gracePeriod = this.config.reconnectGracePeriod ?? 15000;
                    this.reconnectPausedUntil = Date.now() + gracePeriod;
                    this.logger.info(`⏸️ WAIT phase: tx ${txid.substring(0, 16)}... found — grace period ${gracePeriod}ms`);
                  }
                }
              } catch (error) {
                this.logger.warn('Failed to parse transaction:', error);
              }
            }
          }
        }

        // Parse merkle blocks
        const rawMerkle = typeof msg.getRawMerkleBlock === 'function'
          ? msg.getRawMerkleBlock()
          : msg.rawMerkleBlock;

        if (rawMerkle) {
          this.logger.info(`📥 DAPI stream: MerkleBlock received`);
          try {
            const merkleBlock = new MerkleBlock(Buffer.from(rawMerkle));
            const blockHash = merkleBlock.header.hash;
            currentBlockHeight++; // Increment for each new block

            this.lastBlockHeight = currentBlockHeight;

            // Extract transaction hashes
            const txids = merkleBlock.hashes.map((h: any) => {
              const buf = Buffer.from(String(h), 'hex');
              return buf.reverse().toString('hex');
            });

            // Log all txids in the MerkleBlock for debugging
            this.logger.debug(`📦 MerkleBlock height ${currentBlockHeight}: ${txids.length} txids`);
            for (const txid of txids) {
              const isMonitored = this.tracker.isMonitored(txid);
              this.logger.debug(`   TX: ${txid} (monitored: ${isMonitored})`);
            }

            for (const txid of txids) {
              this.tracker.recordBlockInclusion(txid, currentBlockHeight, blockHash);

              if (callbacks.onBlockInclusion && this.tracker.isMonitored(txid)) {
                callbacks.onBlockInclusion({
                  txid,
                  blockHeight: currentBlockHeight,
                  blockHash,
                  timestamp: merkleBlock.header.time * 1000,
                });
              }
            }
          } catch (error) {
            this.logger.warn('Failed to parse merkle block:', error);
          }
        }

        // Parse instant locks
        const instantLockMessages = typeof msg.getInstantSendLockMessages === 'function'
          ? msg.getInstantSendLockMessages()
          : msg.instantSendLockMessages;

        // Extract message list from wrapper object (DAPI returns wrapper with getMessagesList method)
        const instantLockList = instantLockMessages?.getMessagesList
          ? instantLockMessages.getMessagesList()
          : (Array.isArray(instantLockMessages) ? instantLockMessages : null);

        if (instantLockList && instantLockList.length > 0) {
          this.logger.info(`📥 DAPI stream: ${instantLockList.length} InstantLock message(s) received`);
          for (const lockBuf of instantLockList) {
            try {
              // Use fromBuffer static method and ensure proper Buffer conversion
              const lock: any = (InstantLock as any).fromBuffer(Buffer.from(lockBuf));
              const txid = lock.txid.toString('hex');
              const timestamp = Date.now();

              // Convert raw buffer to hex string for proof creation
              const instantLockHex = Buffer.from(lockBuf).toString('hex');

              // Log InstantLock details for debugging
              const isMonitored = this.tracker.isMonitored(txid);
              this.logger.debug(`🔒 InstantLock received: ${txid} (monitored: ${isMonitored})`);

              const wasNew = this.tracker.recordInstantLock(txid, timestamp, instantLockHex);

              if (wasNew && callbacks.onInstantLock && isMonitored) {
                const tx = this.tracker.getTransaction(txid);
                callbacks.onInstantLock({
                  txid,
                  timestamp,
                  latency: tx?.broadcastTime ? timestamp - tx.broadcastTime : 0,
                  instantLockHex,
                });
              }

              // If this was a pre-registered txid, remove it from the pending set.
              // Once all pre-registered txids have IS proof, clear the grace period
              // to resume periodic reconnection.
              if (wasNew && this.preRegisteredTxids.has(txid)) {
                this.preRegisteredTxids.delete(txid);
                this.logger.debug(`✅ IS proof received for pre-registered txid ${txid} (${this.preRegisteredTxids.size} remaining)`);
                if (this.preRegisteredTxids.size === 0 && this.reconnectPausedUntil > Date.now()) {
                  this.reconnectPausedUntil = 0;
                  this.logger.info('▶️  All pre-registered txids have IS proof — grace period cleared, periodic reconnection resumed');
                }
              }
            } catch (error) {
              this.logger.warn('Failed to parse instant lock:', error);
            }
          }
        }
      }
    } catch (error) {
      // Only handle errors if still active - aborts during shutdown are expected
      if (this.isActive) {
        const errorMessage = (error as any).message || String(error);
        this.logger.warn(`Stream ended with error: ${errorMessage}`);
        this.logger.info('Poller continues to detect IS/CL independently');
        this.emit('error', error);
      }
    }
  }

  /**
   * Check if transaction involves any of the monitored addresses
   * @private
   */
  private transactionInvolvesAddresses(tx: any, addresses: string[]): boolean {
    const addressSet = new Set(addresses);

    // Check outputs
    if (tx.outputs && Array.isArray(tx.outputs)) {
      for (const output of tx.outputs) {
        try {
          if (output.script && output.script.toAddress) {
            const addr = output.script.toAddress(this.config.network);
            if (addr && addressSet.has(addr.toString())) {
              return true;
            }
          }
        } catch (error) {
          // Non-standard output, skip
        }
      }
    }

    return false;
  }

  /**
   * Wait for a specific transaction to be confirmed
   * @param txid Transaction ID to wait for
   * @param options Confirmation requirements and timeout
   * @returns Confirmation result
   */
  async waitForConfirmation(
    txid: string,
    options: ConfirmationOptions = {}
  ): Promise<ConfirmationResult> {
    const {
      requireInstantLock = true,
      requireChainLock = false,
      timeout = 900000,
      onProgress,
    } = options;

    const startTime = Date.now();

    // Register transaction for monitoring
    this.tracker.addBroadcast(txid);

    return new Promise<ConfirmationResult>((resolve) => {
      let resolved = false;

      const checkCompletion = () => {
        if (resolved) return;

        const tx = this.tracker.getTransaction(txid);
        if (!tx) return;

        // Check if requirements met
        if (requireChainLock && tx.status === 'chainlocked') {
          resolved = true;
          resolve({
            txid,
            method: 'chainlock',
            instantLockTime: tx.instantLockTime,
            chainLockTime: tx.chainLockTime,
            blockHeight: tx.blockHeight,
            totalLatencyMs: Date.now() - startTime,
            instantLockHex: tx.instantLockHex,
          });
        } else if (requireInstantLock && !requireChainLock && tx.status === 'instantlocked') {
          resolved = true;
          resolve({
            txid,
            method: 'instantlock',
            instantLockTime: tx.instantLockTime,
            chainLockTime: null,
            blockHeight: tx.blockHeight,
            totalLatencyMs: Date.now() - startTime,
            instantLockHex: tx.instantLockHex,
          });
        }
      };

      // Check periodically
      const checkInterval = setInterval(() => {
        checkCompletion();

        if (onProgress && !resolved) {
          const tx = this.tracker.getTransaction(txid);
          const status = tx?.status || 'waiting';
          onProgress({
            txid,
            status: status as any,
            message: `Waiting for confirmation (${status})`,
            elapsedMs: Date.now() - startTime,
          });
        }
      }, 1000);

      // Timeout handler
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          clearInterval(checkInterval);
          const tx = this.tracker.getTransaction(txid);
          resolve({
            txid,
            method: 'timeout',
            instantLockTime: tx?.instantLockTime || null,
            chainLockTime: tx?.chainLockTime || null,
            blockHeight: tx?.blockHeight || null,
            totalLatencyMs: Date.now() - startTime,
            instantLockHex: tx?.instantLockHex || null,
          });
        }
      }, timeout);
    });
  }

  /**
   * Stop all monitoring
   */
  stop(): void {
    this.isActive = false;

    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.statusPoller) {
      this.statusPoller.stop();
      this.statusPoller = null;
    }

    if (this.chainLockMonitor) {
      this.chainLockMonitor.stop();
      this.chainLockMonitor = null;
    }

    if (this.stream) {
      const oldStream = this.stream;
      this.stream = null;
      if (typeof oldStream.on === 'function') {
        oldStream.on('error', () => {});
      }
      if (typeof oldStream.cancel === 'function') {
        try { oldStream.cancel(); } catch (_) { /* ignore cleanup errors */ }
      }
    }
  }

  /**
   * Get tracked transaction state
   */
  getTransaction(txid: string) {
    return this.tracker.getTransaction(txid);
  }

  /**
   * Pre-register a txid for InstantLock monitoring
   *
   * Call this BEFORE broadcasting a transaction to ensure InstantLocks
   * are captured even if they arrive before waitForConfirmation() is called.
   *
   * @param txid Transaction ID to pre-register
   */
  preRegisterTransaction(txid: string): void {
    this.logger.debug(`📝 Pre-registering txid: ${txid}`);
    this.tracker.addBroadcast(txid);
    this.preRegisteredTxids.add(txid);

    // HUNT phase: do NOT set grace period here. Reconnection continues
    // normally so each reconnect forces DAPI to re-scan mempool until
    // the tx is found. Grace period starts later (WAIT phase) when the
    // stream actually detects the pre-registered tx.

    // Immediately reconnect the stream so DAPI's mempool scan picks up
    // the newly broadcast transaction.
    const reconnectOnPreRegister = this.config.reconnectOnPreRegister ?? true;
    if (reconnectOnPreRegister && this.isActive) {
      this.reconnectStream().catch((err) =>
        this.logger.warn('Reconnect on preRegister failed:', (err as Error).message)
      );
    }
  }

  /**
   * Clear a specific transaction from tracking
   */
  clearTransaction(txid: string): void {
    this.tracker.clearTransaction(txid);
  }

  /**
   * Clear all confirmed transactions
   */
  clearAllConfirmed(): void {
    this.tracker.clearAllConfirmed();
  }

  /**
   * Get current monitoring status
   */
  getStatus(): {
    active: boolean;
    trackedTransactions: number;
    chainLockHeight: number;
    lastBlockHeight: number;
  } {
    return {
      active: this.isActive,
      trackedTransactions: this.tracker.getAllTransactions().length,
      chainLockHeight: this.chainLockMonitor?.getCurrentHeight() || 0,
      lastBlockHeight: this.lastBlockHeight,
    };
  }

  /**
   * Get the configured network
   */
  getNetwork(): string {
    return this.config.network;
  }
}
