/**
 * Type definitions for dash-utxo-finder
 */

/**
 * Represents a Dash address derived from HD key
 */
export interface DerivedAddress {
  index: number;
  address: string;
  path: string;
  privateKey?: any; // PrivateKey from dashcore-lib (optional in watch-only mode)
}

/**
 * Result of address derivation from mnemonic or HDPublicKey
 */
export interface AddressDerivationResult {
  external: DerivedAddress[];
  internal: DerivedAddress[];
  hdPrivateKey?: any; // Only in full control mode
}

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
 * Options for address derivation
 */
export interface AddressDerivationOptions {
  accountIndex?: number;
  externalCount?: number;
  internalCount?: number;
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
