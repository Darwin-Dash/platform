/**
 * Logger Utility
 *
 * Provides structured logging with configurable log levels.
 * Supports environment variable configuration (LOG_LEVEL=debug).
 *
 * Log Levels (from lowest to highest):
 * - ERROR (0): Only critical errors
 * - WARN (1): Warnings and errors
 * - INFO (2): Informational messages, warnings, and errors
 * - DEBUG (3): All messages including debug output
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export type LogLevelString = 'error' | 'warn' | 'info' | 'debug';

/**
 * Parse log level from string or enum
 */
export function parseLogLevel(level: LogLevel | LogLevelString | undefined): LogLevel {
  if (level === undefined) {
    return LogLevel.ERROR; // Default: production-safe (errors only)
  }

  if (typeof level === 'number') {
    return level;
  }

  const levelMap: Record<LogLevelString, LogLevel> = {
    error: LogLevel.ERROR,
    warn: LogLevel.WARN,
    info: LogLevel.INFO,
    debug: LogLevel.DEBUG,
  };

  return levelMap[level] ?? LogLevel.ERROR;
}

/**
 * Logger class with component-specific prefix
 */
export class Logger {
  private level: LogLevel;
  private component: string;

  constructor(level: LogLevel | LogLevelString | undefined, component: string) {
    this.level = parseLogLevel(level);
    this.component = component;
  }

  /**
   * Log error message (always shown unless completely disabled)
   */
  error(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.ERROR) {
      console.error(`[${this.component}] ERROR:`, message, ...args);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.WARN) {
      console.warn(`[${this.component}] WARN:`, message, ...args);
    }
  }

  /**
   * Log informational message
   */
  info(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.INFO) {
      console.log(`[${this.component}] INFO:`, message, ...args);
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.DEBUG) {
      console.log(`[${this.component}] DEBUG:`, message, ...args);
    }
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel | LogLevelString): void {
    this.level = parseLogLevel(level);
  }
}

/**
 * Create logger from environment variable or config
 */
export function createLogger(
  component: string,
  configLevel?: LogLevel | LogLevelString
): Logger {
  // Priority: config parameter > ENV variable > default (error)
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevelString | undefined;
  const level = configLevel ?? envLevel ?? 'error';
  return new Logger(level, component);
}
