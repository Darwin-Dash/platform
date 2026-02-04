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
   *  Default: 10000 (10 seconds). Set to 0 to disable. */
  streamReconnectInterval?: number;

  /** Whether to immediately reconnect the stream when preRegisterTransaction()
   *  is called. Ensures the mempool scan picks up newly broadcast transactions
   *  so IS proof bytes are delivered. Default: true */
  reconnectOnPreRegister?: boolean;

  /** Grace period (ms) after a pre-registered transaction is found on the
   *  DAPI stream (WAIT phase). Periodic reconnection is paused so the stream
   *  stays alive for IS proof byte delivery from the LLMQ quorum (~1-2s).
   *  This is NOT set when preRegisterTransaction() is called — reconnection
   *  continues normally during the HUNT phase until the stream finds the tx.
   *  Periodic reconnection resumes after all pre-registered txids receive IS
   *  proof or the grace period expires.
   *  Default: 15000 (15 seconds). */
  reconnectGracePeriod?: number;

  /** How long to wait (ms) for stream to deliver InstantLock proof bytes
   *  after the poller detects IS (boolean only). Only applies to pre-registered
   *  txids where the SDK needs raw hex for InstantAssetLockProof creation.
   *  Default: 5000 (5 seconds). Set to 0 to disable hex wait. */
  instantLockHexWaitMs?: number;
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
