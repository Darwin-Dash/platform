/**
 * Monitoring event and callback type definitions
 */

/**
 * Callbacks for InstantSend and ChainLock monitoring events
 */
export interface MonitoringCallbacks {
  /** Called when transaction is detected in DAPI stream */
  onTransaction?: (tx: TransactionEvent) => void;

  /** Called when InstantLock is received */
  onInstantLock?: (lock: InstantLockEvent) => void;

  /** Called when ChainLock confirms transaction */
  onChainLock?: (cl: ChainLockEvent) => void;

  /** Called when block inclusion is detected */
  onBlockInclusion?: (block: BlockInclusionEvent) => void;

  /** Called on stream errors */
  onError?: (error: Error) => void;
}

/**
 * Transaction detection event
 */
export interface TransactionEvent {
  /** Transaction ID */
  txid: string;

  /** Event timestamp */
  timestamp: number;

  /** dashcore Transaction object (if available) */
  transaction?: any;
}

/**
 * InstantLock event
 */
export interface InstantLockEvent {
  /** Transaction ID */
  txid: string;

  /** Event timestamp */
  timestamp: number;

  /** Latency in milliseconds from broadcast */
  latency: number;

  /** Raw InstantLock data as hex string (for proof creation) */
  instantLockHex?: string;
}

/**
 * ChainLock event
 */
export interface ChainLockEvent {
  /** Transaction ID */
  txid: string;

  /** Event timestamp */
  timestamp: number;

  /** Block height containing the transaction */
  blockHeight: number;

  /** ChainLocked block height */
  chainLockedHeight: number;

  /** Latency in milliseconds from broadcast or InstantLock */
  latency: number;
}

/**
 * Block inclusion event
 */
export interface BlockInclusionEvent {
  /** Transaction ID */
  txid: string;

  /** Block height */
  blockHeight: number;

  /** Block hash */
  blockHash: string;

  /** Event timestamp */
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
  /** Transaction ID */
  txid: string;

  /** Current status */
  status: 'waiting' | 'pending' | 'instantlocked' | 'chainlocked';

  /** Progress message */
  message: string;

  /** Elapsed time in milliseconds */
  elapsedMs: number;
}

/**
 * Result from waitForConfirmation
 */
export interface ConfirmationResult {
  /** Transaction ID */
  txid: string;

  /** Confirmation method achieved */
  method: 'instantlock' | 'chainlock' | 'timeout';

  /** InstantLock timestamp (null if not locked) */
  instantLockTime: number | null;

  /** ChainLock timestamp (null if not locked) */
  chainLockTime: number | null;

  /** Block height (null if not in block) */
  blockHeight: number | null;

  /** Total latency in milliseconds */
  totalLatencyMs: number;

  /** Raw InstantLock data as hex string (available when method='instantlock') */
  instantLockHex?: string | null;
}
