/**
 * RealtimeFinder - Real-time InstantSend/ChainLock monitoring
 *
 * Monitors addresses for incoming transactions and tracks confirmation
 * through InstantLock and ChainLock stages.
 *
 * Features:
 * - InstantLock detection (~1-3 seconds)
 * - ChainLock confirmation (~1-3 minutes)
 * - Automatic reconnection on stream failures
 * - Transaction state tracking
 */

import { EventEmitter } from 'events';
import { BloomFilterBuilder } from '../core/BloomFilterBuilder.js';
import { StreamWrapper } from '../core/StreamWrapper.js';
import { TransactionTracker } from '../monitoring/TransactionTracker.js';
import { ChainLockHeightMonitor } from '../monitoring/ChainLockHeightMonitor.js';
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
  /** Called when stream reconnects after error */
  onReconnect?: (attempt: number) => void;
}

export class RealtimeFinder extends EventEmitter {
  private config: RealtimeFinderConfig;
  private tracker: TransactionTracker;
  private chainLockMonitor: ChainLockHeightMonitor | null;
  private stream: any;
  private isActive: boolean;
  private logger: Logger;
  private monitoredAddresses: string[];
  private currentCallbacks: RealtimeFinderCallbacks | null;

  // Stream resilience state
  private reconnectAttempts: number = 0;
  private reconnecting: boolean = false;
  private lastBlockHeight: number = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;

  // Stream readiness synchronization
  private streamReadyPromise: Promise<void> | null = null;
  private resolveStreamReady: (() => void) | null = null;

