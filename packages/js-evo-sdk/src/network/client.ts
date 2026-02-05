/**
 * Centralized Network Client
 *
 * Provides unified network operations with:
 * - Retry logic with exponential backoff + jitter
 * - Connection error detection and recovery
 * - Fresh DAPI client creation
 *
 * This is the single point of entry for all network operations
 * to ensure consistent error handling and retry behavior.
 */

// Declare process for Node.js environment (TypeScript compatibility)
declare const process: { env: { [key: string]: string | undefined } } | undefined;

export interface NetworkClientConfig {
  network: string;
  maxRetries?: number;        // Default: 3
  baseDelayMs?: number;       // Default: 1000
  maxDelayMs?: number;        // Default: 30000
  reconnectDelayMs?: number;  // Default: 2000
  timeoutMs?: number;         // Default: 30000
  banTimeMs?: number;         // Default: 60000
}

const DEFAULT_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  reconnectDelayMs: 2000,
  timeoutMs: 30000,
  banTimeMs: 60000,
} as const;

export class NetworkClient {
  private dapiClient: any | null = null;
  private readonly config: Required<NetworkClientConfig>;

  constructor(config: NetworkClientConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Execute a network operation with retry and error recovery.
   * ALL network calls should go through this method.
   *
   * @param operation - Async function to execute
   * @returns Result of the operation
   * @throws Error if all retries fail
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Connection error - reconnect and retry
        if (this.isConnectionError(error)) {
          await this.reconnect();
          continue;
        }

        // Retryable error - wait and retry
        if (this.isRetryableError(error) && attempt < this.config.maxRetries - 1) {
          await this.delay(this.calculateDelay(attempt));
          continue;
        }

        // Non-retryable - throw immediately
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Get or create a DAPI client for the current network.
   *
   * NOTE: We cache the client for efficiency, but reconnect() will clear it
   * when connection errors are detected.
   */
  async getDAPIClient(): Promise<any> {
    if (!this.dapiClient) {
      this.dapiClient = await this.createDAPIClient();
    }
    return this.dapiClient;
  }

  /**
   * Create a fresh DAPI client.
   */
  private async createDAPIClient(): Promise<any> {
    const DAPIClient = (await import('@dashevo/dapi-client')).default;

    // Get explicit addresses from env (browser won't have this, but Node.js will)
    let dapiAddresses: string[] | undefined;
    if (typeof process !== 'undefined' && process?.env?.DAPI_ADDRESSES) {
      dapiAddresses = process.env.DAPI_ADDRESSES.split(',').map(a => a.trim());
    }

    return new DAPIClient({
      network: this.config.network,
      timeout: this.config.timeoutMs,
      retries: this.config.maxRetries,
      baseBanTime: this.config.banTimeMs,
      ...(dapiAddresses && { dapiAddresses }),
    });
  }

  /**
   * Check if an error is retryable (transient network issues).
   */
  private isRetryableError(error: unknown): boolean {
    const message = (error as Error).message?.toLowerCase() || '';
    return message.includes('timeout') ||
           message.includes('unavailable') ||
           message.includes('connection refused') ||
           message.includes('econnreset') ||
           message.includes('econnrefused') ||
           message.includes('etimedout') ||
           message.includes('resource temporarily unavailable');
  }

  /**
   * Check if an error indicates connection issues requiring reconnect.
   */
  private isConnectionError(error: unknown): boolean {
    const message = (error as Error).message?.toLowerCase() || '';
    return message.includes('no available addresses') ||
           message.includes('all addresses banned') ||
           message.includes('no addresses available');
  }

  /**
   * Clear the cached client to force fresh connection.
   */
  private async reconnect(): Promise<void> {
    this.dapiClient = null;
    await this.delay(this.config.reconnectDelayMs);
  }

  /**
   * Calculate delay with exponential backoff and jitter.
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, this.config.maxDelayMs);
  }

  /**
   * Delay execution for specified milliseconds.
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get the current network configuration.
   */
  get network(): string {
    return this.config.network;
  }
}
