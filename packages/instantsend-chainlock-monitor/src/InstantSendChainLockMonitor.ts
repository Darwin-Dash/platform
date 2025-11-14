/**
 * InstantSendChainLockMonitor
 *
 * Main class for monitoring Dash InstantSend and ChainLock confirmations.
 *
 * This library provides standalone InstantSend and ChainLock monitoring without requiring wallet-lib.
 * Perfect for apps that need to detect incoming transactions with cryptographic confirmation.
 *
 * Confirmation Paths:
 * 1. InstantSend Lock - LLMQ quorum signs transaction (~1-3 seconds)
 * 2. ChainLock - LLMQ signs entire blockchain including transaction (~1-3 minutes)
 *
 * Both paths provide cryptographic finality and prevent double-spends.
 */

import { EventEmitter } from 'events';
import DAPIClient from '@dashevo/dapi-client';
import { TransactionTracker } from './TransactionTracker.js';
import { ChainLockHeightMonitor } from './ChainLockHeightMonitor.js';
import { createAddressBloomFilter } from './utils/bloom-filter.js';
import {
  parseTransactions,
  parseMerkleBlock,
  parseInstantLocks,
  transactionInvolvesAddress,
} from './utils/stream-parser.js';
import { createLogger, Logger } from './utils/logger.js';
import {
  InstantSendChainLockMonitorConfig,
  InstantSendChainLockMonitorCallbacks,
  ConfirmationOptions,
  ConfirmationResult,
} from './types.js';

export class InstantSendChainLockMonitor extends EventEmitter {
  private config: InstantSendChainLockMonitorConfig;
  private dapiClient: any;
  private tracker: TransactionTracker;
  private chainLockMonitor: ChainLockHeightMonitor | null;
  private stream: any;
  private isActive: boolean;
  private logger: Logger;
  private chainLockAvailable: boolean;
  private instantSendAvailable: boolean;
  // Reconnection state
  private reconnectAttempts: number;
  private reconnecting: boolean;
  private lastBlockHeight: number;
  private monitoredAddresses: string[];
  private currentCallbacks: InstantSendChainLockMonitorCallbacks | null;
  // DAPI failover state
  private availableDapiNodes: string[];
  private currentDapiNodeIndex: number;
  private failedNodes: Map<string, number>; // node address -> failure timestamp

  constructor(config: InstantSendChainLockMonitorConfig) {
    super();  // EventEmitter constructor

    this.config = {
      timeout: 60000,
      retries: 15,
      bloomFalsePositiveRate: 0.0001,
      autoPruneOnConfirmation: false,  // Default: manual cleanup
      maxTrackedTransactions: 1000,    // Safety limit
      basePollInterval: 5000,           // Default: 5 seconds
      maxPollInterval: 30000,           // Maximum: 30 seconds
      minPollInterval: 1000,            // Minimum to prevent abuse
      adaptivePolling: true,            // Default: enabled
      maxReconnectAttempts: 10,         // Default: 10 reconnection attempts
      reconnectDelay: 3000,             // Default: 3 seconds base delay
      enableDAPIFailover: true,         // Default: enabled
      dapiNodeRetryDelay: 300000,       // Default: 5 minutes
      ...config,
    };

    // Validate minPollInterval
    if (this.config.basePollInterval! < this.config.minPollInterval!) {
      throw new Error(
        `basePollInterval (${this.config.basePollInterval}ms) must be >= minPollInterval (${this.config.minPollInterval}ms)`
      );
    }

    // Backwards compatibility: debug maps to logLevel='debug'
    if (config.debug && !config.logLevel) {
      this.logger = createLogger('InstantSendChainLockMonitor', 'debug');
    } else {
      this.logger = createLogger('InstantSendChainLockMonitor', config.logLevel);
    }

    this.dapiClient = null;
    this.tracker = new TransactionTracker(
      this.config.autoPruneOnConfirmation,
      this.config.maxTrackedTransactions
    );
    this.chainLockMonitor = null;
    this.stream = null;
    this.isActive = false;
    this.chainLockAvailable = true;
    this.instantSendAvailable = true;
    // Initialize reconnection state
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.lastBlockHeight = 0;
    this.monitoredAddresses = [];
    this.currentCallbacks = null;
    // Initialize DAPI failover state
    this.availableDapiNodes = [];
    this.currentDapiNodeIndex = 0;
    this.failedNodes = new Map();
  }

