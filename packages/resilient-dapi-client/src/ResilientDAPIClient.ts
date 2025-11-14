/**
 * ResilientDAPIClient
 *
 * Production-ready DAPI client wrapper with resilience features from payment-monitor:
 * - Automatic retry with exponential backoff
 * - DAPI node failover with rotation
 * - Graceful degradation on platform failures
 * - Observable events for all resilience actions
 * - Structured logging
 *
 * Drop-in replacement for @dashevo/dapi-client with enhanced reliability.
 */

import { EventEmitter } from 'events';
import DAPIClient from '@dashevo/dapi-client';
import { createLogger, Logger, parseLogLevel } from './utils/logger.js';
import { AdaptiveRetryStrategy } from './strategies/AdaptiveRetryStrategy.js';
import { NodePoolManager } from './strategies/NodePoolManager.js';
import { GracefulDegradation } from './strategies/GracefulDegradation.js';
import {
  ResilientConfig,
  RetryEvent,
  FailoverEvent,
  DegradationEvent,
  ResilientStatus,
} from './types.js';

export class ResilientDAPIClient extends EventEmitter {
  private dapiClient: DAPIClient;
  private logger: Logger;
  private nodePool: NodePoolManager;
  private retryStrategy: AdaptiveRetryStrategy;
  private degradation: GracefulDegradation;
  private config: Required<ResilientConfig>;
  private ownsDAPIClient: boolean;

  /**
   * Create a new ResilientDAPIClient
   *
   * @param configOrClient - Either a ResilientConfig object (production) or a DAPIClient instance (testing)
   * @param options - Optional config when passing a DAPIClient instance
   *
   * @example Production usage:
   * ```typescript
   * const client = new ResilientDAPIClient({
   *   network: 'testnet',
   *   dapiAddresses: ['node1:1443', 'node2:1443'],
   *   maxRetryAttempts: 10
   * });
   * ```
   *
   * @example Test usage with injected DAPIClient:
   * ```typescript
   * const dapiClient = new DAPIClient({ seeds: ['node1'] });
   * const proxy = createFailureProxy(dapiClient);
   * const client = new ResilientDAPIClient(dapiClient, {
   *   maxRetryAttempts: 10
   * });
   * ```
   */
  constructor(configOrClient: ResilientConfig | DAPIClient, options?: Partial<ResilientConfig>) {
    super();

    // Determine if we're in test mode (DAPIClient injection) or production mode
    // Check if it's a DAPIClient by looking for core/platform properties (duck typing)
    // This works with both real DAPIClient and ControllableMockDAPIClient
    const isDAPIClientInjection =
      configOrClient instanceof DAPIClient ||
      (typeof configOrClient === 'object' && 'core' in configOrClient && 'platform' in configOrClient);

    if (isDAPIClientInjection) {
      // Test mode: use provided DAPIClient (allows failure proxy wrapping)
      this.dapiClient = configOrClient;
      this.ownsDAPIClient = false;

      // Apply defaults with optional overrides
      this.config = {
        // Standard DAPI defaults
        timeout: 60000,
        retries: 5,
        baseBanTime: 60000,

        // Resilience defaults
        logLevel: 'error',
        enableObservability: true,
        enableGracefulDegradation: true,
        enableAdaptiveRetry: true,
        maxRetryDelay: 30000,
        retryBaseDelay: 1000,
        nodeRetryDelay: 300000,
        maxRetryAttempts: 10,

        ...options,
      } as Required<ResilientConfig>;
    } else {
      // Production mode: create own DAPIClient
      this.ownsDAPIClient = true;

      // Apply defaults (from payment-monitor pattern)
      this.config = {
        // Standard DAPI defaults
        timeout: 60000,
        retries: 5,
        baseBanTime: 60000,

        // Resilience defaults
        logLevel: 'error',
        enableObservability: true,
        enableGracefulDegradation: true,
        enableAdaptiveRetry: true,
        maxRetryDelay: 30000,
        retryBaseDelay: 1000,
        nodeRetryDelay: 300000,
        maxRetryAttempts: 10,

        ...configOrClient,
      } as Required<ResilientConfig>;

      // Create underlying DAPI client
      this.dapiClient = this.createDAPIClient();
    }

    this.logger = createLogger('ResilientDAPI', this.config.logLevel);

    // Initialize strategies
    // Note: In test mode with injected client, dapiAddresses might not be in config
    // Use empty array as fallback since node pool isn't used when client is injected
    const addresses = this.config.dapiAddresses || [];
    this.nodePool = new NodePoolManager(
      addresses,
      this.config.nodeRetryDelay,
      this.logger
    );

    this.retryStrategy = new AdaptiveRetryStrategy(
      {
        maxRetryAttempts: this.config.maxRetryAttempts,
        retryBaseDelay: this.config.retryBaseDelay,
        maxRetryDelay: this.config.maxRetryDelay,
        enableAdaptiveRetry: this.config.enableAdaptiveRetry,
      },
      this.logger
    );

    this.degradation = new GracefulDegradation(
      this.config.enableGracefulDegradation,
      this.logger
    );

    this.logger.info('ResilientDAPIClient initialized');
  }

