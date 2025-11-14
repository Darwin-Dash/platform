/**
 * Type definitions for InstantSend ChainLock Monitor library
 */

/**
 * Log levels for structured logging
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export type LogLevelString = 'error' | 'warn' | 'info' | 'debug';

/**
 * Transaction status through confirmation lifecycle
 */
export type TransactionStatus = 'pending' | 'instantlocked' | 'chainlocked';

/**
 * Transaction state tracked by TransactionTracker
 */
export interface TrackedTransaction {
  txid: string;
  broadcastTime: number | null;
  instantLockTime: number | null;
  blockHeight: number | null;
  blockHash: string | null;
  chainLockTime: number | null;
  chainLockBlockHeight: number | null;
  status: TransactionStatus;
}

/**
 * Configuration for InstantSendChainLockMonitor
 */
export interface InstantSendChainLockMonitorConfig {
  // Network Configuration
  /** Network to monitor (mainnet, testnet, regtest) */
  network: 'mainnet' | 'testnet' | 'regtest';

  /** DAPI addresses (for direct connection) */
  dapiAddresses?: string[];

  /** DNS seeds (alternative to dapiAddresses) */
  seeds?: string[];

  /** Connection timeout in milliseconds (default: 60000) */
  timeout?: number;

  /** Number of retry attempts (default: 15) */
  retries?: number;

  /** Bloom filter false positive rate (default: 0.0001) */
  bloomFalsePositiveRate?: number;

  // Logging Configuration
  /** @deprecated Use logLevel instead. Will be removed in v2.0 */
  debug?: boolean;

  /** Log level: 'error' | 'warn' | 'info' | 'debug' (default: 'error') */
  logLevel?: LogLevel | LogLevelString;

  // Resilience Configuration
  /** Maximum stream reconnection attempts (default: 10) */
  maxReconnectAttempts?: number;

  /** Base reconnection delay in milliseconds (default: 3000) */
  reconnectDelay?: number;

  /** Enable DAPI node failover on connection failure (default: true) */
  enableDAPIFailover?: boolean;

  /** Minimum time before retrying a failed DAPI node in milliseconds (default: 300000 = 5 min) */
  dapiNodeRetryDelay?: number;

  // Memory Management Configuration
  /** Auto-prune transactions after ChainLock confirmation (default: false - opt-in) */
  autoPruneOnConfirmation?: boolean;

  /** Maximum tracked transactions before throwing error (default: 1000) */
  maxTrackedTransactions?: number;

  // Performance Configuration
  /** Enable adaptive polling that adjusts interval based on failures (default: true) */
  adaptivePolling?: boolean;

  /** Base ChainLock polling interval in milliseconds (default: 5000) */
  basePollInterval?: number;

  /** Maximum ChainLock polling interval during failures in milliseconds (default: 30000) */
  maxPollInterval?: number;

  /** Minimum allowed polling interval to prevent DAPI abuse (default: 1000) */
  minPollInterval?: number;
}

/**
 * Callbacks for InstantSend and ChainLock monitoring events
 */
export interface InstantSendChainLockMonitorCallbacks {
  /** Called when transaction is detected in DAPI stream */
  onTransaction?: (tx: TransactionEvent) => void;

  /** Called when InstantLock is received */
  onInstantLock?: (lock: InstantLockEvent) => void;

  /** Called when ChainLock confirms transaction */
  onChainLock?: (cl: ChainLockEvent) => void;

  /** Called when block inclusion is detected */
  onBlockInclusion?: (block: BlockInclusionEvent) => void;
}

/**
 * Transaction detection event
 */
export interface TransactionEvent {
  txid: string;
  timestamp: number;
  transaction?: any; // dashcore Transaction object
}

/**
 * InstantLock event
 */
export interface InstantLockEvent {
  txid: string;
  timestamp: number;
  latency: number; // ms from broadcast
}

/**
 * ChainLock event
 */
export interface ChainLockEvent {
  txid: string;
  timestamp: number;
  blockHeight: number;
  chainLockedHeight: number;
  latency: number; // ms from broadcast or InstantLock
}

/**
 * Block inclusion event
 */
export interface BlockInclusionEvent {
  txid: string;
  blockHeight: number;
  blockHash: string;
  timestamp: number;
}

/**
 * Options for waitForConfirmation
 */
export interface ConfirmationOptions {
  /** Require InstantLock (default: true) */
  requireInstantLock?: boolean;

  /** Require ChainLock (default: false) */
  requireChainLock?: boolean;

  /** Overall timeout in milliseconds (default: 900000 = 15 minutes) */
  timeout?: number;

  /** Progress callback */
  onProgress?: (status: ConfirmationProgress) => void;
}

/**
 * Progress update during confirmation wait
 */
export interface ConfirmationProgress {
  txid: string;
  status: 'waiting' | 'pending' | 'instantlocked' | 'chainlocked';
  message: string;
  elapsedMs: number;
}

/**
 * Result from waitForConfirmation
 */
export interface ConfirmationResult {
  txid: string;
  method: 'instantlock' | 'chainlock' | 'timeout';
  instantLockTime: number | null;
  chainLockTime: number | null;
  blockHeight: number | null;
  totalLatencyMs: number;
}
