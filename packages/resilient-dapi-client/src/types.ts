/**
 * Type definitions for ResilientDAPIClient
 *
 * Based on payment-monitor resilience patterns
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export type LogLevelString = 'error' | 'warn' | 'info' | 'debug';

/**
 * Configuration for ResilientDAPIClient
 */
export interface ResilientConfig {
  // Standard DAPIClient configuration (passthrough)
  network: 'mainnet' | 'testnet' | 'regtest';
  dapiAddresses?: string[];
  seeds?: string[];
  timeout?: number;
  retries?: number;
  baseBanTime?: number;

  // Resilience features (from payment-monitor)
  /** Log level: 'error' | 'warn' | 'info' | 'debug' (default: 'error') */
  logLevel?: LogLevel | LogLevelString;

  /** Enable event emission for observability (default: true) */
  enableObservability?: boolean;

  /** Enable graceful degradation on platform failures (default: true) */
  enableGracefulDegradation?: boolean;

  /** Enable adaptive retry with exponential backoff (default: true) */
  enableAdaptiveRetry?: boolean;

  /** Maximum retry delay in milliseconds (default: 30000) */
  maxRetryDelay?: number;

  /** Base retry delay in milliseconds (default: 1000) */
  retryBaseDelay?: number;

  /** Node retry delay before attempting failed node again (default: 300000 = 5 min) */
  nodeRetryDelay?: number;

  /** Maximum retry attempts before giving up (default: 10) */
  maxRetryAttempts?: number;
}

/**
 * Event emitted on retry attempts
 */
export interface RetryEvent {
  namespace: 'core' | 'platform';
  method: string;
  attempt: number;
  error: Error;
  delay: number;
}

/**
 * Event emitted on node failover
 */
export interface FailoverEvent {
  oldNode: string;
  newNode: string;
  reason: string;
}

/**
 * Event emitted on service degradation
 */
export interface DegradationEvent {
  service: 'core' | 'platform';
  error: Error;
  timestamp: number;
}

/**
 * Status response from ResilientDAPIClient
 */
export interface ResilientStatus {
  coreAvailable: boolean;
  platformAvailable: boolean;
  currentNode: string | null;
  nodePoolSize: number;
  failureCount: number;
}

/**
 * Error thrown when max retries exceeded
 */
export class MaxRetriesError extends Error {
  constructor(public originalError: Error, public attempts: number) {
    super(`Max retry attempts (${attempts}) exceeded: ${originalError.message}`);
    this.name = 'MaxRetriesError';
  }
}
