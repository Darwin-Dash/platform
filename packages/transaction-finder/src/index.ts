/**
 * @dashevo/transaction-finder
 * Unified transaction finding library for Dash Platform
 *
 * Supports two modes:
 * - Historic: Blockchain scanning for UTXO discovery
 * - Realtime: InstantSend/ChainLock monitoring
 *
 * @example
 * ```typescript
 * import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';
 *
 * // Historic mode - find UTXOs from blockchain history
 * const historicFinder = new TransactionFinder({
 *   mode: FinderMode.HISTORIC,
 *   network: 'testnet',
 *   addresses: ['yX3CJJ42...'],
 *   dapiClient: myDapiClient,
 *   fromHeight: 1,
 * });
 * const utxos = await historicFinder.findUTXOs();
 *
 * // Realtime mode - monitor for new transactions
 * const realtimeFinder = new TransactionFinder({
 *   mode: FinderMode.REALTIME,
 *   network: 'testnet',
 *   addresses: ['yX3CJJ42...'],
 *   dapiClient: myDapiClient,
 * });
 * await realtimeFinder.monitorAddresses(['yX3CJJ42...'], {
 *   onTransaction: (tx) => console.log('Transaction:', tx.txid),
 *   onInstantLock: (lock) => console.log('InstantLocked!'),
 * });
 * ```
 */

// ==================== Main Export ====================
// Unified facade with factory pattern (recommended for most use cases)
export { TransactionFinder } from './TransactionFinder.js';

// ==================== Types ====================
// Export all type definitions
export * from './types/index.js';

// ==================== Mode-Specific Finders ====================
// Export individual finders for advanced use cases
export { HistoricFinder } from './finders/HistoricFinder.js';
export { RealtimeFinder } from './finders/RealtimeFinder.js';

// ==================== Monitoring Components ====================
// Export monitoring components for advanced use cases
export { TransactionTracker } from './monitoring/TransactionTracker.js';
export { ChainLockHeightMonitor } from './monitoring/ChainLockHeightMonitor.js';
export { TransactionStatusPoller } from './monitoring/TransactionStatusPoller.js';
export { ConfirmationTracker } from './monitoring/ConfirmationTracker.js';
export { NodeHealthTracker } from './monitoring/NodeHealthTracker.js';
export type { NodeStats, NodeHealthTrackerConfig } from './monitoring/NodeHealthTracker.js';
export { MultiNodeIsHunter } from './monitoring/MultiNodeIsHunter.js';
export type { IsHuntResult, MultiNodeIsHunterConfig } from './monitoring/MultiNodeIsHunter.js';

// ==================== Core Utilities ====================
// Export core utilities for advanced use cases
export { BloomFilterBuilder } from './core/BloomFilterBuilder.js';
export { StreamWrapper } from './core/StreamWrapper.js';
export { TransactionSyncer } from './core/TransactionSyncer.js';

// ==================== Utility Classes ====================
// Export utility classes for advanced use cases
export { UTXOExtractor } from './utils/utxo-extractor.js';
export { LatestUTXOSelector } from './utils/utxo-selector.js';
export { createLogger, LogLevel } from './utils/logger.js';
