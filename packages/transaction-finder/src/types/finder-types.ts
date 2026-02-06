/**
 * Transaction finder mode types
 */

/**
 * Operating mode for the transaction finder
 * - HISTORIC: Blockchain scanning for past transactions (UTXO discovery)
 * - REALTIME: Real-time InstantSend/ChainLock monitoring
 */
export enum FinderMode {
  HISTORIC = 'historic',
  REALTIME = 'realtime',
}

/**
 * Base configuration for all finder modes
 */
export interface BaseFinderConfig {
  /** Network to operate on */
  network: 'mainnet' | 'testnet' | 'regtest';

  /** Addresses to monitor/discover transactions for */
  addresses: string[];

  /** DAPI client instance */
  dapiClient?: any;

  /** DAPI addresses (for direct connection) */
  dapiAddresses?: string[];

  /** DNS seeds (alternative to dapiAddresses) */
  seeds?: string[];

  /** Connection timeout in milliseconds */
  timeout?: number;

  /** Number of retry attempts */
  retries?: number;

  /** Bloom filter false positive rate */
  bloomFalsePositiveRate?: number;

  /** Log level for debug output */
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
}

/**
 * Configuration specific to historic finding
 */
export interface HistoricFinderConfig extends BaseFinderConfig {
  mode: FinderMode.HISTORIC;

  /** Starting block height for scan */
  fromHeight: number;

  /** Ending block height for scan (optional, defaults to current tip) */
  toHeight?: number;

  /** Required amount in satoshis (scan stops when found) */
  requiredAmount?: number;

  /** Storage adapter for caching (optional) */
  storageAdapter?: any;

  /** Progress callback */
  onProgress?: (progress: SyncProgress) => void;
}

/**
 * Configuration specific to realtime monitoring
 */
export interface RealtimeFinderConfig extends BaseFinderConfig {
  mode: FinderMode.REALTIME;

  /** Enable DAPI node failover on connection failure */
  enableDAPIFailover?: boolean;

  /** Minimum time before retrying a failed DAPI node */
  dapiNodeRetryDelay?: number;

  /** Auto-prune transactions after ChainLock confirmation */
  autoPruneOnConfirmation?: boolean;

  /** Maximum tracked transactions before throwing error */
  maxTrackedTransactions?: number;

  /** Enable adaptive polling for ChainLock height */
  adaptivePolling?: boolean;

  /** Base ChainLock polling interval in milliseconds */
  basePollInterval?: number;

  /** Maximum ChainLock polling interval during failures */
  maxPollInterval?: number;

  /** Minimum allowed polling interval to prevent DAPI abuse */
  minPollInterval?: number;

  /** Enable polling-based transaction status checking for IS/CL detection.
   *  Polls getTransaction() for each tracked txid. Default: true */
  enableTransactionPolling?: boolean;

  /** Transaction status poll interval in milliseconds.
   *  Min 1000ms to prevent DAPI abuse. Default: 2000 */
  transactionPollInterval?: number;

  /** Stream reconnection interval in milliseconds.
   *  Periodic reconnection ensures missed transactions are caught
   *  via DAPI's historical data + mempool scan phases.
   *  Default: 60000 (60 seconds). Set to 0 to disable. */
  streamReconnectInterval?: number;

  /** How long to wait (ms) for parallel streams to deliver InstantLock proof bytes
   *  after the poller detects IS (boolean only). Parallel streams run continuously
   *  and may capture IS hex from a DAPI node with ZMQ rawtxlocksig enabled.
   *  Default: 8000 (8 seconds). Set to 0 to disable hex wait. */
  instantLockHexWaitMs?: number;

  // ============================================================================
  // Multi-Node IS Hex Hunting Configuration
  // ============================================================================

  /** Enable multi-node InstantSend hex hunting.
   *  When enabled, connects to multiple DAPI nodes simultaneously when
   *  preRegisterTransaction() is called and races all streams for IS hex.
   *  First valid hex wins. Nodes that fail to deliver IS hex are blacklisted
   *  for the session.
   *
   *  Rationale: Most DAPI testnet nodes don't have ZMQ `rawtxlocksig` enabled.
   *  Multi-node resilience increases the odds of connecting to a properly
   *  configured node.
   *
   *  Default: true */
  multiNodeIsHunting?: boolean;

  /** Number of DAPI nodes to connect to simultaneously for IS hex hunting.
   *  More nodes = higher chance of finding one with rawtxlocksig enabled,
   *  but also more resource usage (gRPC connections).
   *  Default: 3 */
  isHuntingNodes?: number;

  /** Timeout (ms) for IS hex hunting across all parallel streams.
   *  If no node delivers IS hex within this time, falls back to ChainLock.
   *  Speed priority: keep this short (2-3 seconds).
   *  Default: 3000 (3 seconds) */
  isHuntingTimeoutMs?: number;

  /** Auto-blacklist nodes after this many consecutive IS hex delivery failures.
   *  Nodes without rawtxlocksig are deterministically broken, so a threshold
   *  of 1 is appropriate (immediate blacklist on first failure).
   *  Default: 1 */
  isHuntingBlacklistThreshold?: number;

  /** Known-good IS-capable node addresses to seed the NodeHealthTracker.
   *  These nodes have previously delivered IS hex successfully and will be
   *  prioritized for parallel stream connections. Format: "host:port" or "host".
   *  Default: [] (no seeding, fresh discovery) */
  knownGoodIsNodes?: string[];
}

/**
 * Unified configuration type that supports all modes
 */
export type TransactionFinderConfig = HistoricFinderConfig | RealtimeFinderConfig;

/**
 * Progress event emitted during historic transaction sync
 */
export interface SyncProgress {
  /** Progress percentage (0-100) */
  progress: number;

  /** Number of blocks synced */
  syncedBlocks: number;

  /** Total blocks to sync */
  totalBlocks: number;

  /** Current block height */
  currentHeight: number;
}