  /**
   * Initialize DAPI client connection
   */
  private async initializeDAPIClient(): Promise<void> {
    if (this.dapiClient) {
      return; // Already initialized
    }

    // Initialize node pool for failover
    if (this.config.enableDAPIFailover && this.config.dapiAddresses) {
      this.availableDapiNodes = [...this.config.dapiAddresses];
      // Shuffle for load distribution
      for (let i = this.availableDapiNodes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.availableDapiNodes[i], this.availableDapiNodes[j]] = [
          this.availableDapiNodes[j],
          this.availableDapiNodes[i],
        ];
      }
      this.logger.debug(`Initialized DAPI node pool with ${this.availableDapiNodes.length} nodes`);
    }

    const dapiConfig: any = {
      network: this.config.network,
      timeout: this.config.timeout,
      retries: this.config.retries,
    };

    if (this.config.dapiAddresses) {
      dapiConfig.dapiAddresses = this.config.dapiAddresses;
    } else if (this.config.seeds) {
      dapiConfig.seeds = this.config.seeds;
    } else {
      throw new Error('Either dapiAddresses or seeds must be provided');
    }

    this.dapiClient = new DAPIClient(dapiConfig);
  }

  /**
   * Rotate to next available DAPI node
   * @private
   * @returns true if a node was found, false if all nodes are recently failed
   */
  private rotateToNextDapiNode(): boolean {
    if (!this.config.enableDAPIFailover || this.availableDapiNodes.length === 0) {
      return false;
    }

    const now = Date.now();
    const retryDelay = this.config.dapiNodeRetryDelay!;

    // Try each node in order
    for (let i = 0; i < this.availableDapiNodes.length; i++) {
      const nextIndex = (this.currentDapiNodeIndex + 1 + i) % this.availableDapiNodes.length;
      const node = this.availableDapiNodes[nextIndex];

      // Check if node recently failed
      const failTime = this.failedNodes.get(node);
      if (failTime && now - failTime < retryDelay) {
        this.logger.debug(`   Skipping ${node} (failed ${Math.floor((now - failTime) / 1000)}s ago)`);
        continue;
      }

      // Found usable node
      this.currentDapiNodeIndex = nextIndex;
      return true;
    }

    return false; // All nodes recently failed
  }

  /**
   * Mark current DAPI node as failed
   * @private
   */
  private markCurrentNodeFailed(): void {
    if (this.availableDapiNodes.length > 0) {
      const currentNode = this.availableDapiNodes[this.currentDapiNodeIndex];
      this.failedNodes.set(currentNode, Date.now());
      this.logger.debug(`   Marked ${currentNode} as failed`);
    }
  }

  /**
   * Get current DAPI node address
   * @private
   */
  private getCurrentNode(): string | null {
    if (this.availableDapiNodes.length > 0) {
      return this.availableDapiNodes[this.currentDapiNodeIndex];
    }
    return null;
  }

  /**
   * Monitor specific addresses for incoming transactions
   *
   * @param addresses Address or array of addresses to monitor
   * @param callbacks Event callbacks for transactions, locks, etc.
   * @returns Cleanup function to stop monitoring
   *
   * @example
   * ```typescript
   * const monitor = new InstantSendChainLockMonitor({ network: 'testnet' });
   * const unsubscribe = await monitor.watchAddresses('yX3CJJ42...', {
   *   onTransaction: (tx) => console.log('Transaction:', tx.txid),
   *   onInstantLock: (lock) => console.log('InstantLocked!'),
   *   onChainLock: (cl) => console.log('ChainLocked!'),
   * });
   *
   * // Later: stop monitoring
   * unsubscribe();
   * ```
   */
  async watchAddresses(
    addresses: string | string[],
    callbacks: InstantSendChainLockMonitorCallbacks
  ): Promise<() => void> {
    await this.initializeDAPIClient();

    const addressArray = Array.isArray(addresses) ? addresses : [addresses];
    this.isActive = true;

    // Save state for reconnection
    this.monitoredAddresses = addressArray;
    this.currentCallbacks = callbacks;

    // Get current blockchain height
    const currentHeight = await this.dapiClient.core.getBestBlockHeight();

    // Track current block height for MerkleBlock processing
    // Since MerkleBlocks don't contain height, we use the subscription start height
    let trackedBlockHeight = currentHeight;

    // Create bloom filter for addresses
    const bloomFilter = createAddressBloomFilter(
      addressArray,
      this.config.network,
      this.config.bloomFalsePositiveRate
    );

    // Subscribe to DAPI stream
    this.stream = await this.dapiClient.core.subscribeToTransactionsWithProofs(bloomFilter, {
      fromBlockHeight: currentHeight,
      count: 0,
    });

    // Start ChainLock monitoring
    this.chainLockMonitor = new ChainLockHeightMonitor(
      this.dapiClient,
      this.tracker,
      (txids, height) => {
        // Fire ChainLock callback for each confirmed transaction
        txids.forEach((txid) => {
          if (callbacks.onChainLock) {
            const tx = this.tracker.getTransaction(txid);
            if (tx) {
              callbacks.onChainLock({
                txid,
                timestamp: tx.chainLockTime!,
                blockHeight: tx.blockHeight!,
                chainLockedHeight: height,
                latency: tx.chainLockTime! - (tx.instantLockTime || tx.broadcastTime || 0),
              });
            }
          }
        });
      },
      this.logger,
      this.config.basePollInterval,
      this.config.maxPollInterval,
      this.config.adaptivePolling
    );

    // Start with retry logic - will throw if Platform DAPI unavailable
    try {
      await this.chainLockMonitor.start(); // Has internal retry logic (5 attempts)

      // Listen for critical failures during operation
      this.chainLockMonitor.on('criticalFailure', (error: Error) => {
        this.chainLockAvailable = false;
        this.logger.warn('⚠️  ChainLock path degraded - continuing with InstantSend only');
        this.logger.error('   ChainLock monitor failed:', error.message);
        // Emit degradation event for observability
        this.emit('chainLockDegraded', error);
        // DON'T call this.stop() - InstantSend path still works!
      });
    } catch (error: any) {
      // ChainLock monitor FAILED to start after all retries
      // Degrade gracefully - continue with InstantSend only
      this.chainLockAvailable = false;
      this.logger.warn('⚠️  ChainLock initialization failed - continuing with InstantSend only');
      this.logger.error('   Error:', error.message);
      // Emit degradation event for observability
      this.emit('chainLockDegraded', error);
      // DON'T stop or throw - InstantSend path still works!
    }

    // Handle stream data
    this.stream.on('data', (response: any) => {
      try {
        // Parse and process transactions
        const transactions = parseTransactions(response, this.config.network);
        for (const parsedTx of transactions) {
          // Check if involves monitored addresses
          const involvesMonitoredAddress = addressArray.some((addr) =>
            transactionInvolvesAddress(parsedTx, addr)
          );

          if (involvesMonitoredAddress) {
            this.tracker.addBroadcast(parsedTx.txid, parsedTx.transaction);

            if (callbacks.onTransaction) {
              callbacks.onTransaction({
                txid: parsedTx.txid,
                timestamp: Date.now(),
                transaction: parsedTx.transaction,
              });
            }
          }
        }

        // Parse and process MerkleBlock
        // Use tracked height since MerkleBlock doesn't contain it
        const merkleBlock = parseMerkleBlock(response, trackedBlockHeight);
        if (merkleBlock) {
          // Track block height for reconnection
          this.lastBlockHeight = merkleBlock.blockHeight;

          this.logger.debug(`📦 MerkleBlock: height ${merkleBlock.blockHeight}, ${merkleBlock.txids.length} txids`);

          for (const txid of merkleBlock.txids) {
            this.tracker.recordBlockInclusion(txid, merkleBlock.blockHeight, merkleBlock.blockHash);

            this.logger.debug(`   Recorded: ${txid.substring(0, 16)}... at height ${merkleBlock.blockHeight}`);

            if (callbacks.onBlockInclusion && this.tracker.isMonitored(txid)) {
              callbacks.onBlockInclusion({
                txid,
                blockHeight: merkleBlock.blockHeight,
                blockHash: merkleBlock.blockHash,
                timestamp: merkleBlock.timestamp,
              });
            }
          }
        }

        // Parse and process InstantLocks
        const instantLocks = parseInstantLocks(response);
        for (const lock of instantLocks) {
          const wasNew = this.tracker.recordInstantLock(lock.txid, lock.timestamp);

          if (wasNew && callbacks.onInstantLock && this.tracker.isMonitored(lock.txid)) {
            const tx = this.tracker.getTransaction(lock.txid);
            callbacks.onInstantLock({
              txid: lock.txid,
              timestamp: lock.timestamp,
              latency: tx?.broadcastTime ? lock.timestamp - tx.broadcastTime : 0,
            });
          }
        }
      } catch (error: any) {
        this.logger.error('Error processing stream data:', error.message);
      }
    });

    this.stream.on('error', async (error: any) => {
      this.logger.error('Stream error:', error.message);
      await this.reconnectStream();
    });

    // Return cleanup function
    return () => this.stop();
  }

  /**
   * Wait for a specific transaction to be confirmed
   *
   * @param txid Transaction ID to wait for
   * @param addresses Addresses involved (for bloom filter)
   * @param options Confirmation requirements and timeout
   * @returns Confirmation result
   *
   * @example
   * ```typescript
   * const result = await monitor.waitForConfirmation(
   *   'abc123...',
   *   'yX3CJJ42...',
   *   { requireInstantLock: true, timeout: 180000 }
   * );
   * console.log('Confirmed via:', result.method);
   * ```
   */
  async waitForConfirmation(
    txid: string,
    addresses: string | string[],
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

    return new Promise<ConfirmationResult>(async (resolve, reject) => {
      let resolved = false;

      // Start monitoring addresses
      const unsubscribe = await this.watchAddresses(addresses, {
        onInstantLock: (lock) => {
          if (lock.txid === txid && requireInstantLock && !requireChainLock && !resolved) {
            resolved = true;
            const tx = this.tracker.getTransaction(txid);
            unsubscribe();
            resolve({
              txid,
              method: 'instantlock',
              instantLockTime: tx?.instantLockTime || null,
              chainLockTime: null,
              blockHeight: tx?.blockHeight || null,
              totalLatencyMs: Date.now() - startTime,
            });
          }
        },
        onChainLock: (cl) => {
          if (cl.txid === txid && !resolved) {
            resolved = true;
            const tx = this.tracker.getTransaction(txid);
            unsubscribe();
            resolve({
              txid,
              method: 'chainlock',
              instantLockTime: tx?.instantLockTime || null,
              chainLockTime: tx?.chainLockTime || null,
              blockHeight: tx?.blockHeight || null,
              totalLatencyMs: Date.now() - startTime,
            });
          }
        },
      });

      // Progress updates
      if (onProgress) {
        const progressInterval = setInterval(() => {
          if (resolved) {
            clearInterval(progressInterval);
            return;
          }

          const tx = this.tracker.getTransaction(txid);
          const status = tx?.status || 'waiting';
          onProgress({
            txid,
            status,
            message: `Waiting for confirmation (${status})`,
            elapsedMs: Date.now() - startTime,
          });
        }, 5000);
      }

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          unsubscribe();
          const tx = this.tracker.getTransaction(txid);
          resolve({
            txid,
            method: 'timeout',
            instantLockTime: tx?.instantLockTime || null,
            chainLockTime: tx?.chainLockTime || null,
            blockHeight: tx?.blockHeight || null,
            totalLatencyMs: Date.now() - startTime,
          });
        }
      }, timeout);
    });
  }

  /**
   * Reconnect stream after error with exponential backoff
   * @private
   */
  private async reconnectStream(): Promise<void> {
    if (this.reconnecting) {
      return; // Already reconnecting
    }

    this.reconnecting = true;
    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.config.maxReconnectAttempts!) {
      this.logger.error(`❌ Max reconnect attempts (${this.config.maxReconnectAttempts}) reached`);
      this.emit('maxReconnectAttemptsReached');
      this.stop();
      return;
    }

    // Exponential backoff delay
    const delay = this.config.reconnectDelay! * Math.pow(2, this.reconnectAttempts - 1);
    this.logger.info(
      `🔄 Reconnecting stream (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}) in ${delay}ms...`
    );
    this.emit('reconnecting', this.reconnectAttempts);

    await new Promise((r) => setTimeout(r, delay));

    try {
      // Cancel old stream
      if (this.stream) {
        try {
          this.stream.cancel();
        } catch (e) {
          // Ignore errors during cleanup
        }
        this.stream = null;
      }

      // Determine resume height
      const resumeHeight =
        this.lastBlockHeight || (await this.dapiClient.core.getBestBlockHeight());

      this.logger.debug(`   Resuming from height: ${resumeHeight}`);

      // Recreate bloom filter from saved addresses
      const bloomFilter = createAddressBloomFilter(
        this.monitoredAddresses,
        this.config.network,
        this.config.bloomFalsePositiveRate
      );

      // Subscribe to new stream
      this.stream = await this.dapiClient.core.subscribeToTransactionsWithProofs(bloomFilter, {
        fromBlockHeight: resumeHeight,
        count: 0,
      });

      // Track current block height for MerkleBlock processing
      let trackedBlockHeight = resumeHeight;

      // Reattach data handler
      this.stream.on('data', (response: any) => {
        try {
          // Parse and process transactions
          const transactions = parseTransactions(response, this.config.network);
          for (const parsedTx of transactions) {
            // Check if involves monitored addresses
            const involvesMonitoredAddress = this.monitoredAddresses.some((addr) =>
              transactionInvolvesAddress(parsedTx, addr)
            );

            if (involvesMonitoredAddress) {
              this.tracker.addBroadcast(parsedTx.txid, parsedTx.transaction);

              if (this.currentCallbacks?.onTransaction) {
                this.currentCallbacks.onTransaction({
                  txid: parsedTx.txid,
                  timestamp: Date.now(),
                  transaction: parsedTx.transaction,
                });
              }
            }
          }

          // Parse and process MerkleBlock
          const merkleBlock = parseMerkleBlock(response, trackedBlockHeight);
          if (merkleBlock) {
            // Track block height for reconnection
            this.lastBlockHeight = merkleBlock.blockHeight;

            this.logger.debug(
              `📦 MerkleBlock: height ${merkleBlock.blockHeight}, ${merkleBlock.txids.length} txids`
            );

            for (const txid of merkleBlock.txids) {
              this.tracker.recordBlockInclusion(
                txid,
                merkleBlock.blockHeight,
                merkleBlock.blockHash
              );

              this.logger.debug(
                `   Recorded: ${txid.substring(0, 16)}... at height ${merkleBlock.blockHeight}`
              );

              if (
                this.currentCallbacks?.onBlockInclusion &&
                this.tracker.isMonitored(txid)
              ) {
                this.currentCallbacks.onBlockInclusion({
                  txid,
                  blockHeight: merkleBlock.blockHeight,
                  blockHash: merkleBlock.blockHash,
                  timestamp: merkleBlock.timestamp,
                });
              }
            }
          }

          // Parse and process InstantLocks
          const instantLocks = parseInstantLocks(response);
          for (const lock of instantLocks) {
            const wasNew = this.tracker.recordInstantLock(lock.txid, lock.timestamp);

            if (
              wasNew &&
              this.currentCallbacks?.onInstantLock &&
              this.tracker.isMonitored(lock.txid)
            ) {
              const tx = this.tracker.getTransaction(lock.txid);
              this.currentCallbacks.onInstantLock({
                txid: lock.txid,
                timestamp: lock.timestamp,
                latency: tx?.broadcastTime ? lock.timestamp - tx.broadcastTime : 0,
              });
            }
          }
        } catch (error: any) {
          this.logger.error('Error processing stream data:', error.message);
        }
      });

      // Reattach error handler
      this.stream.on('error', async (error: any) => {
        this.logger.error('Stream error:', error.message);
        await this.reconnectStream();
      });

      // Success!
      this.reconnecting = false;
      this.reconnectAttempts = 0;
      this.logger.info('✅ Stream reconnected successfully');
      this.emit('reconnected');
    } catch (error: any) {
      this.logger.error('Reconnection failed:', error.message);
      this.reconnecting = false;

      // Try DAPI failover if enabled
      if (this.config.enableDAPIFailover && this.availableDapiNodes.length > 1) {
        const oldNode = this.getCurrentNode();
        this.markCurrentNodeFailed();

        if (this.rotateToNextDapiNode()) {
          const newNode = this.getCurrentNode();
          this.logger.info(`🔀 Failing over from ${oldNode} to ${newNode}`);
          this.emit('dapiFailover', { oldNode, newNode });

          // Recreate DAPI client with new node
          this.dapiClient = null;
          await this.initializeDAPIClient();

          // Reset reconnect attempts for new node
          this.reconnectAttempts = 0;

          // Try reconnecting with new node
          await this.reconnectStream();
          return;
        } else {
          this.logger.warn('⚠️  All DAPI nodes recently failed, continuing with exponential backoff');
        }
      }

      // Continue with exponential backoff (recursive call will increment attempts)
      await this.reconnectStream();
    }
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

    if (this.stream) {
      try {
        this.stream.cancel();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.stream = null;
    }
  }

  /**
   * Get current monitoring status
   */
  getStatus(): {
    active: boolean;
    instantSendAvailable: boolean;
    chainLockAvailable: boolean;
    trackedTransactions: number;
    chainLockHeight: number;
  } {
    return {
      active: this.isActive,
      instantSendAvailable: this.instantSendAvailable,
      chainLockAvailable: this.chainLockAvailable,
      trackedTransactions: this.tracker.getAllTransactions().length,
      chainLockHeight: this.chainLockMonitor?.getCurrentHeight() || 0,
    };
  }

  /**
   * Get tracked transaction state
   */
  getTransaction(txid: string) {
    return this.tracker.getTransaction(txid);
  }

  /**
   * Clear a specific transaction from tracking
   * Useful for manual memory management
   * @param txid Transaction ID to clear
   */
  clearTransaction(txid: string): void {
    this.tracker.clearTransaction(txid);
  }

  /**
   * Clear all confirmed (chainlocked) transactions
   * Useful for manual memory management in long-running processes
   */
  clearAllConfirmed(): void {
    this.tracker.clearAllConfirmed();
  }

  /**
   * Get memory usage statistics
   * @returns Memory stats including transaction count and limits
   */
  getMemoryStats(): {
    trackedTransactions: number;
    maxTrackedTransactions: number;
    autoPruneEnabled: boolean;
    blockHeightMapSize: number;
    monitoredTxIds: number;
  } {
    return {
      trackedTransactions: this.tracker.getAllTransactions().length,
      maxTrackedTransactions: this.config.maxTrackedTransactions!,
      autoPruneEnabled: this.config.autoPruneOnConfirmation!,
      blockHeightMapSize: this.tracker.getBlockHeightMapSize(),
      monitoredTxIds: this.tracker.getMonitoredTxIds().size,
    };
  }
}
