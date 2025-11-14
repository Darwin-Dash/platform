/**
 * @dashevo/resilient-dapi-client
 *
 * Production-ready DAPI client wrapper with resilience features
 */

export { ResilientDAPIClient } from './ResilientDAPIClient.js';
export { Logger, createLogger, parseLogLevel, LogLevel } from './utils/logger.js';
export type {
  ResilientConfig,
  RetryEvent,
  FailoverEvent,
  DegradationEvent,
  ResilientStatus,
  LogLevelString,
} from './types.js';
export { MaxRetriesError } from './types.js';

// Re-export strategy classes for advanced usage
export { AdaptiveRetryStrategy } from './strategies/AdaptiveRetryStrategy.js';
export { NodePoolManager } from './strategies/NodePoolManager.js';
export { GracefulDegradation } from './strategies/GracefulDegradation.js';
