import { describe, it, expect, beforeEach } from 'vitest';
import { Logger, LogLevel, parseLogLevel, createLogger } from '../../../src/utils/logger.js';

describe('Logger', () => {
  describe('parseLogLevel', () => {
    it('should parse string log levels', () => {
      expect(parseLogLevel('error')).toBe(LogLevel.ERROR);
      expect(parseLogLevel('warn')).toBe(LogLevel.WARN);
      expect(parseLogLevel('info')).toBe(LogLevel.INFO);
      expect(parseLogLevel('debug')).toBe(LogLevel.DEBUG);
    });

    it('should pass through enum values', () => {
      expect(parseLogLevel(LogLevel.ERROR)).toBe(LogLevel.ERROR);
      expect(parseLogLevel(LogLevel.WARN)).toBe(LogLevel.WARN);
      expect(parseLogLevel(LogLevel.INFO)).toBe(LogLevel.INFO);
      expect(parseLogLevel(LogLevel.DEBUG)).toBe(LogLevel.DEBUG);
    });

    it('should default to ERROR for undefined', () => {
      expect(parseLogLevel(undefined)).toBe(LogLevel.ERROR);
    });

    it('should default to ERROR for invalid strings', () => {
      expect(parseLogLevel('invalid' as any)).toBe(LogLevel.ERROR);
    });
  });

  describe('Logger class', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger(LogLevel.DEBUG, 'TestComponent');
    });

    it('should create logger with correct level', () => {
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should allow setting log level', () => {
      logger.setLevel('info');
      expect(logger.getLevel()).toBe(LogLevel.INFO);

      logger.setLevel(LogLevel.WARN);
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });

    it('should have all log methods', () => {
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('createLogger', () => {
    it('should create logger with config level', () => {
      const logger = createLogger('Test', 'debug');
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should create logger with environment variable', () => {
      const originalEnv = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'info';

      const logger = createLogger('Test');
      expect(logger.getLevel()).toBe(LogLevel.INFO);

      // Restore
      if (originalEnv !== undefined) {
        process.env.LOG_LEVEL = originalEnv;
      } else {
        delete process.env.LOG_LEVEL;
      }
    });

    it('should prioritize config over environment', () => {
      const originalEnv = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'info';

      const logger = createLogger('Test', 'debug');
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);

      // Restore
      if (originalEnv !== undefined) {
        process.env.LOG_LEVEL = originalEnv;
      } else {
        delete process.env.LOG_LEVEL;
      }
    });

    it('should default to ERROR level', () => {
      const originalEnv = process.env.LOG_LEVEL;
      delete process.env.LOG_LEVEL;

      const logger = createLogger('Test');
      expect(logger.getLevel()).toBe(LogLevel.ERROR);

      // Restore
      if (originalEnv !== undefined) {
        process.env.LOG_LEVEL = originalEnv;
      }
    });
  });
});
