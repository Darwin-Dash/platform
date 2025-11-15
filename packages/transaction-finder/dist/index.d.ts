/**
 * @dashevo/transaction-finder
 * Unified transaction finding library for Dash Platform
 *
 * Supports three modes:
 * - Historic: Blockchain scanning for UTXO discovery
 * - Realtime: InstantSend/ChainLock monitoring
 * - Hybrid: Combined historic scanning + realtime monitoring
 *
 * @example
 * ```typescript
 * import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';
 *
 * // Main unified facade (recommended)
 * const finder = new TransactionFinder({
 *   mode: FinderMode.HYBRID,
 *   network: 'testnet',
 *   addresses: ['yX3CJJ42...'],
 *   dapiClient: myDapiClient,
 *   historic: { fromHeight: 1 },
 *   realtime: { autoPruneOnConfirmation: true },
 * });
 *
 * const { utxos, stopMonitoring } = await finder.syncAndMonitor({
 *   onTransaction: (tx) => console.log('Transaction:', tx.txid),
 *   onInstantLock: (lock) => console.log('InstantLocked!'),
 *   onChainLock: (cl) => console.log('ChainLocked!'),
 * });
 * ```
 */
export { TransactionFinder } from './TransactionFinder.js';
export * from './types/index.js';
export { HistoricFinder } from './finders/HistoricFinder.js';
export { RealtimeFinder } from './finders/RealtimeFinder.js';
export { HybridFinder } from './finders/HybridFinder.js';
export { TransactionTracker } from './monitoring/TransactionTracker.js';
export { ChainLockHeightMonitor } from './monitoring/ChainLockHeightMonitor.js';
export { BloomFilterBuilder } from './core/BloomFilterBuilder.js';
export { StreamWrapper } from './core/StreamWrapper.js';
export { TransactionSyncer } from './core/TransactionSyncer.js';
export { UTXOExtractor } from './utils/utxo-extractor.js';
export { LatestUTXOSelector } from './utils/utxo-selector.js';
export { createLogger, LogLevel } from './utils/logger.js';
//# sourceMappingURL=index.d.ts.map