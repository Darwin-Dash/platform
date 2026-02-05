/**
 * RealtimeFinder - Real-time InstantSend/ChainLock monitoring
 *
 * Monitors addresses for incoming transactions and tracks confirmation
 * through InstantLock and ChainLock stages.
 *
 * Features:
 * - InstantLock detection (~1-3 seconds)
 * - ChainLock confirmation (~1-3 minutes)
 * - Immediate stream reconnection on preRegisterTransaction() for IS proof
 * - Periodic stream reconnection to catch missed transactions
 * - Polling-based IS/CL fallback (TransactionStatusPoller)
 * - Transaction state tracking
 *
 * DAPI stream behavior:
 * - DAPI streams stall after the initial historical + mempool scan.
 *   Despite the server-side polling loop, no new ZMQ events are
 *   delivered to the client after the initial batch completes.
 *   Empirical testing confirms: 30+ seconds of silence after scan.
 * - A fresh stream registers a new bloom filter emitter on the DAPI
 *   server IMMEDIATELY (before historical blocks are sent). IS events
 *   arriving via ZMQ during the scan are cached in the server's
 *   `unretrievedInstantLocks` map and flushed after MEMPOOL_DATA_SENT.
 * - The IS ZMQ event is a one-time broadcast. A new emitter must be
 *   registered BEFORE IS fires AND the tx must be in the DAPI node's
 *   `transactionHashesMap` (populated during mempool scan) for IS
 *   delivery. To satisfy both: reconnect from ~50 blocks back so the
 *   scan phase runs long enough for the tx to reach mempool via P2P
 *   AND for IS to fire while the preMempoolSentInstantLockListener
 *   is still active. Reconnecting from current tip makes the scan
 *   too fast — MEMPOOL_DATA_SENT fires before IS arrives.
 * - preRegisterTransaction() reconnects immediately (0ms delay) by
 *   default. The caller should invoke preRegister BEFORE broadcasting
 *   the transaction to maximize the IS capture window.
 * - A grace period prevents periodic reconnection from interfering
 *   with the IS delivery window after preRegisterTransaction().
 */

