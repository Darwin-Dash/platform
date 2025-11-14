/**
 * AdaptiveRetryStrategy
 *
 * Implements exponential backoff retry logic from payment-monitor
 */

import { Logger } from '../utils/logger.js';
import { MaxRetriesError } from '../types.js';

export interface RetryConfig {
  maxRetryAttempts: number;
  retryBaseDelay: number;
  maxRetryDelay: number;
  enableAdaptiveRetry: boolean;
}

export class AdaptiveRetryStrategy {
  private failureCount: number = 0;
  private logger: Logger;
  private config: RetryConfig;

  constructor(config: RetryConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Execute operation with retry logic
   *
   * @param operation Function to execute (receives attempt number)
   * @param onRetry Optional callback before each retry
   * @returns Operation result
   * @throws MaxRetriesError if all attempts exhausted
   */
  async execute<T>(
    operation: (attempt: number) => Promise<T>,
    onRetry?: (attempt: number, delay: number) => void
  ): Promise<T> {
    const maxAttempts = this.config.maxRetryAttempts;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation(attempt);

        // Reset failure count on success
        if (this.failureCount > 0) {
          this.logger.debug(`Operation succeeded after ${this.failureCount} failures`);
          this.failureCount = 0;
        }

        return result;

      } catch (error: any) {
        this.failureCount++;

        if (attempt >= maxAttempts) {
          this.logger.error(`Max retry attempts (${maxAttempts}) exceeded`);
          throw new MaxRetriesError(error, attempt);
        }

        if (this.config.enableAdaptiveRetry) {
          const delay = this.calculateDelay(attempt);
          this.logger.debug(`Retry ${attempt}/${maxAttempts} in ${delay}ms`);

          if (onRetry) {
            onRetry(attempt, delay);
          }

          await this.sleep(delay);
        }
      }
    }

    throw new Error('Unreachable code');
  }

  /**
   * Calculate exponential backoff delay
   * Formula: baseDelay * 2^(attempt - 1), capped at maxDelay
   */
  private calculateDelay(attempt: number): number {
    const base = this.config.retryBaseDelay;
    const max = this.config.maxRetryDelay;
    const delay = base * Math.pow(2, attempt - 1);
    return Math.min(delay, max);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Reset failure counter (used after successful node rotation)
   */
  reset(): void {
    this.failureCount = 0;
    this.logger.debug('Retry strategy reset');
  }

  /**
   * Get current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }
}
