/**
 * Type definitions for dash-utxo-finder
 */

/**
 * Metadata about a transaction in the blockchain
 */
export interface TransactionMetadata {
  blockHash: string | null;
  height: number;
  time: Date;
  isChainLocked: boolean;
  isInstantLocked: boolean;
}

/**
 * Internal representation of a transaction with its metadata
 */
export interface TransactionWithMetadata {
  tx: any; // Transaction from dashcore-lib
  metadata: TransactionMetadata | null;
}

/**
 * Unspent Transaction Output (UTXO)
 */
export interface UTXO {
  txId: string;
  vout: number;
  satoshis: number;
  script: string;
  address: string;
  blockHeight: number;
  blockTime: number;
  blockHash: string | null;
  isChainLocked: boolean;
  isInstantLocked: boolean;
}

/**
 * Progress event emitted during transaction sync
 */
export interface SyncProgress {
  progress: number; // 0-100
  syncedBlocks: number;
  totalBlocks: number;
  currentHeight: number;
}

/**
 * Options for finding UTXOs
 */
export interface UTXOFinderOptions {
  fromHeight: number;
  toHeight?: number;
  requiredAmount?: number;
}

/**
 * DAPI Client interface - supports both legacy DAPIClient and ResilientDAPIClient
 * This allows for gradual migration and backward compatibility
 */
export interface DAPIClientLike {
  core: {
    subscribeToBlockHeadersWithChainLocks: (options: any) => any;
    subscribeToTransactionsWithProofs: (filter: any, options: any) => any;
    getBlockchainStatus: () => Promise<any>;
    getBlockByHash: (hash: string) => Promise<any>;
  };
}

/**
 * Bloom filter parameters for DAPI transaction filtering
 * Expected by subscribeToTransactionsWithProofs as a plain object
 */
export interface BloomFilterParams {
  vData: Buffer;           // The filter data
  nHashFuncs: number;      // Number of hash functions
  nTweak: number;          // Tweak value
  nFlags: number;          // Flags (update behavior)
}

/**
 * InstantSend Lock message from DAPI stream
 * Represents a locked transaction via LLMQ-based InstantSend
 */
export interface InstantLockData {
  version?: number;        // Version (v18 only)
  inputs: OutpointInput[]; // Inputs being locked
  txid: string;            // Transaction ID (hex)
  cyclehash?: string;      // Cycle hash (v18 only)
  signature: string;       // BLS signature (hex)
}

/**
 * Outpoint input reference in InstantLock
 */
export interface OutpointInput {
  outpointHash: string;    // Previous transaction hash
  outpointIndex: number;   // Output index in previous transaction
}

/**
 * ChainLock message from DAPI stream
 * Represents a locked block via LLMQ-based ChainLock
 */
export interface ChainLockData {
  height: number;          // Block height
  blockHash: string;       // Block hash (hex)
  signature: string;       // BLS signature (hex)
}
