/**
 * RealtimeFinder - Real-time InstantSend/ChainLock monitoring
 *
 * Monitors addresses for incoming transactions and tracks confirmation
 * through InstantLock and ChainLock stages.
 *
 * Features:
 * - InstantLock detection (~1-3 seconds)
 * - ChainLock confirmation (~1-3 minutes)
 * - On-demand transaction detection via parallel multi-node streams
 * - Multi-node IS hex hunting for reliable IS proof delivery
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
 *   delivery.
 *
 * On-Demand Detection Flow:
 * - Call monitorAddresses() with callbacks BEFORE transactions are sent
 * - Parallel streams to multiple DAPI nodes maximize IS hex capture odds
 * - When a transaction is detected, onTransaction fires with txid and data
 * - When IS hex arrives, onInstantLock fires with instantLockHex
 * - No preRegistration needed - all data comes via callbacks
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
import DAPIClient from '@dashevo/dapi-client';

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

  // Multi-node IS hunting (for nodes without ZMQ rawtxlocksig)
  private nodeHealthTracker: NodeHealthTracker;
  private multiNodeIsHunter: MultiNodeIsHunter | null = null;

  // Parallel streams for on-demand IS hex capture
  private parallelStreams: any[] = [];
  private parallelStreamCallbacks: RealtimeFinderCallbacks = {};
  private parallelStreamNodes: Map<number, string> = new Map(); // Maps stream index to node address

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

    // Seed known-good IS nodes if provided
    if (config.knownGoodIsNodes && config.knownGoodIsNodes.length > 0) {
      this.nodeHealthTracker.seedKnownGood(config.knownGoodIsNodes);
      this.logger.info(`Seeded ${config.knownGoodIsNodes.length} known-good IS nodes`);
    }

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
    const reconnectInterval = this.config.streamReconnectInterval ?? 60000;
    if (reconnectInterval > 0) {
      this.reconnectTimer = setInterval(() => {
        if (this.isActive) {
          this.reconnectStream().catch((err) =>
            this.logger.warn('Periodic reconnect failed:', (err as Error).message)
          );
        }
      }, reconnectInterval);
    }

    // Open additional parallel streams for on-demand IS hex capture.
    // Multi-node IS hunting requires multiple streams to be open BEFORE transactions
    // are broadcast, so we open parallel streams here rather than waiting for
    // transaction detection. This ensures at least one stream is connected to a
    // DAPI node with ZMQ rawtxlocksig enabled.
    const multiNodeEnabled = this.config.multiNodeIsHunting ?? true;
    const parallelStreamCount = this.config.isHuntingNodes ?? 3;
    if (multiNodeEnabled && parallelStreamCount > 1) {
      this.parallelStreamCallbacks = callbacks;
      this.startParallelStreams(currentHeight, bloomFilter, addressArray, callbacks)
        .catch((err) => {
          this.logger.warn('Failed to start parallel streams:', (err as Error).message);
        });
    }

    // Return cleanup function
    return () => this.stop();
  }

  /**
   * Start parallel streams for on-demand IS hex capture.
   * These streams run continuously to catch IS hex as it arrives.
   * Uses per-node DAPIClient instances to connect to specific known-good nodes
   * when available, maximizing the chance of IS hex delivery.
   * @private
   */
  private async startParallelStreams(
    fromHeight: number,
    bloomFilter: any,
    addresses: string[],
    callbacks: RealtimeFinderCallbacks
  ): Promise<void> {
    const parallelStreamCount = (this.config.isHuntingNodes ?? 3) - 1; // -1 because primary stream already running
    if (parallelStreamCount <= 0) return;

    // Get known-good nodes to prioritize for parallel streams
    const knownGoodNodes = this.nodeHealthTracker.getHealthyNodes();
    const hasKnownGood = knownGoodNodes.length > 0;

    this.logger.info(`Starting ${parallelStreamCount} parallel streams for on-demand IS hex capture`);
    if (hasKnownGood) {
      this.logger.info(`  Using ${Math.min(knownGoodNodes.length, parallelStreamCount)} known-good IS nodes`);
    }

    for (let i = 0; i < parallelStreamCount; i++) {
      try {
        let nodeClient: any;
        let nodeAddr: string | null = null;

        // Use known-good node if available, otherwise fall back to shared client
        if (hasKnownGood && i < knownGoodNodes.length) {
          nodeAddr = knownGoodNodes[i];
          // Create a dedicated DAPIClient pinned to this specific node
          nodeClient = new DAPIClient({
            dapiAddresses: [nodeAddr],
            network: this.config.network,
            timeout: 60000,
          });
          this.logger.debug(`Parallel stream ${i + 1}: using known-good node ${nodeAddr}`);
        } else {
          // Fall back to the shared DAPI client (will use random node)
          nodeClient = this.config.dapiClient;
          this.logger.debug(`Parallel stream ${i + 1}: using shared DAPI client`);
        }

        const core = nodeClient.core;
        let rawStream = core.subscribeToTransactionsWithProofs(bloomFilter, {
          fromBlockHeight: fromHeight,
          count: 0,
        });

        if (rawStream && typeof rawStream.then === 'function') {
          rawStream = await rawStream;
        }

        this.parallelStreams.push(rawStream);
        const asyncStream = StreamWrapper.makeAsyncIterable(rawStream);

        // Track node address for this stream (for health tracking)
        if (nodeAddr) {
          this.parallelStreamNodes.set(i + 1, nodeAddr);
        }

        // Process this parallel stream for IS hex only (avoid duplicate TX callbacks)
        this.processParallelStreamForIsHex(asyncStream, addresses, callbacks, i + 1)
          .catch((error) => {
            if (this.isActive) {
              this.logger.debug(`Parallel stream ${i + 1} ended: ${(error as Error).message}`);
            }
          });
      } catch (error) {
        this.logger.warn(`Failed to open parallel stream ${i + 1}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Process a parallel stream looking only for IS hex.
   * Avoids firing duplicate transaction callbacks since the primary stream handles those.
   * @private
   */
  private async processParallelStreamForIsHex(
    stream: AsyncIterable<any>,
    addresses: string[],
    callbacks: RealtimeFinderCallbacks,
    streamIndex: number
  ): Promise<void> {
    this.logger.debug(`Parallel stream ${streamIndex} started, listening for IS hex`);

    try {
      for await (const message of stream) {
        if (!this.isActive) break;

        const msg = message as any;

        // Only process InstantLock messages from parallel streams
        const instantLockMessages = typeof msg.getInstantSendLockMessages === 'function'
          ? msg.getInstantSendLockMessages()
          : msg.instantSendLockMessages;

        const instantLockList = instantLockMessages?.getMessagesList
          ? instantLockMessages.getMessagesList()
          : (Array.isArray(instantLockMessages) ? instantLockMessages : null);

        if (instantLockList && instantLockList.length > 0) {
          for (const lockBuf of instantLockList) {
            try {
              const lock: any = (InstantLock as any).fromBuffer(Buffer.from(lockBuf));
              const txid = lock.txid.toString('hex');
              const timestamp = Date.now();
              const instantLockHex = Buffer.from(lockBuf).toString('hex');

              // Check if this tx is one we're tracking
              const isMonitored = this.tracker.isMonitored(txid);
              if (!isMonitored) continue;

              // Check if we already have hex for this tx
              const txBefore = this.tracker.getTransaction(txid);
              if (txBefore?.instantLockHex) continue; // Already have hex

              this.logger.info(`🎯 Parallel stream ${streamIndex} captured IS hex for ${txid.substring(0, 16)}...`);

              const wasNew = this.tracker.recordInstantLock(txid, timestamp, instantLockHex);
              const hexJustDelivered = !txBefore?.instantLockHex && instantLockHex
                && this.tracker.getTransaction(txid)?.instantLockHex != null;

              if ((wasNew || hexJustDelivered) && callbacks.onInstantLock) {
                const txAfter = this.tracker.getTransaction(txid);
                callbacks.onInstantLock({
                  txid,
                  timestamp,
                  latency: txAfter?.broadcastTime ? timestamp - txAfter.broadcastTime : 0,
                  instantLockHex,
                });
              }

              // Node health tracking: record success with actual node address
              const nodeAddr = this.parallelStreamNodes.get(streamIndex);
              if (nodeAddr) {
                this.nodeHealthTracker.recordSuccess(nodeAddr);
                this.logger.debug(`Recorded IS hex success for node ${nodeAddr}`);
              }
            } catch (error) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      // Stream ended or errored
      if (this.isActive) {
        this.logger.debug(`Parallel stream ${streamIndex} error: ${(error as Error).message}`);
      }
    }
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

                  // On-demand multi-node IS hunting: when a NEW transaction is detected,
                  // automatically trigger multi-node IS hunting to maximize chances of
                  // getting IS hex. This handles the case where the primary stream's
                  // DAPI node doesn't have ZMQ rawtxlocksig enabled.
                  if (isNew && this.multiNodeIsHunter && this.config.dapiClient) {
                    this.logger.info(`🎯 Auto-triggering multi-node IS hunt for detected tx ${txid.substring(0, 16)}...`);
                    this.multiNodeIsHunter.huntIsHex(
                      this.config.dapiClient,
                      txid,
                      this.monitoredAddresses,
                      this.bloomFilter
                    ).then((result: IsHuntResult) => {
                      if (result.found && result.instantLockHex) {
                        const timestamp = Date.now();
                        const txBeforeRecord = this.tracker.getTransaction(txid);
                        const hadHex = txBeforeRecord?.instantLockHex != null;
                        const wasNew = this.tracker.recordInstantLock(txid, timestamp, result.instantLockHex);

                        // Fire callback if IS is new OR if hex was just delivered
                        const hexJustDelivered = !hadHex && result.instantLockHex
                          && this.tracker.getTransaction(txid)?.instantLockHex != null;

                        if ((wasNew || hexJustDelivered) && callbacks.onInstantLock && this.tracker.isMonitored(txid)) {
                          const txAfter = this.tracker.getTransaction(txid);
                          callbacks.onInstantLock({
                            txid,
                            timestamp,
                            latency: txAfter?.broadcastTime ? timestamp - txAfter.broadcastTime : 0,
                            instantLockHex: result.instantLockHex,
                          });
                        }
                        this.logger.info(`✅ Multi-node IS hunt delivered hex for ${txid.substring(0, 16)}...`);
                      }
                    }).catch((err: Error) => {
                      this.logger.warn(`Multi-node IS hunt failed for ${txid.substring(0, 16)}...: ${err.message}`);
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

          // No hex yet — wait for parallel streams to deliver proof bytes
          if (hexWaitMs > 0) {
            if (!instantLockDetectedAt) {
              instantLockDetectedAt = Date.now();
              this.logger.info(`⏳ IS detected without hex for ${txid.substring(0, 16)}... — waiting for parallel streams (up to ${hexWaitMs}ms)`);
            }

            // Check if hex arrived from parallel streams
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
            // Hex wait disabled — resolve immediately without hex
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

    // Clean up parallel streams
    for (const parallelStream of this.parallelStreams) {
      if (typeof parallelStream.on === 'function') {
        parallelStream.on('error', () => {});
      }
      if (typeof parallelStream.cancel === 'function') {
        try { parallelStream.cancel(); } catch (_) { /* ignore cleanup errors */ }
      }
    }
    this.parallelStreams = [];
  }

  /**
   * Get tracked transaction state
   */
  getTransaction(txid: string) {
    return this.tracker.getTransaction(txid);
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

  /**
   * Export node health data for persistence.
   *
   * Returns a JSON-serializable object containing:
   * - knownGood: Array of node addresses with high IS hex success rates
   * - learned: Per-node statistics (successes, failures, blacklist status)
   *
   * This data can be saved to a file and loaded via the `knownGoodIsNodes`
   * config option on future runs for faster IS hex discovery.
   *
   * @returns Node health data suitable for JSON serialization
   */
  exportNodeHealth(): {
    version: number;
    generated: string;
    knownGood: string[];
    learned: Record<string, { successes: number; failures: number; blacklisted?: boolean }>;
  } {
    return this.nodeHealthTracker.exportHealth();
  }
}
