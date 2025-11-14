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

  constructor(config: ResilientConfig) {
    super();

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

      ...config,
    } as Required<ResilientConfig>;

    this.logger = createLogger('ResilientDAPI', this.config.logLevel);

    // Initialize strategies
    this.nodePool = new NodePoolManager(
      this.config.dapiAddresses,
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

    // Create underlying DAPI client
    this.dapiClient = this.createDAPIClient();

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
    return {
      ...this.degradation.getStatus(),
      currentNode: this.nodePool.getCurrentNode(),
      nodePoolSize: this.nodePool.getPoolSize(),
      failureCount: this.retryStrategy.getFailureCount(),
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
}
