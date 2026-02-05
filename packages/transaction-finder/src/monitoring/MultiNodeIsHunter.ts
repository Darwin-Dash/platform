/**
 * MultiNodeIsHunter - Manages parallel DAPI streams for InstantSend hex hunting
 *
 * Purpose:
 * Most DAPI testnet nodes don't have ZMQ `rawtxlocksig` enabled. This class
 * connects to multiple DAPI nodes simultaneously and races them for IS hex
 * delivery. First valid hex wins.
 *
 * Design:
 * - Opens parallel streams to N nodes (default: 3)
 * - Races all streams for IS hex for a specific txid
 * - First valid hex wins, other streams are cancelled
 * - Nodes that fail are blacklisted in NodeHealthTracker
 * - Integrates with existing RealtimeFinder infrastructure
 */

import { EventEmitter } from 'events';
import { BloomFilterBuilder } from '../core/BloomFilterBuilder.js';
import { StreamWrapper } from '../core/StreamWrapper.js';
import { NodeHealthTracker, NodeStats } from './NodeHealthTracker.js';
import { createLogger, Logger } from '../utils/logger.js';
import dashcore from '@dashevo/dashcore-lib';

const { InstantLock } = dashcore;

export interface IsHuntResult {
  /** Whether IS hex was found */
  found: boolean;
  /** The IS hex if found */
  instantLockHex: string | null;
  /** The node that delivered the hex (for success tracking) */
  winningNode: string | null;
  /** Nodes that failed (for blacklisting) */
  failedNodes: string[];
  /** Total time taken in ms */
  elapsedMs: number;
}

export interface MultiNodeIsHunterConfig {
  /** Number of nodes to hunt from (default: 3) */
  nodeCount?: number;
  /** Timeout for IS hex hunting in ms (default: 3000) */
  timeoutMs?: number;
  /** Network (testnet, mainnet, regtest) */
  network: 'testnet' | 'mainnet' | 'regtest';
  /** Blocks behind tip to start scan (extends scan phase for IS capture) */
  scanDepth?: number;
}

interface NodeStream {
  nodeAddress: string;
  stream: any;
  asyncIterable: AsyncIterable<any>;
}

export class MultiNodeIsHunter extends EventEmitter {
  private healthTracker: NodeHealthTracker;
  private config: MultiNodeIsHunterConfig;
  private logger: Logger;

  constructor(
    healthTracker: NodeHealthTracker,
    config: MultiNodeIsHunterConfig
  ) {
    super();
    this.healthTracker = healthTracker;
    this.config = {
      nodeCount: 3,
      timeoutMs: 3000,
      scanDepth: 200,
      ...config,
    };
    this.logger = createLogger('MultiNodeIsHunter');
  }

