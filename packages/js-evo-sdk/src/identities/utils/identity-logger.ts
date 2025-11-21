/**
 * Identity Operations Logger
 *
 * Lightweight, browser-compatible logging utility for identity operations.
 * Respects process.env.LOG_LEVEL without requiring Winston or other heavy dependencies.
 *
 * Phase 3.2: Structured Logging Implementation
 */

declare const process: { env: { [key: string]: string | undefined } };

/**
 * Log levels in order of verbosity
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  SILENT = 5
}

/**
 * Parse LOG_LEVEL environment variable to LogLevel enum
 */
function getLogLevel(): LogLevel {
  if (typeof process === 'undefined' || !process.env?.LOG_LEVEL) {
    return LogLevel.INFO; // Default to INFO level
  }

  const level = process.env.LOG_LEVEL.toLowerCase();
  switch (level) {
    case 'trace': return LogLevel.TRACE;
    case 'debug': return LogLevel.DEBUG;
    case 'info': return LogLevel.INFO;
    case 'warn': return LogLevel.WARN;
    case 'error': return LogLevel.ERROR;
    case 'silent': return LogLevel.SILENT;
    default: return LogLevel.INFO;
  }
}

/**
 * Identity Logger - Structured logging for identity operations
 *
 * Features:
 * - Browser-compatible (no Node.js dependencies)
 * - Respects LOG_LEVEL environment variable
 * - Clean prefixes for log level identification
 * - Maintains console.* compatibility for easy migration
 */
export class IdentityLogger {
  private currentLevel: LogLevel;
  private context: string;

  /**
   * Create a new identity logger
   * @param context - Context prefix for log messages (e.g., "WalletCoordinator", "AssetLockProof")
   */
  constructor(context: string = 'Identity') {
    this.currentLevel = getLogLevel();
    this.context = context;
  }

  /**
   * Log trace-level message (most verbose)
   * Used for detailed debugging of internal operations
   */
  trace(...args: any[]): void {
    if (this.currentLevel <= LogLevel.TRACE) {
      console.log(`[TRACE] [${this.context}]`, ...args);
    }
  }

  /**
   * Log debug-level message
   * Used for debugging information during development
   */
  debug(...args: any[]): void {
    if (this.currentLevel <= LogLevel.DEBUG) {
      console.log(`[DEBUG] [${this.context}]`, ...args);
    }
  }

  /**
   * Log info-level message
   * Used for general operational information
   */
  info(...args: any[]): void {
    if (this.currentLevel <= LogLevel.INFO) {
      console.log(`[INFO] [${this.context}]`, ...args);
    }
  }

  /**
   * Log warning-level message
   * Used for potentially problematic situations
   */
  warn(...args: any[]): void {
    if (this.currentLevel <= LogLevel.WARN) {
      console.warn(`[WARN] [${this.context}]`, ...args);
    }
  }

  /**
   * Log error-level message
   * Used for error conditions
   */
  error(...args: any[]): void {
    if (this.currentLevel <= LogLevel.ERROR) {
      console.error(`[ERROR] [${this.context}]`, ...args);
    }
  }

  /**
   * Create a child logger with additional context
   * @param subContext - Additional context to append
   * @returns New logger instance with combined context
   */
  child(subContext: string): IdentityLogger {
    return new IdentityLogger(`${this.context}:${subContext}`);
  }

  /**
   * Check if debug logging is enabled
   * Useful for conditional expensive debug operations
   */
  isDebugEnabled(): boolean {
    return this.currentLevel <= LogLevel.DEBUG;
  }

  /**
   * Check if trace logging is enabled
   * Useful for conditional expensive trace operations
   */
  isTraceEnabled(): boolean {
    return this.currentLevel <= LogLevel.TRACE;
  }
}

/**
 * Create a logger instance for identity operations
 * @param context - Context prefix for log messages
 * @returns Configured logger instance
 */
export function createLogger(context: string): IdentityLogger {
  return new IdentityLogger(context);
}

/**
 * Default identity logger instance
 */
export const logger = new IdentityLogger('Identity');
