/**
 * @dashevo/instantsend-chainlock-monitor
 *
 * Standalone library for monitoring Dash InstantSend and ChainLock confirmations.
 *
 * @packageDocumentation
 */

// Main API
export { InstantSendChainLockMonitor } from './InstantSendChainLockMonitor.js';

// Core classes (for advanced usage)
export { TransactionTracker } from './TransactionTracker.js';
export { ChainLockHeightMonitor } from './ChainLockHeightMonitor.js';

// Utilities
export {
  createAddressBloomFilter,
  getBloomFilterStats,
  DEFAULT_BLOOM_FALSE_POSITIVE_RATE,
} from './utils/bloom-filter.js';

export {
  parseTransactions,
  parseMerkleBlock,
  parseInstantLocks,
  transactionInvolvesAddress,
} from './utils/stream-parser.js';

export {
  Logger,
  LogLevel,
  createLogger,
  parseLogLevel,
} from './utils/logger.js';

// Types
export type {
  TransactionStatus,
  TrackedTransaction,
  InstantSendChainLockMonitorConfig,
  InstantSendChainLockMonitorCallbacks,
  ConfirmationOptions,
  ConfirmationProgress,
  ConfirmationResult,
  TransactionEvent,
  InstantLockEvent,
  ChainLockEvent,
  BlockInclusionEvent,
  LogLevelString,
} from './types.js';