  constructor(config: RealtimeFinderConfig) {
    super();
    this.config = config;
    this.tracker = new TransactionTracker(
      config.autoPruneOnConfirmation ?? false,
      config.maxTrackedTransactions ?? 1000
    );
    this.chainLockMonitor = null;
    this.stream = null;
    this.isActive = false;
    this.logger = createLogger('RealtimeFinder');
    this.monitoredAddresses = [];
    this.currentCallbacks = null;

    // Initialize reconnection configuration
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 10;
    this.reconnectDelay = config.reconnectDelay ?? 1000;
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
    this.monitoredAddresses = addressArray;
    this.currentCallbacks = callbacks;

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

    // Start ChainLock monitoring
    this.chainLockMonitor = new ChainLockHeightMonitor(
      this.config.dapiClient,
      this.tracker,
      (txids, height) => {
        // Fire ChainLock callback for each confirmed transaction
        txids.forEach((txid) => {
          if (callbacks.onChainLock) {
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

    // Convert to async iterable
    const asyncStream = StreamWrapper.makeAsyncIterable(rawStream);

    // Create stream readiness promise - this ensures the for-await loop has started
    // before monitorAddresses() returns, preventing race conditions where transactions
    // are broadcast before the stream is actively consuming messages
    this.streamReadyPromise = new Promise<void>((resolve) => {
      this.resolveStreamReady = resolve;
    });

    // Process stream in background with error handling
    this.processStream(asyncStream, addressArray, callbacks, currentHeight)
      .catch((error) => {
        // Only log errors if still active - aborts during shutdown are expected
        if (this.isActive) {
          this.logger.error('Stream processing error:', (error as Error).message);
          this.emit('error', error);
        }
        // Suppress abort errors during intentional shutdown
      });

    // Wait for the stream to be actively consuming before returning
    // This prevents race conditions where transactions are broadcast before
    // the for-await loop has started in processStream()
    await this.streamReadyPromise;
    this.logger.debug('Stream is now actively consuming messages');

    // Return cleanup function
    return () => this.stop();
  }

  /**
   * Reconnect the DAPI stream after an error
   *
   * Uses exponential backoff and resumes from the last known block height
   * to avoid missing transactions during brief disconnections.
   *
   * @private
   */
  private async reconnectStream(): Promise<void> {
    if (this.reconnecting || !this.isActive) {
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;

    // Check if max attempts exceeded
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.logger.error(
        `Max reconnect attempts (${this.maxReconnectAttempts}) reached, giving up`
      );
      this.emit('maxReconnectAttemptsReached', {
        attempts: this.reconnectAttempts,
        lastBlockHeight: this.lastBlockHeight,
      });
      this.reconnecting = false;
      return;
    }

    // Calculate exponential backoff delay
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    this.logger.info(
      `🔄 Reconnecting stream (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`
    );

    // Wait before reconnecting
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Don't reconnect if stopped during wait
    if (!this.isActive) {
      this.reconnecting = false;
      return;
    }

    try {
      // Cancel existing stream if any
      if (this.stream && typeof this.stream.cancel === 'function') {
        try {
          this.stream.cancel();
        } catch {
          // Ignore cleanup errors
        }
        this.stream = null;
      }

      const core = (this.config.dapiClient as any).core;
      if (!core) {
        throw new Error('DAPI client does not have core namespace');
      }

      // Determine resume height: use last known height minus 1 (overlap ensures
      // we don't miss a block if the stream died mid-processing; duplicate
      // delivery is harmless since TransactionTracker deduplicates)
      let resumeHeight = Math.max(1, this.lastBlockHeight - 1);
      if (resumeHeight === 0) {
        resumeHeight = await core.getBestBlockHeight();
        this.logger.debug(`No lastBlockHeight, starting from current: ${resumeHeight}`);
      } else {
        this.logger.debug(`Resuming from lastBlockHeight: ${resumeHeight}`);
      }

      // Recreate bloom filter
      const bloomFilter = BloomFilterBuilder.build(
        this.monitoredAddresses,
        this.config.network
      );

      // Subscribe to new stream starting from resume height
      let rawStream = core.subscribeToTransactionsWithProofs(bloomFilter, {
        fromBlockHeight: resumeHeight,
        count: 0, // Continuous monitoring
      });

      // Handle async stream
      if (rawStream && typeof rawStream.then === 'function') {
        rawStream = await rawStream;
      }

      this.stream = rawStream;

      // Emit reconnect event
      this.emit('reconnect', {
        attempt: this.reconnectAttempts,
        resumeHeight,
      });

      // Notify via callback if provided
      if (this.currentCallbacks?.onReconnect) {
        (this.currentCallbacks as any).onReconnect(this.reconnectAttempts);
      }

      this.logger.info(`✅ Stream reconnected successfully at height ${resumeHeight}`);

      // Convert to async iterable and process
      const asyncStream = StreamWrapper.makeAsyncIterable(rawStream);

      // Reset reconnecting flag before starting processing
      this.reconnecting = false;

      // Process the new stream
      await this.processStream(
        asyncStream,
        this.monitoredAddresses,
        this.currentCallbacks || {},
        resumeHeight
      );
    } catch (error) {
      this.logger.error('Reconnection failed:', (error as Error).message);
      this.reconnecting = false;

      // Try again if we haven't exceeded max attempts
      if (this.isActive && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectStream().catch((err) => {
          this.logger.error('Reconnection retry failed:', err);
        });
      } else {
        this.emit('error', error);
      }
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

    // Signal that the stream is ready BEFORE entering the for-await loop
    // This uses a wrapper that signals readiness on the first iterator call
    const signalReadyAndIterate = async function* (
      source: AsyncIterable<any>,
      signalReady: (() => void) | null
    ) {
      const iterator = source[Symbol.asyncIterator]();
      // Signal ready immediately when we start iterating
      if (signalReady) {
        signalReady();
      }
      while (true) {
        const result = await iterator.next();
        if (result.done) break;
        yield result.value;
      }
    };

    try {
      for await (const message of signalReadyAndIterate(stream, this.resolveStreamReady)) {
        // Clear the resolver after first use to avoid memory leaks
        this.resolveStreamReady = null;

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
                  this.tracker.addBroadcast(txid, tx);

                  if (callbacks.onTransaction) {
                    callbacks.onTransaction({
                      txid,
                      timestamp: Date.now(),
                      transaction: tx,
                    });
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

            // Track last block height for reconnection resumption
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

        // Check if this is a gRPC stream error that warrants reconnection
        const isStreamError =
          errorMessage.includes('RST_STREAM') ||
          errorMessage.includes('UNAVAILABLE') ||
          errorMessage.includes('CANCELLED') ||
          errorMessage.includes('stream') ||
          errorMessage.includes('connection');

        if (isStreamError) {
          this.logger.warn(`⚠️ Stream error detected: ${errorMessage}`);
          this.logger.info('Attempting automatic reconnection...');

          // Trigger reconnection instead of just emitting error
          this.reconnectStream().catch((reconnectError) => {
            this.logger.error('Reconnection failed:', reconnectError);
            this.emit('error', reconnectError);
          });
        } else {
          // Non-stream errors are emitted normally
          this.logger.error('Stream processing error:', errorMessage);
          this.emit('error', error);
        }
      }
      // Suppress abort errors during intentional shutdown
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

    // Reset reconnection state
    this.reconnecting = false;
    this.reconnectAttempts = 0;

    if (this.chainLockMonitor) {
      this.chainLockMonitor.stop();
      this.chainLockMonitor = null;
    }

    if (this.stream && typeof this.stream.cancel === 'function') {
      try {
        this.stream.cancel();
      } catch (error) {
        // Ignore cleanup errors
      }
      this.stream = null;
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
    reconnectAttempts: number;
    reconnecting: boolean;
  } {
    return {
      active: this.isActive,
      trackedTransactions: this.tracker.getAllTransactions().length,
      chainLockHeight: this.chainLockMonitor?.getCurrentHeight() || 0,
      lastBlockHeight: this.lastBlockHeight,
      reconnectAttempts: this.reconnectAttempts,
      reconnecting: this.reconnecting,
    };
  }

  /**
   * Get the configured network
   */
  getNetwork(): string {
    return this.config.network;
  }
}