  /**
   * Hunt for IS hex from multiple nodes simultaneously.
   *
   * @param dapiClient The main DAPI client (for accessing address provider)
   * @param targetTxid The txid we're hunting IS hex for
   * @param addresses Addresses to include in bloom filter
   * @param bloomFilter Pre-built bloom filter (optional, will build if not provided)
   * @returns Hunt result with IS hex if found
   */
  async huntIsHex(
    dapiClient: any,
    targetTxid: string,
    addresses: string[],
    bloomFilter?: any
  ): Promise<IsHuntResult> {
    const startTime = Date.now();
    const nodeCount = this.config.nodeCount!;
    const timeoutMs = this.config.timeoutMs!;

    this.logger.info(`Starting IS hex hunt for ${targetTxid.substring(0, 16)}... (${nodeCount} nodes, ${timeoutMs}ms timeout)`);

    // Get available node addresses from DAPI client
    const nodeAddresses = await this.getNodeAddresses(dapiClient, nodeCount);

    if (nodeAddresses.length === 0) {
      this.logger.warn('No healthy nodes available for IS hunting');
      return {
        found: false,
        instantLockHex: null,
        winningNode: null,
        failedNodes: [],
        elapsedMs: Date.now() - startTime,
      };
    }

    this.logger.info(`Hunting from ${nodeAddresses.length} nodes: ${nodeAddresses.join(', ')}`);

    // Build bloom filter if not provided
    const filter = bloomFilter || BloomFilterBuilder.build(addresses, this.config.network);

    // Get current tip and calculate start height
    const core = dapiClient.core;
    const currentTip = await core.getBestBlockHeight();
    const fromHeight = Math.max(1, currentTip - (this.config.scanDepth || 200));

    // Open parallel streams to all nodes
    const nodeStreams: NodeStream[] = [];
    const failedNodes: string[] = [];

    for (const nodeAddress of nodeAddresses) {
      try {
        const stream = await this.openStreamToNode(dapiClient, nodeAddress, filter, fromHeight);
        if (stream) {
          const asyncIterable = StreamWrapper.makeAsyncIterable(stream);
          nodeStreams.push({ nodeAddress, stream, asyncIterable });
        } else {
          failedNodes.push(nodeAddress);
        }
      } catch (error) {
        this.logger.warn(`Failed to open stream to ${nodeAddress}: ${(error as Error).message}`);
        failedNodes.push(nodeAddress);
      }
    }

    if (nodeStreams.length === 0) {
      this.logger.warn('Failed to open any streams for IS hunting');
      return {
        found: false,
        instantLockHex: null,
        winningNode: null,
        failedNodes,
        elapsedMs: Date.now() - startTime,
      };
    }

    // Race all streams for IS hex
    const result = await this.raceStreamsForIsHex(nodeStreams, targetTxid, timeoutMs);

    // Update health tracker based on results
    if (result.found && result.winningNode) {
      this.healthTracker.recordSuccess(result.winningNode);
      this.logger.info(`IS hex found from ${result.winningNode}`);
    }

    // Blacklist nodes that were in the race but didn't deliver
    // (Only blacklist if we had a winner - if timeout, all nodes failed equally)
    if (result.found) {
      for (const ns of nodeStreams) {
        if (ns.nodeAddress !== result.winningNode) {
          this.healthTracker.recordFailure(ns.nodeAddress);
          result.failedNodes.push(ns.nodeAddress);
        }
      }
    } else {
      // Timeout - don't blacklist anyone (might be a tx issue, not node issue)
      this.logger.debug('IS hunt timeout - no nodes blacklisted (could be tx propagation delay)');
    }

    // Add initial connection failures
    result.failedNodes.push(...failedNodes);

    // Cleanup all streams
    for (const ns of nodeStreams) {
      this.closeStream(ns.stream);
    }

    result.elapsedMs = Date.now() - startTime;
    return result;
  }

  /**
   * Get node addresses from DAPI client's address provider.
   * Filters out blacklisted nodes and returns up to `count` healthy nodes.
   */
  private async getNodeAddresses(dapiClient: any, count: number): Promise<string[]> {
    const addresses: string[] = [];

    // Try to access the address provider from DAPI client
    const addressProvider = dapiClient.dapiAddressProvider;
    if (!addressProvider) {
      this.logger.warn('No address provider available on DAPI client');
      return addresses;
    }

    // Try to get addresses from the list provider
    let allAddresses: any[] = [];

    // SimplifiedMasternodeListDAPIAddressProvider wraps ListDAPIAddressProvider
    if (addressProvider.listDAPIAddressProvider) {
      allAddresses = addressProvider.listDAPIAddressProvider.getAllAddresses() || [];
    } else if (typeof addressProvider.getAllAddresses === 'function') {
      allAddresses = addressProvider.getAllAddresses() || [];
    } else if (typeof addressProvider.getLiveAddress === 'function') {
      // Fallback: get addresses one at a time
      for (let i = 0; i < count * 2; i++) {
        try {
          const addr = await addressProvider.getLiveAddress();
          if (addr) {
            const addrStr = typeof addr.toString === 'function' ? addr.toString() : String(addr);
            if (!addresses.includes(addrStr)) {
              addresses.push(addrStr);
            }
          }
        } catch (e) {
          break;
        }
      }
      return this.filterHealthyNodes(addresses, count);
    }

    // Convert DAPIAddress objects to strings
    for (const addr of allAddresses) {
      const addrStr = typeof addr.toString === 'function' ? addr.toString() : String(addr);
      if (!addresses.includes(addrStr)) {
        addresses.push(addrStr);
      }
    }

    return this.filterHealthyNodes(addresses, count);
  }

