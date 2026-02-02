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
export { TransactionFinder } from './TransactionFinder.js';
export * from './types/index.js';
export { HistoricFinder } from './finders/HistoricFinder.js';
export { RealtimeFinder } from './finders/RealtimeFinder.js';
export { TransactionTracker } from './monitoring/TransactionTracker.js';
export { ChainLockHeightMonitor } from './monitoring/ChainLockHeightMonitor.js';
export { BloomFilterBuilder } from './core/BloomFilterBuilder.js';
export { StreamWrapper } from './core/StreamWrapper.js';
export { TransactionSyncer } from './core/TransactionSyncer.js';
export { UTXOExtractor } from './utils/utxo-extractor.js';
export { LatestUTXOSelector } from './utils/utxo-selector.js';
export { createLogger, LogLevel } from './utils/logger.js';
//# sourceMappingURL=index.d.ts.map