/**
 * Universal Logger for Transaction Finder
 *
 * Lightweight, browser-compatible logging utility.
 * Respects process.env.LOG_LEVEL without requiring Winston or other heavy dependencies.
 *
 * Consolidated from dash-utxo-finder and instantsend-chainlock-monitor implementations.
 */
/**
 * Log levels in order of verbosity (lower number = more verbose)
 */
export declare enum LogLevel {
    TRACE = 0,
    DEBUG = 1,
    INFO = 2,
    WARN = 3,
    ERROR = 4,
    SILENT = 5
}
export type LogLevelString = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
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
export declare class Logger {
    private currentLevel;
    private context;
    /**
     * Create a new logger
     * @param context - Context prefix for log messages (e.g., "TransactionFinder", "BloomFilter")
     * @param level - Optional log level override (defaults to env or INFO)
     */
    constructor(context?: string, level?: LogLevel | LogLevelString);
    /**
     * Log trace-level message (most verbose)
     * Used for detailed debugging of internal operations
     */
    trace(...args: any[]): void;
    /**
     * Log debug-level message
     * Used for debugging information during development
     */
    debug(...args: any[]): void;
    /**
     * Log info-level message
     * Used for general operational information
     */
    info(...args: any[]): void;
    /**
     * Log warning-level message
     * Used for potentially problematic situations
     */
    warn(...args: any[]): void;
    /**
     * Log error-level message
     * Used for error conditions
     */
    error(...args: any[]): void;
    /**
     * Create a child logger with additional context
     * @param subContext - Additional context to append
     * @returns New logger instance with combined context
     */
    child(subContext: string): Logger;
    /**
     * Check if trace logging is enabled
     * Useful for conditional expensive trace operations
     */
    isTraceEnabled(): boolean;
    /**
     * Check if debug logging is enabled
     * Useful for conditional expensive debug operations
     */
    isDebugEnabled(): boolean;
    /**
     * Get current log level
     */
    getLevel(): LogLevel;
    /**
     * Set log level dynamically
     */
    setLevel(level: LogLevel | LogLevelString): void;
}
/**
 * Create a logger instance
 * @param context - Context prefix for log messages
 * @param level - Optional log level (defaults to env or INFO)
 * @returns Configured logger instance
 */
export declare function createLogger(context: string, level?: LogLevel | LogLevelString): Logger;
/**
 * Default logger instance for transaction finder
 */
export declare const logger: Logger;
//# sourceMappingURL=logger.d.ts.map