/**
 * Main exports for dash-utxo-finder library
 */

// Core components
export { UTXOFinder } from './UTXOFinder';
export { AddressDerivation } from './AddressDerivation';
export { BloomFilterBuilder } from './BloomFilterBuilder';
export { TransactionSyncer } from './TransactionSyncer';
export { UTXOExtractor } from './UTXOExtractor';
export { LatestUTXOSelector } from './LatestUTXOSelector';

// Storage adapters
export { InMemoryStorage } from './StorageAdapter';
export { LocalStorageAdapter } from './LocalStorageAdapter';
export { IndexedDBAdapter } from './IndexedDBAdapter';

// Types
export type {
  DerivedAddress,
  AddressDerivationResult,
  TransactionMetadata,
  TransactionWithMetadata,
  UTXO,
  SyncProgress,
  UTXOFinderOptions,
  AddressDerivationOptions,
  InstantLockData,
  OutpointInput,
  ChainLockData,
} from './types';

// Storage types
export type { StorageAdapter, SyncCheckpoint } from './StorageAdapter';
