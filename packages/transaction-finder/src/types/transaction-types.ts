/**
 * Transaction and UTXO type definitions
 */

/**
 * Transaction status through confirmation lifecycle
 */
export type TransactionStatus = 'pending' | 'instantlocked' | 'chainlocked';

/**
 * Metadata about a transaction in the blockchain
 * Unified from both packages
 */
export interface TransactionMetadata {
  /** Block hash containing this transaction (null if in mempool) */
  blockHash: string | null;

  /** Block height (0 if in mempool) */
  height: number;

  /** Block timestamp */
  time: Date;

  /** Whether transaction is ChainLocked */
  isChainLocked: boolean;

  /** Whether transaction is InstantLocked */
  isInstantLocked: boolean;

  /** Transaction status */
  status: TransactionStatus;

  /** InstantLock timestamp (null if not locked) */
  instantLockTime?: number | null;

  /** ChainLock timestamp (null if not locked) */
  chainLockTime?: number | null;

  /** ChainLock block height (null if not locked) */
  chainLockBlockHeight?: number | null;
}

/**
 * Internal representation of a transaction with its metadata
 */
export interface TransactionWithMetadata {
  /** Transaction from dashcore-lib */
  tx: any;

  /** Transaction metadata (null if not yet resolved) */
  metadata: TransactionMetadata | null;
}

/**
 * Unspent Transaction Output (UTXO)
 */
export interface UTXO {
  /** Transaction ID */
  txId: string;

  /** Output index */
  vout: number;

  /** Amount in satoshis */
  satoshis: number;

  /** Output script (hex) */
  script: string;

  /** Address */
  address: string;

  /** Block height containing this UTXO */
  blockHeight: number;

  /** Block timestamp */
  blockTime: number;

  /** Block hash (null if in mempool) */
  blockHash: string | null;

  /** Whether the block is ChainLocked */
  isChainLocked: boolean;

  /** Whether the transaction is InstantLocked */
  isInstantLocked: boolean;
}

/**
 * Transaction state tracked by TransactionTracker
 * More detailed than basic metadata
 */
export interface TrackedTransaction {
  /** Transaction ID */
  txid: string;

  /** Broadcast timestamp (null if not tracked) */
  broadcastTime: number | null;

  /** InstantLock received timestamp (null if not locked) */
  instantLockTime: number | null;

  /** Block height (null if in mempool) */
  blockHeight: number | null;

  /** Block hash (null if in mempool) */
  blockHash: string | null;

  /** ChainLock received timestamp (null if not locked) */
  chainLockTime: number | null;

  /** ChainLock block height (null if not locked) */
  chainLockBlockHeight: number | null;

  /** Current transaction status */
  status: TransactionStatus;
}

/**
 * InstantSend Lock message from DAPI stream
 * Represents a locked transaction via LLMQ-based InstantSend
 */
export interface InstantLockData {
  /** Version (v18 only) */
  version?: number;

  /** Inputs being locked */
  inputs: OutpointInput[];

  /** Transaction ID (hex) */
  txid: string;

  /** Cycle hash (v18 only) */
  cyclehash?: string;

  /** BLS signature (hex) */
  signature: string;
}

/**
 * Outpoint input reference in InstantLock
 */
export interface OutpointInput {
  /** Previous transaction hash */
  outpointHash: string;

  /** Output index in previous transaction */
  outpointIndex: number;
}

/**
 * ChainLock message from DAPI stream
 * Represents a locked block via LLMQ-based ChainLock
 */
export interface ChainLockData {
  /** Block height */
  height: number;

  /** Block hash (hex) */
  blockHash: string;

  /** BLS signature (hex) */
  signature: string;
}