import { EventEmitter } from 'events';
import { BloomFilterBuilder } from '../core/BloomFilterBuilder.js';
import { StreamWrapper } from '../core/StreamWrapper.js';
import { TransactionTracker } from '../monitoring/TransactionTracker.js';
import { ChainLockHeightMonitor } from '../monitoring/ChainLockHeightMonitor.js';
import { TransactionStatusPoller } from '../monitoring/TransactionStatusPoller.js';
import { NodeHealthTracker, NodeStats } from '../monitoring/NodeHealthTracker.js';
import { MultiNodeIsHunter, IsHuntResult } from '../monitoring/MultiNodeIsHunter.js';
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

  // Grace period for IS proof delivery:
  // When preRegisterTransaction() is called, periodic reconnection is PAUSED
  // so the existing gRPC stream stays alive. The stream's subscription will
  // naturally receive the tx and IS proof bytes after broadcast.
  // If the stream detects the pre-registered tx, the grace period is extended.
  // DAPI only delivers IS bytes for ZMQ events received AFTER stream opens —
  // reconnecting after IS won't help. The live stream is our only chance.
  private reconnectPausedUntil: number = 0;
  private preRegisteredTxids: Set<string> = new Set();

  // Multi-node IS hunting (for nodes without ZMQ rawtxlocksig)
  private nodeHealthTracker: NodeHealthTracker;
  private multiNodeIsHunter: MultiNodeIsHunter | null = null;

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

    // Initialize node health tracking
    this.nodeHealthTracker = new NodeHealthTracker({
      blacklistThreshold: config.isHuntingBlacklistThreshold ?? 1,
    });

    // Initialize multi-node IS hunter if enabled
    const multiNodeEnabled = config.multiNodeIsHunting ?? true;
    if (multiNodeEnabled) {
      this.multiNodeIsHunter = new MultiNodeIsHunter(this.nodeHealthTracker, {
        network: config.network,
        nodeCount: config.isHuntingNodes ?? 3,
        timeoutMs: config.isHuntingTimeoutMs ?? 3000,
      });
      this.logger.info(`Multi-node IS hunting enabled (${config.isHuntingNodes ?? 3} nodes, ${config.isHuntingTimeoutMs ?? 3000}ms timeout)`);
    }
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
    // Reconnection is paused after preRegisterTransaction() so the stream
    // stays alive for IS proof byte delivery.
    const reconnectInterval = this.config.streamReconnectInterval ?? 60000;
    if (reconnectInterval > 0) {
      this.reconnectTimer = setInterval(() => {
        if (this.isActive && Date.now() >= this.reconnectPausedUntil) {
          this.reconnectStream().catch((err) =>
            this.logger.warn('Periodic reconnect failed:', (err as Error).message)
          );
        } else if (this.isActive && Date.now() < this.reconnectPausedUntil) {
          this.logger.debug('Periodic reconnect skipped (grace period: stream alive for IS proof bytes)');
        }
      }, reconnectInterval);
    }

    // Return cleanup function
    return () => this.stop();
  }

  /**
   * Reconnect the DAPI stream.
   * Forces the server to re-run its historical data + mempool scan phases,
   * catching any transactions missed during continuous streaming.
   * @param fromCurrentTip If true, subscribes from ~50 blocks behind the
   *   current tip. This keeps the scan phase (preMempoolSentInstantLockListener)
   *   active long enough for the broadcast tx to propagate to the DAPI node
   *   and for the IS ZMQ event to fire during the scan — both conditions
   *   required for IS proof byte delivery.
   *   If false (default), reconnects from lastBlockHeight - 1.
   * @private
   */
  private async reconnectStream(fromCurrentTip: boolean = false): Promise<void> {
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

      const core = (this.config.dapiClient as any).core;
      let reconnectHeight: number;

      if (fromCurrentTip) {
        // Subscribe from slightly behind the tip so the scan phase takes
        // long enough for both the tx to propagate to the DAPI node's mempool
        // AND the IS ZMQ event to fire while the preMempoolSentInstantLockListener
        // is still active. DAPI caches IS events during the scan phase in
        // `unretrievedInstantLocks` and flushes them after MEMPOOL_DATA_SENT.
        // Subscribing from exactly the tip makes the scan too fast — it completes
        // before our broadcast tx reaches the mempool or IS fires.
        // Subscribe from behind the tip so the historical + mempool scan
        // phase takes long enough for both:
        //   1. The broadcast tx to propagate via P2P to the DAPI node's mempool
        //   2. The IS ZMQ event to fire while preMempoolSentInstantLockListener is active
        // DAPI caches IS events during scan and flushes after MEMPOOL_DATA_SENT.
        // 200 blocks back (~8min on Dash) extends the scan to ~3-8s, covering
        // the IS delivery window (~2-3s after broadcast) while keeping bloom
        // filter false positives manageable.
        const currentTip = await core.getBestBlockHeight();
        reconnectHeight = Math.max(1, currentTip - 200);
      } else {
        // Re-subscribe from lastBlockHeight - 1 to catch missed txs.
        // Use max(1, lastBlockHeight - 1) to ensure we request a block
        // height that definitely exists on the DAPI node.
        reconnectHeight = Math.max(1, this.lastBlockHeight - 1);
      }

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

      this.logger.info(`Stream reconnected from height ${reconnectHeight}${fromCurrentTip ? ' (near tip, extended scan for IS capture)' : ''}`);
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

        // Debug: log available message fields
        const hasRawTx = typeof msg.getRawTransactions === 'function';
        const hasRawMerkle = typeof msg.getRawMerkleBlock === 'function';
        const hasISLock = typeof msg.getInstantSendLockMessages === 'function';
        const isLockResult = hasISLock ? msg.getInstantSendLockMessages() : null;
        const hasISLockProp = 'instantSendLockMessages' in msg;
        this.logger.debug(`📨 Stream message: rawTx=${hasRawTx}, merkle=${hasRawMerkle}, isLock=${hasISLock}, isLockResult=${isLockResult != null ? 'object' : 'null'}, isLockProp=${hasISLockProp}`);

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

                  // Pre-registered tx found on stream — extend grace period
                  // to keep the stream alive for IS proof byte delivery (~1-2s after detection).
                  if (this.preRegisteredTxids.has(txid)) {
                    const gracePeriod = this.config.reconnectGracePeriod ?? 15000;
                    this.reconnectPausedUntil = Date.now() + gracePeriod;
                    this.logger.info(`⏸️ Grace period extended: tx ${txid.substring(0, 16)}... found — ${gracePeriod}ms`);
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

        // Debug IS lock parsing
        if (instantLockMessages) {
          const hasGetMessagesList = typeof instantLockMessages.getMessagesList === 'function';
          const isArray = Array.isArray(instantLockMessages);
          this.logger.debug(`🔒 IS lock messages object: type=${typeof instantLockMessages}, hasGetMessagesList=${hasGetMessagesList}, isArray=${isArray}, keys=${Object.keys(instantLockMessages || {}).join(',')}`);
        }

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

              // Check if hex was absent before this call
              const txBeforeRecord = this.tracker.getTransaction(txid);
              const hadHex = txBeforeRecord?.instantLockHex != null;

              const wasNew = this.tracker.recordInstantLock(txid, timestamp, instantLockHex);

              // Fire callback if IS is new OR if hex was just delivered for the first time
              const hexJustDelivered = !hadHex && instantLockHex
                && this.tracker.getTransaction(txid)?.instantLockHex != null;

              if ((wasNew || hexJustDelivered) && callbacks.onInstantLock && isMonitored) {
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
              // Trigger on wasNew (first IS detection) OR hexJustDelivered (stream
              // delivers hex after poller already detected IS).
              if ((wasNew || hexJustDelivered) && this.preRegisteredTxids.has(txid)) {
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

    const hexWaitMs = this.config.instantLockHexWaitMs ?? 8000;

    return new Promise<ConfirmationResult>((resolve) => {
      let resolved = false;
      let instantLockDetectedAt: number | null = null;

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
          // Hex available — resolve immediately
          if (tx.instantLockHex) {
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
            return;
          }

          // No hex yet — wait for stream to deliver proof bytes
          if (hexWaitMs > 0 && (this.preRegisteredTxids.has(txid) || instantLockDetectedAt)) {
            if (!instantLockDetectedAt) {
              instantLockDetectedAt = Date.now();
              this.logger.info(`⏳ IS detected without hex for ${txid.substring(0, 16)}... — waiting for stream (up to ${hexWaitMs}ms)`);
            }

            // Check if hex arrived from stream
            const txCheck = this.tracker.getTransaction(txid);
            if (txCheck?.instantLockHex) {
              this.logger.info(`✅ IS hex delivered for ${txid.substring(0, 16)}...`);
              resolved = true;
              resolve({
                txid,
                method: 'instantlock',
                instantLockTime: txCheck.instantLockTime,
                chainLockTime: null,
                blockHeight: txCheck.blockHeight,
                totalLatencyMs: Date.now() - startTime,
                instantLockHex: txCheck.instantLockHex,
              });
              return;
            }

            if (Date.now() - instantLockDetectedAt >= hexWaitMs) {
              // Re-check hex one final time (may have arrived during wait)
              const txFinal = this.tracker.getTransaction(txid);
              if (txFinal?.instantLockHex) {
                this.logger.info(`✅ Hex arrived during wait — resolving with hex`);
                resolved = true;
                resolve({
                  txid,
                  method: 'instantlock',
                  instantLockTime: txFinal.instantLockTime,
                  chainLockTime: null,
                  blockHeight: txFinal.blockHeight,
                  totalLatencyMs: Date.now() - startTime,
                  instantLockHex: txFinal.instantLockHex,
                });
                return;
              }
              // Waited long enough — resolve without hex (SDK falls back to ChainLock)
              this.logger.info(`⏳ Hex wait expired after ${hexWaitMs}ms — resolving without hex`);
              resolved = true;
              resolve({
                txid,
                method: 'instantlock',
                instantLockTime: tx.instantLockTime,
                chainLockTime: null,
                blockHeight: tx.blockHeight,
                totalLatencyMs: Date.now() - startTime,
                instantLockHex: null,
              });
            }
            // else: still waiting, check again next tick
          } else {
            // Non-pre-registered tx or hex wait disabled — resolve immediately without hex
            resolved = true;
            resolve({
              txid,
              method: 'instantlock',
              instantLockTime: tx.instantLockTime,
              chainLockTime: null,
              blockHeight: tx.blockHeight,
              totalLatencyMs: Date.now() - startTime,
              instantLockHex: null,
            });
          }
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
   * When multi-node IS hunting is enabled (default), this also triggers
   * parallel streams to multiple DAPI nodes to increase the chance of
   * receiving IS hex from a node that has ZMQ rawtxlocksig enabled.
   *
   * @param txid Transaction ID to pre-register
   */
  preRegisterTransaction(txid: string): void {
    this.logger.debug(`📝 Pre-registering txid: ${txid}`);
    this.tracker.addBroadcast(txid);
    this.preRegisteredTxids.add(txid);

    if (this.isActive) {
      // Always set grace period to prevent periodic reconnects during IS delivery window
      const gracePeriod = this.config.reconnectGracePeriod ?? 15000;
      this.reconnectPausedUntil = Date.now() + gracePeriod;
      this.logger.info(`⏸️ Paused reconnection for ${gracePeriod}ms (stream alive for IS proof delivery)`);

      // Multi-node IS hunting: open parallel streams to multiple nodes
      // This increases the chance of hitting a node with rawtxlocksig enabled
      if (this.multiNodeIsHunter && this.config.dapiClient) {
        this.logger.info(`🎯 Starting multi-node IS hunt for ${txid.substring(0, 16)}...`);
        this.multiNodeIsHunter.huntIsHex(
          this.config.dapiClient,
          txid,
          this.monitoredAddresses,
          this.bloomFilter
        ).then((result: IsHuntResult) => {
          if (result.found && result.instantLockHex) {
            // Record IS in tracker (will trigger callback if new)
            const timestamp = Date.now();
            const wasNew = this.tracker.recordInstantLock(txid, timestamp, result.instantLockHex);

            if (wasNew && this.monitoredCallbacks.onInstantLock) {
              const tx = this.tracker.getTransaction(txid);
              this.monitoredCallbacks.onInstantLock({
                txid,
                timestamp,
                latency: tx?.broadcastTime ? timestamp - tx.broadcastTime : 0,
                instantLockHex: result.instantLockHex,
              });
            }

            // Remove from pre-registered set and clear grace period
            this.preRegisteredTxids.delete(txid);
            if (this.preRegisteredTxids.size === 0 && this.reconnectPausedUntil > Date.now()) {
              this.reconnectPausedUntil = 0;
              this.logger.info('▶️  All pre-registered txids have IS proof — grace period cleared');
            }
          } else {
            this.logger.info(`Multi-node IS hunt did not find hex (falling back to single stream)`);
          }
        }).catch((err: Error) => {
          this.logger.warn(`Multi-node IS hunt failed: ${err.message}`);
        });
      }

      const reconnectOnPreRegister = this.config.reconnectOnPreRegister ?? true;
      if (reconnectOnPreRegister) {
        // Reconnect for a fresh stream. Empirical testing confirms that DAPI
        // streams stall after the initial historical + mempool scan — no new ZMQ
        // events are delivered even after 30+ seconds. A fresh stream registers a
        // new bloom filter emitter on the DAPI server that captures IS events during
        // its scan phase (cached in unretrievedInstantLocks, flushed after
        // MEMPOOL_DATA_SENT). Default 0ms (immediate) — the caller should invoke
        // preRegister BEFORE broadcasting so the emitter is registered before IS fires.
        const reconnectDelay = this.config.preRegisterReconnectDelay ?? 0;
        this.logger.info(`🔄 Scheduling stream reconnect in ${reconnectDelay}ms for IS proof delivery`);
        setTimeout(() => {
          if (this.isActive) {
            this.reconnectStream(true).catch((err) =>
              this.logger.warn('Reconnect on preRegister failed:', (err as Error).message)
            );
          }
        }, reconnectDelay);
      }
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

  /**
   * Get node health statistics for IS hex delivery.
   *
   * Returns information about which DAPI nodes have successfully delivered
   * InstantSend hex and which have been blacklisted for failing to do so.
   * Useful for debugging and monitoring multi-node IS hunting.
   *
   * @returns Node health summary and per-node statistics
   */
  getNodeHealth(): {
    /** Total number of nodes tracked */
    totalTracked: number;
    /** Number of healthy (non-blacklisted) nodes */
    healthy: number;
    /** Number of blacklisted nodes */
    blacklisted: number;
    /** Total successful IS hex deliveries */
    totalSuccesses: number;
    /** Total failed IS hex deliveries */
    totalFailures: number;
    /** Per-node statistics */
    nodes: Map<string, NodeStats>;
  } {
    const summary = this.nodeHealthTracker.getSummary();
    return {
      totalTracked: summary.totalTracked,
      healthy: summary.healthy,
      blacklisted: summary.blacklisted,
      totalSuccesses: summary.totalSuccesses,
      totalFailures: summary.totalFailures,
      nodes: this.nodeHealthTracker.getAllStats(),
    };
  }

  /**
   * Clear the node health blacklist.
   *
   * Useful for testing or when you want to give previously blacklisted
   * nodes another chance. Does not clear success/failure statistics.
   */
  clearNodeBlacklist(): void {
    this.nodeHealthTracker.clearBlacklist();
    this.logger.info('Node health blacklist cleared');
  }

  /**
   * Reset all node health tracking data.
   *
   * Clears all tracked nodes, blacklist, and statistics.
   */
  resetNodeHealth(): void {
    this.nodeHealthTracker.clear();
    this.logger.info('Node health tracking reset');
  }
}
