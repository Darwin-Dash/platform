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

    // Return cleanup function
    return () => this.stop();
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
      // Only log errors if still active - aborts during shutdown are expected
      if (this.isActive) {
        this.logger.error('Stream processing error:', (error as any).message);
        this.emit('error', error);
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
  } {
    return {
      active: this.isActive,
      trackedTransactions: this.tracker.getAllTransactions().length,
      chainLockHeight: this.chainLockMonitor?.getCurrentHeight() || 0,
    };
  }

  /**
   * Get the configured network
   */
  getNetwork(): string {
    return this.config.network;
  }
}
