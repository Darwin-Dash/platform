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

  /** Whether to reconnect the stream when preRegisterTransaction() is called.
   *  When true (default), reconnects immediately for a fresh stream. DAPI
   *  streams stall after their initial historical + mempool scan — no new
   *  ZMQ events are delivered. A fresh stream registers a new bloom filter
   *  emitter on the DAPI server that captures IS events during its scan phase.
   *  The caller should invoke preRegisterTransaction() BEFORE broadcasting
   *  the transaction to maximize the IS capture window.
   *  When false, only sets the grace period — useful if you know the stream
   *  was recently opened and is still in its initial scan phase.
   *  Default: true */
  reconnectOnPreRegister?: boolean;

  /** Delay (ms) before reconnecting the stream after preRegisterTransaction().
   *  Default is 0 (immediate). The caller should call preRegisterTransaction()
   *  BEFORE broadcasting so the fresh stream's bloom filter emitter is registered
   *  before the IS ZMQ event fires (~1-2s after broadcast). DAPI caches IS events
   *  arriving during the scan phase (in `unretrievedInstantLocks`) and flushes them
   *  after MEMPOOL_DATA_SENT — so IS events are not lost even though the stream is
   *  still processing historical data when IS fires.
   *  Only applies when reconnectOnPreRegister is true.
   *  Default: 0 (immediate). */
  preRegisterReconnectDelay?: number;

  /** Grace period (ms) for IS proof delivery. When preRegisterTransaction()
   *  is called, periodic reconnection is paused for this duration so the
   *  existing gRPC stream stays alive to receive IS proof bytes. The grace
   *  period is extended each time the stream detects a pre-registered tx.
   *  Periodic reconnection resumes after all pre-registered txids receive IS
   *  proof or the grace period expires.
   *  Default: 15000 (15 seconds). */
  reconnectGracePeriod?: number;

  /** How long to wait (ms) for stream to deliver InstantLock proof bytes
   *  after the poller detects IS (boolean only). Only applies to pre-registered
   *  txids where the SDK needs raw hex for InstantAssetLockProof creation.
   *  No reconnect is triggered — DAPI cannot deliver IS bytes for already-locked
   *  transactions on a new stream (ZMQ events are not replayed).
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
