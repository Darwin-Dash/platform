/**
 * Main exports for dash-utxo-finder library
 */

// Core components
export { UTXOFinder } from './UTXOFinder.js';
export { BloomFilterBuilder } from './BloomFilterBuilder.js';
export { TransactionSyncer } from './TransactionSyncer.js';
export { UTXOExtractor } from './UTXOExtractor.js';
export { LatestUTXOSelector } from './LatestUTXOSelector.js';

// Types
export type {
  TransactionMetadata,
  TransactionWithMetadata,
  UTXO,
  SyncProgress,
  UTXOFinderOptions,
  InstantLockData,
  OutpointInput,
  ChainLockData,
} from './types.js';
