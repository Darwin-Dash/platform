/**
 * Retry Logic with Exponential Backoff
 *
 * Implements retry strategies for handling transient failures in tests,
 * particularly useful for network operations (RPC calls, DAPI connections).
 */

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (not including initial attempt) */
  maxRetries: number;

  /** Initial delay between retries in milliseconds */
  baseDelay: number;

  /** Maximum delay between retries (cap exponential growth) */
  maxDelay: number;

  /** Multiplier for exponential backoff */
  backoffMultiplier: number;

  /** Optional: add random jitter to prevent thundering herd */
  jitterFactor?: number;

  /** Optional: custom logger function */
  logger?: (message: string, level?: 'debug' | 'info' | 'warn' | 'error') => void;

  /** Optional: predicate to determine if error is retryable */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Default retry configuration
 * Suitable for most network operations
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 500,
  maxDelay: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Aggressive retry configuration
 * For unreliable networks or heavily loaded services
 */
export const AGGRESSIVE_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 1.5,
  jitterFactor: 0.2,
};

/**
 * Conservative retry configuration
 * For fast-failing operations
 */
export const CONSERVATIVE_RETRY_CONFIG: RetryConfig = {
  maxRetries: 1,
  baseDelay: 100,
  maxDelay: 1000,
  backoffMultiplier: 2,
  jitterFactor: 0.05,
};

/**
 * Calculate delay for a specific retry attempt
 *
 * Implements exponential backoff with optional jitter:
 * delay = min(baseDelay * (backoffMultiplier ^ attempt), maxDelay)
 * delay = delay * (1 + jitter)
 *
 * @param attempt - Retry attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: baseDelay * multiplier^attempt
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);

  // Add optional jitter (±jitterFactor%)
  const jitter = config.jitterFactor ?? 0;
  const jitterAmount = cappedDelay * jitter * (Math.random() - 0.5) * 2;
  const finalDelay = Math.max(0, cappedDelay + jitterAmount);

  return Math.round(finalDelay);
}

/**
 * Default logger (silent by default)
 */
function defaultLogger(message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info'): void {
  // Silent by default to avoid test spam
  // Users can provide custom logger to enable logging
}

/**
 * Determine if an error is retryable by default
 *
 * Retryable errors:
 * - Network timeouts
 * - Connection refused
 * - Temporary service unavailable
 *
 * Non-retryable errors:
 * - Invalid parameters
 * - Authentication failures
 * - Not found
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  // Network-related errors (retryable)
  if (
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('ehostunreach') ||
    message.includes('enetunreach') ||
    message.includes('unavailable') ||
    message.includes('deadline exceeded') ||
    message.includes('no connection established')
  ) {
    return true;
  }

  // RPC-specific retryable errors
  if (
    message.includes('rpc') &&
    (message.includes('busy') ||
      message.includes('overloaded') ||
      message.includes('temporarily unavailable') ||
      message.includes('timeout'))
  ) {
    return true;
  }

  return false;
}

/**
 * Execute an operation with automatic retry on failure
 *
 * Usage:
 * ```typescript
 * const result = await withRetry(
 *   () => dapiClient.core.getBlockchainStatus(),
 *   { maxRetries: 3, baseDelay: 500, maxDelay: 5000, backoffMultiplier: 2 }
 * );
 * ```
 *
 * @param operation - Async function to execute
 * @param config - Optional retry configuration
 * @returns Result from operation
 * @throws Last error if all retries fail
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const logger = fullConfig.logger || defaultLogger;
  const shouldRetry = fullConfig.shouldRetry || isRetryableError;

  let lastError: Error | unknown;
  let attempt = 0;

  // Initial attempt
  try {
    return await operation();
  } catch (error) {
    lastError = error;
    attempt = 0;
  }

  // Retry loop
  while (attempt < fullConfig.maxRetries) {
    // Check if error is retryable
    if (!shouldRetry(lastError)) {
      throw lastError;
    }

    // Calculate delay
    const delay = calculateDelay(attempt, fullConfig);

    // Log retry attempt
    const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
    logger(
      `Attempt ${attempt + 1}/${fullConfig.maxRetries} failed: ${errorMsg}. Retrying in ${delay}ms...`,
      'warn'
    );

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Retry attempt
    attempt++;
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }

  // All retries exhausted
  const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
  logger(
    `All ${fullConfig.maxRetries} retries failed. Last error: ${errorMsg}`,
    'error'
  );
  throw lastError;
}

/**
 * Execute multiple operations in parallel with retry
 *
 * Useful for testing multiple seeds or endpoints in parallel.
 *
 * @param operations - Array of async operations to execute
 * @param config - Optional retry configuration
 * @returns Array of results in same order as operations
 * @throws Error if any operation fails after retries
 */
export async function withRetryAll<T>(
  operations: Array<() => Promise<T>>,
  config: Partial<RetryConfig> = {}
): Promise<T[]> {
  return Promise.all(operations.map((op) => withRetry(op, config)));
}

/**
 * Execute operations in sequence with retry
 *
 * Useful when operations have dependencies.
 *
 * @param operations - Array of async operations to execute in order
 * @param config - Optional retry configuration
 * @returns Array of results in same order as operations
 * @throws Error if any operation fails after retries
 */
export async function withRetrySequential<T>(
  operations: Array<() => Promise<T>>,
  config: Partial<RetryConfig> = {}
): Promise<T[]> {
  const results: T[] = [];

  for (const operation of operations) {
    const result = await withRetry(operation, config);
    results.push(result);
  }

  return results;
}

/**
 * Execute operation with timeout and retry
 *
 * Combines timeout protection with retry logic.
 *
 * @param operation - Async function to execute
 * @param timeoutMs - Timeout per attempt in milliseconds
 * @param config - Optional retry configuration
 * @returns Result from operation
 * @throws Error if timeout or all retries fail
 */
export async function withRetryAndTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number = 30000,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  return withRetry(async () => {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }, config);
}
