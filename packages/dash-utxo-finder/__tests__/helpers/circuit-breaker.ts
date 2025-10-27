/**
 * Circuit Breaker Pattern
 *
 * Implements the circuit breaker pattern to prevent cascading failures.
 * Useful for protecting against repeated attempts to failing services.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service failing, requests are rejected immediately
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 */

/**
 * Circuit breaker states
 */
export enum CircuitState {
  /** Normal operation, requests pass through */
  CLOSED = 'CLOSED',

  /** Service failing, requests rejected immediately */
  OPEN = 'OPEN',

  /** Testing recovery, limited requests allowed */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;

  /** Number of successful requests needed to close circuit from HALF_OPEN */
  successThreshold: number;

  /** Time in milliseconds before moving from OPEN to HALF_OPEN */
  timeout: number;

  /** Optional: custom logger function */
  logger?: (message: string, level?: 'debug' | 'info' | 'warn' | 'error') => void;

  /** Optional: predicate to determine if error should count toward threshold */
  shouldCountFailure?: (error: unknown) => boolean;

  /** Optional: name for logging */
  name?: string;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
};

/**
 * Circuit Breaker implementation
 *
 * Protects against cascading failures by:
 * 1. Tracking failures
 * 2. Opening circuit after threshold
 * 3. Rejecting requests when open
 * 4. Testing recovery in half-open state
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private config: CircuitBreakerConfig;
  private logger: (message: string, level?: 'debug' | 'info' | 'warn' | 'error') => void;
  private shouldCountFailure: (error: unknown) => boolean;

  /**
   * Create a new circuit breaker
   *
   * @param config Circuit breaker configuration
   */
  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.logger = this.config.logger || this.defaultLogger;
    this.shouldCountFailure = this.config.shouldCountFailure || (() => true);

    this.log(
      `Circuit breaker created: threshold=${this.config.failureThreshold}, ` +
        `timeout=${this.config.timeout}ms`,
      'debug'
    );
  }

  /**
   * Default logger (silent)
   */
  private defaultLogger(message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info'): void {
    // Silent by default
  }

  /**
   * Log a message with context
   */
  private log(message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info'): void {
    const prefix = this.config.name ? `[${this.config.name}]` : '[CircuitBreaker]';
    this.logger(`${prefix} ${message}`, level);
  }

  /**
   * Execute an operation through the circuit breaker
   *
   * @param operation Async operation to execute
   * @returns Result from operation
   * @throws Error if circuit is open or operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has passed
      if (Date.now() - this.lastFailureTime > this.config.timeout) {
        // Move to HALF_OPEN to test recovery
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        this.log(`Circuit moved to HALF_OPEN, testing recovery`, 'warn');
      } else {
        // Still open, reject request
        const remainingTime = this.config.timeout - (Date.now() - this.lastFailureTime);
        throw new Error(
          `Circuit breaker is OPEN. Service unavailable. ` +
            `Will retry in ${remainingTime}ms. ` +
            `(Failed ${this.failureCount} times)`
        );
      }
    }

    // Execute the operation
    try {
      const result = await operation();

      // Success
      if (this.state === CircuitState.HALF_OPEN) {
        this.successCount++;
        this.log(`HALF_OPEN: Success ${this.successCount}/${this.config.successThreshold}`, 'debug');

        if (this.successCount >= this.config.successThreshold) {
          // Recovered, close circuit
          this.state = CircuitState.CLOSED;
          this.failureCount = 0;
          this.successCount = 0;
          this.log(`Circuit CLOSED (recovered)`, 'info');
        }
      } else if (this.state === CircuitState.CLOSED) {
        // Normal operation
        if (this.failureCount > 0) {
          this.failureCount--;
          this.log(`Success, reducing failure count to ${this.failureCount}`, 'debug');
        }
      }

      return result;
    } catch (error) {
      // Check if this error should count toward the threshold
      if (!this.shouldCountFailure(error)) {
        throw error; // Re-throw non-countable errors
      }

      // Record failure
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.state === CircuitState.HALF_OPEN) {
        // Failed while testing recovery, go back to open
        this.state = CircuitState.OPEN;
        this.log(`HALF_OPEN test failed, circuit OPEN again`, 'warn');
      } else if (this.failureCount >= this.config.failureThreshold) {
        // Threshold reached, open circuit
        this.state = CircuitState.OPEN;
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.log(
          `Failure threshold reached (${this.failureCount}/${this.config.failureThreshold}). ` +
            `Circuit OPEN. Last error: ${errorMsg}`,
          'error'
        );
      } else {
        // Track but don't open
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.log(
          `Failure ${this.failureCount}/${this.config.failureThreshold}: ${errorMsg}`,
          'warn'
        );
      }

      throw error;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Reset circuit to closed state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.log(`Circuit reset to CLOSED`, 'info');
  }

  /**
   * Force circuit open (for testing)
   */
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.lastFailureTime = Date.now();
    this.log(`Circuit forced OPEN`, 'warn');
  }

  /**
   * Force circuit closed (for testing)
   */
  forceClosed(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.log(`Circuit forced CLOSED`, 'warn');
  }

  /**
   * Get circuit breaker status
   */
  getStatus(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

/**
 * Create a circuit breaker with standard configuration for DAPI connections
 *
 * Suitable for testnet seed nodes with moderate reliability.
 *
 * @param name Optional name for logging
 * @returns Configured CircuitBreaker
 */
export function createDAPICircuitBreaker(name?: string): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 20000,
    name: name || 'DAPI',
  });
}

/**
 * Create a circuit breaker with aggressive configuration
 *
 * For unreliable connections that need fast failure detection.
 *
 * @param name Optional name for logging
 * @returns Configured CircuitBreaker
 */
export function createAggressiveCircuitBreaker(name?: string): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: 2,
    successThreshold: 1,
    timeout: 10000,
    name: name || 'Aggressive',
  });
}

/**
 * Create a circuit breaker with conservative configuration
 *
 * For highly reliable connections that should tolerate more failures.
 *
 * @param name Optional name for logging
 * @returns Configured CircuitBreaker
 */
export function createConservativeCircuitBreaker(name?: string): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: 10,
    successThreshold: 3,
    timeout: 60000,
    name: name || 'Conservative',
  });
}
