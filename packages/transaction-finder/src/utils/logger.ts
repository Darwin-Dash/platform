/**
 * Universal Logger for Transaction Finder
 *
 * Lightweight, browser-compatible logging utility.
 * Respects process.env.LOG_LEVEL without requiring Winston or other heavy dependencies.
 *
 * Consolidated from dash-utxo-finder and instantsend-chainlock-monitor implementations.
 */

// Browser-safe process declaration
declare const process: { env: { [key: string]: string | undefined } };

/**
 * Log levels in order of verbosity (lower number = more verbose)
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  SILENT = 5
}

export type LogLevelString = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Parse LOG_LEVEL environment variable or config to LogLevel enum
 */
function parseLogLevel(level: LogLevel | LogLevelString | undefined): LogLevel {
  if (level === undefined) {
    // Check environment variable if no explicit level provided
    if (typeof process !== 'undefined' && process.env?.LOG_LEVEL) {
      const envLevel = process.env.LOG_LEVEL.toLowerCase() as LogLevelString;
      return stringToLogLevel(envLevel);
    }
    return LogLevel.INFO; // Default to INFO level
  }

  if (typeof level === 'number') {
    return level;
  }

  return stringToLogLevel(level);
}

/**
 * Convert string to LogLevel enum
 */
function stringToLogLevel(level: LogLevelString): LogLevel {
  const levelMap: Record<LogLevelString, LogLevel> = {
    trace: LogLevel.TRACE,
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
    silent: LogLevel.SILENT,
  };
  return levelMap[level] ?? LogLevel.INFO;
}

/**
 * Universal Logger - Structured logging for transaction finder operations
 *
 * Features:
 * - Browser-compatible (no Node.js dependencies)
 * - Respects LOG_LEVEL environment variable
 * - Clean prefixes for log level identification
 * - Maintains console.* compatibility for easy migration
 * - Child logger support for component hierarchies
 */
export class Logger {
  private currentLevel: LogLevel;
  private context: string;

  /**
   * Create a new logger
   * @param context - Context prefix for log messages (e.g., "TransactionFinder", "BloomFilter")
   * @param level - Optional log level override (defaults to env or INFO)
   */
  constructor(context: string = 'TransactionFinder', level?: LogLevel | LogLevelString) {
    this.currentLevel = parseLogLevel(level);
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
  child(subContext: string): Logger {
    return new Logger(`${this.context}:${subContext}`, this.currentLevel);
  }

  /**
   * Check if trace logging is enabled
   * Useful for conditional expensive trace operations
   */
  isTraceEnabled(): boolean {
    return this.currentLevel <= LogLevel.TRACE;
  }

  /**
   * Check if debug logging is enabled
   * Useful for conditional expensive debug operations
   */
  isDebugEnabled(): boolean {
    return this.currentLevel <= LogLevel.DEBUG;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * Set log level dynamically
   */
  setLevel(level: LogLevel | LogLevelString): void {
    this.currentLevel = parseLogLevel(level);
  }
}

/**
 * Create a logger instance
 * @param context - Context prefix for log messages
 * @param level - Optional log level (defaults to env or INFO)
 * @returns Configured logger instance
 */
export function createLogger(context: string, level?: LogLevel | LogLevelString): Logger {
  return new Logger(context, level);
}

/**
 * Default logger instance for transaction finder
 */
export const logger = new Logger('TransactionFinder');