  /**
   * Create or recreate underlying DAPI client
   */
  private createDAPIClient(): DAPIClient {
    return new DAPIClient({
      network: this.config.network,
      dapiAddresses: this.config.dapiAddresses,
      seeds: this.config.seeds,
      timeout: this.config.timeout,
      retries: this.config.retries,
      baseBanTime: this.config.baseBanTime,
    });
  }

  /**
   * Proxy for core methods (blockchain operations)
   */
  get core() {
    return this.createResilientProxy('core');
  }

  /**
   * Proxy for platform methods (identity/document operations)
   */
  get platform() {
    return this.createResilientProxy('platform');
  }

  /**
   * Create proxy that wraps all methods with resilience
   */
  private createResilientProxy(namespace: 'core' | 'platform') {
    const target = (this.dapiClient as any)[namespace];

    return new Proxy(target, {
      get: (obj, methodName) => {
        const original = obj[methodName];

        // Pass through non-function properties
        if (typeof original !== 'function') {
          return original;
        }

        // Return wrapped method with resilience
        return async (...args: any[]) => {
          return this.executeWithResilience(
            namespace,
            methodName as string,
            () => original.apply(obj, args)
          );
        };
      },
    });
  }

  /**
   * Execute operation with full resilience stack
   */
  private async executeWithResilience(
    namespace: 'core' | 'platform',
    method: string,
    operation: () => Promise<any>
  ): Promise<any> {
    return this.retryStrategy.execute(
      async (attempt) => {
        try {
          this.logger.debug(`${namespace}.${method}() - attempt ${attempt}`);
          const result = await operation();

          // Reset degradation state on success
          this.degradation.reset(namespace);

          return result;

        } catch (error: any) {
          this.logger.error(`${namespace}.${method}() failed:`, error.message);

          // Emit retry event for observability
          if (this.config.enableObservability) {
            const delay = this.calculateNextDelay(attempt);
            this.emit('retry', {
              namespace,
              method,
              attempt,
              error,
              delay,
            } as RetryEvent);
          }

          // Try node failover if available
          if (this.nodePool.hasMultipleNodes()) {
            const oldNode = this.nodePool.getCurrentNode();
            this.nodePool.markCurrentFailed();

            if (this.nodePool.rotateToNext()) {
              const newNode = this.nodePool.getCurrentNode();
              this.logger.info(`🔀 Failing over from ${oldNode} to ${newNode}`);

              if (this.config.enableObservability) {
                this.emit('failover', {
                  oldNode: oldNode!,
                  newNode: newNode!,
                  reason: error.message,
                } as FailoverEvent);
              }

              // Recreate DAPI client (forces connection to new node)
              this.dapiClient = this.createDAPIClient();

              // Reset retry counter for new node
              this.retryStrategy.reset();
            }
          }

          // Check if we should degrade gracefully
          if (this.degradation.handleFailure(namespace, error)) {
            this.logger.warn(`⚠️  ${namespace} service degraded, continuing...`);

            if (this.config.enableObservability) {
              this.emit('degradation', {
                service: namespace,
                error,
                timestamp: Date.now(),
              } as DegradationEvent);
            }

            // Return null instead of throwing (degraded operation)
            return null;
          }

          // Re-throw to trigger retry
          throw error;
        }
      },
      (attempt, delay) => {
        // onRetry callback (already handled in emit above)
      }
    );
  }

  /**
   * Calculate next retry delay (for event emission)
   */
  private calculateNextDelay(attempt: number): number {
    if (!this.config.enableAdaptiveRetry) {
      return 0;
    }

    const base = this.config.retryBaseDelay;
    const max = this.config.maxRetryDelay;
    const delay = base * Math.pow(2, attempt - 1);
    return Math.min(delay, max);
  }

  /**
   * Get current resilience status
   */
  getStatus(): ResilientStatus {
    const poolSize = this.nodePool.getPoolSize();
    const failedCount = this.nodePool.getFailedNodeCount();

    return {
      ...this.degradation.getStatus(),
      currentNode: this.nodePool.getCurrentNode(),
      nodePoolSize: poolSize,
      failureCount: this.retryStrategy.getFailureCount(),
      nodePool: {
        total: poolSize,
        available: poolSize - failedCount,
        blacklisted: failedCount,
      },
    };
  }

  /**
   * Get underlying DAPIClient instance (escape hatch for advanced usage)
   */
  getUnderlyingClient(): DAPIClient {
    return this.dapiClient;
  }

  /**
   * Reset all resilience state (for testing or manual recovery)
   */
  resetResilience(): void {
    this.retryStrategy.reset();
    this.degradation.reset();
    this.nodePool.clearFailedNodes();
    this.logger.info('Resilience state reset');
  }

  /**
   * Destroy the client and clean up resources
   * Only destroys the underlying DAPIClient if we created it (production mode)
   */
  destroy(): void {
    if (this.ownsDAPIClient) {
      // We own the DAPIClient, safe to destroy it
      const client = this.dapiClient as any;
      if (client && typeof client.disconnect === 'function') {
        client.disconnect();
      }
      this.logger.info('ResilientDAPIClient destroyed (owned client cleaned up)');
    } else {
      // DAPIClient was injected (test mode), don't destroy it
      this.logger.info('ResilientDAPIClient destroyed (injected client not cleaned up)');
    }

    // Clear all event listeners
    this.removeAllListeners();
  }
}