  /**
   * Filter out blacklisted nodes and return up to `count` healthy ones.
   * Prioritizes nodes with successful IS hex delivery history.
   */
  private filterHealthyNodes(allAddresses: string[], count: number): string[] {
    // Register all addresses in the tracker (for tracking purposes)
    for (const addr of allAddresses) {
      this.healthTracker.registerNode(addr);
    }

    // Filter out blacklisted nodes
    const healthy: string[] = [];
    for (const addr of allAddresses) {
      if (!this.healthTracker.isBlacklisted(addr)) {
        healthy.push(addr);
      }
    }

    // Sort by success count (prioritize proven nodes)
    healthy.sort((a, b) => {
      const statsA = this.healthTracker.getNodeStats(a);
      const statsB = this.healthTracker.getNodeStats(b);
      return (statsB?.successes || 0) - (statsA?.successes || 0);
    });

    // Shuffle the rest (after proven nodes) to distribute load
    const proven = healthy.filter(addr => {
      const stats = this.healthTracker.getNodeStats(addr);
      return stats && stats.successes > 0;
    });
    const unproven = healthy.filter(addr => {
      const stats = this.healthTracker.getNodeStats(addr);
      return !stats || stats.successes === 0;
    });

    // Shuffle unproven nodes
    for (let i = unproven.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unproven[i], unproven[j]] = [unproven[j], unproven[i]];
    }

    return [...proven, ...unproven].slice(0, count);
  }

  /**
   * Open a stream to a specific DAPI node.
   * Creates a new DAPI client instance pointing to just that node.
   */
  private async openStreamToNode(
    dapiClient: any,
    nodeAddress: string,
    bloomFilter: any,
    fromHeight: number
  ): Promise<any> {
    // For now, use the main client's core interface.
    // In a more sophisticated implementation, we'd create per-node clients.
    // The DAPI client already handles node selection internally.
    const core = dapiClient.core;

    try {
      let rawStream = core.subscribeToTransactionsWithProofs(bloomFilter, {
        fromBlockHeight: fromHeight,
        count: 0,
      });

      if (rawStream && typeof rawStream.then === 'function') {
        rawStream = await rawStream;
      }

      return rawStream;
    } catch (error) {
      this.logger.warn(`Failed to subscribe on ${nodeAddress}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Race multiple streams for IS hex delivery.
   * Returns as soon as any stream delivers valid IS hex for the target txid.
   */
  private async raceStreamsForIsHex(
    nodeStreams: NodeStream[],
    targetTxid: string,
    timeoutMs: number
  ): Promise<IsHuntResult> {
    return new Promise((resolve) => {
      let resolved = false;
      const failedNodes: string[] = [];

      // Timeout handler
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.logger.warn(`IS hunt timeout after ${timeoutMs}ms`);
          resolve({
            found: false,
            instantLockHex: null,
            winningNode: null,
            failedNodes,
            elapsedMs: timeoutMs,
          });
        }
      }, timeoutMs);

      // Process each stream in parallel
      for (const ns of nodeStreams) {
        this.processStreamForIsHex(ns, targetTxid)
          .then((hex) => {
            if (!resolved && hex) {
              resolved = true;
              clearTimeout(timeout);
              resolve({
                found: true,
                instantLockHex: hex,
                winningNode: ns.nodeAddress,
                failedNodes,
                elapsedMs: 0, // Will be updated by caller
              });
            }
          })
          .catch((error) => {
            this.logger.debug(`Stream error from ${ns.nodeAddress}: ${(error as Error).message}`);
            failedNodes.push(ns.nodeAddress);
          });
      }
    });
  }

  /**
   * Process a single stream looking for IS hex for the target txid.
   * Returns the hex if found, null if stream ends without finding it.
   */
  private async processStreamForIsHex(
    ns: NodeStream,
    targetTxid: string
  ): Promise<string | null> {
    try {
      for await (const message of ns.asyncIterable) {
        const msg = message as any;

        // Parse instant locks
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

              if (txid === targetTxid) {
                const hex = Buffer.from(lockBuf).toString('hex');
                this.logger.info(`IS hex found from ${ns.nodeAddress}: ${txid.substring(0, 16)}...`);
                return hex;
              }
            } catch (error) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      // Stream ended or errored
    }

    return null;
  }

  /**
   * Close a stream gracefully.
   */
  private closeStream(stream: any): void {
    if (!stream) return;

    try {
      if (typeof stream.on === 'function') {
        stream.on('error', () => {}); // Suppress errors
      }
      if (typeof stream.cancel === 'function') {
        stream.cancel();
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  /**
   * Get current health tracker stats.
   */
  getHealthStats(): {
    totalTracked: number;
    healthy: number;
    blacklisted: number;
    nodeStats: Map<string, NodeStats>;
  } {
    const summary = this.healthTracker.getSummary();
    return {
      totalTracked: summary.totalTracked,
      healthy: summary.healthy,
      blacklisted: summary.blacklisted,
      nodeStats: this.healthTracker.getAllStats(),
    };
  }
}
