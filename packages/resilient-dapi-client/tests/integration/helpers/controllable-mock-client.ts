/**
 * Controllable Mock DAPI Client
 *
 * A mock DAPIClient implementation that allows precise control over
 * failure injection for testing retry, failover, and degradation behavior.
 *
 * Unlike FailureProxy (which wraps and intercepts), this implements the
 * DAPIClient interface directly, avoiding proxy layering issues.
 */

export type MockFailureType =
  | 'timeout'
  | 'connection_refused'
  | 'http_500'
  | 'http_503'
  | 'invalid_response'
  | 'platform_error';

export interface MockFailureRule {
  namespace?: 'core' | 'platform';  // Target specific namespace
  method?: string;                   // Target specific method
  failureType: MockFailureType;
  count?: number;                    // Fail this many times, then succeed
  probability?: number;              // 0.0-1.0 (default: 1.0 = always fail)
  delay?: number;                    // Delay before failing (ms)
}

interface MockResponse {
  [key: string]: any;
}

/**
 * Controllable Mock DAPI Client
 *
 * Implements DAPIClient-compatible interface for testing
 */
export class ControllableMockDAPIClient {
  private failureRules: MockFailureRule[] = [];
  private callCounts: Map<string, number> = new Map();
  private failureCounts: Map<string, number> = new Map();
  private mockResponses: Map<string, any> = new Map();

  // Default mock responses
  constructor() {
    this.setDefaultResponses();
  }

  /**
   * Core namespace methods
   */
  core = {
    getBestBlockHeight: async (): Promise<number> => {
      return this.executeMethod('core', 'getBestBlockHeight', async () => {
        return this.mockResponses.get('core.getBestBlockHeight') || 2000000;
      });
    },

    getBlockByHeight: async (height: number): Promise<Buffer> => {
      return this.executeMethod('core', 'getBlockByHeight', async () => {
        return this.mockResponses.get('core.getBlockByHeight') || Buffer.from([0, 0, 0, 32]);
      });
    },

    getTransaction: async (txid: string): Promise<Buffer> => {
      return this.executeMethod('core', 'getTransaction', async () => {
        return this.mockResponses.get('core.getTransaction') || Buffer.from([0, 0, 0, 1]);
      });
    },

    broadcastTransaction: async (tx: Buffer): Promise<string> => {
      return this.executeMethod('core', 'broadcastTransaction', async () => {
        return this.mockResponses.get('core.broadcastTransaction') || 'mock-txid-1234567890';
      });
    },

    getStatus: async (): Promise<any> => {
      return this.executeMethod('core', 'getStatus', async () => {
        return this.mockResponses.get('core.getStatus') || { version: '1.0.0' };
      });
    },
  };

  /**
   * Platform namespace methods
   */
  platform = {
    getIdentity: async (id: string): Promise<any> => {
      return this.executeMethod('platform', 'getIdentity', async () => {
        return this.mockResponses.get('platform.getIdentity') || {
          id,
          balance: 1000,
          revision: 0,
        };
      });
    },

    getDataContract: async (id: string): Promise<any> => {
      return this.executeMethod('platform', 'getDataContract', async () => {
        return this.mockResponses.get('platform.getDataContract') || {
          id,
          version: 1,
        };
      });
    },

    getDocuments: async (contractId: string, documentType: string, options: any): Promise<any[]> => {
      return this.executeMethod('platform', 'getDocuments', async () => {
        return this.mockResponses.get('platform.getDocuments') || [];
      });
    },

    getIdentityNonce: async (identityId: string): Promise<number> => {
      return this.executeMethod('platform', 'getIdentityNonce', async () => {
        return this.mockResponses.get('platform.getIdentityNonce') || 0;
      });
    },

    broadcastStateTransition: async (stateTransition: any): Promise<string> => {
      return this.executeMethod('platform', 'broadcastStateTransition', async () => {
        return this.mockResponses.get('platform.broadcastStateTransition') || 'mock-state-transition-hash-1234567890';
      });
    },

    waitForStateTransitionResult: async (hash: string, options?: any): Promise<any> => {
      return this.executeMethod('platform', 'waitForStateTransitionResult', async () => {
        return this.mockResponses.get('platform.waitForStateTransitionResult') || {
          hash,
          status: 'confirmed',
          blockHeight: 2000100,
        };
      });
    },

    getEpochsInfo: async (startEpoch?: number, count?: number, ascending?: boolean): Promise<any> => {
      return this.executeMethod('platform', 'getEpochsInfo', async () => {
        return this.mockResponses.get('platform.getEpochsInfo') || {
          epoch: 100,
          chainLockedHeight: 2000050,
        };
      });
    },
  };

  /**
   * Execute a method with failure injection
   */
  private async executeMethod<T>(
    namespace: 'core' | 'platform',
    method: string,
    implementation: () => Promise<T>
  ): Promise<T> {
    const key = `${namespace}.${method}`;

    // Increment call count
    const callCount = (this.callCounts.get(key) || 0) + 1;
    this.callCounts.set(key, callCount);

    // Check if we should inject a failure
    const rule = this.shouldInjectFailure(namespace, method, key);
    if (rule) {
      throw await this.createError(rule);
    }

    // Execute actual implementation
    return implementation();
  }

  /**
   * Determine if we should inject a failure
   */
  private shouldInjectFailure(
    namespace: string,
    method: string,
    key: string
  ): MockFailureRule | null {
    for (const rule of this.failureRules) {
      // Check namespace match
      if (rule.namespace && rule.namespace !== namespace) {
        continue;
      }

      // Check method match
      if (rule.method && rule.method !== method) {
        continue;
      }

      // Check probability
      if (rule.probability !== undefined && Math.random() > rule.probability) {
        continue;
      }

      // Check count limit
      if (rule.count !== undefined) {
        const failureKey = `${key}:${rule.failureType}`;
        const currentCount = this.failureCounts.get(failureKey) || 0;

        if (currentCount >= rule.count) {
          // Already failed enough times, don't fail anymore
          continue;
        }

        // Increment failure count
        this.failureCounts.set(failureKey, currentCount + 1);
      }

      return rule;
    }

    return null;
  }

  /**
   * Create an error based on failure type
   */
  private async createError(rule: MockFailureRule): Promise<Error> {
    // Apply delay if specified
    if (rule.delay) {
      await new Promise(resolve => setTimeout(resolve, rule.delay));
    }

    switch (rule.failureType) {
      case 'timeout':
        return new Error('Request timeout after 10000ms');

      case 'connection_refused':
        return Object.assign(new Error('connect ECONNREFUSED'), {
          code: 'ECONNREFUSED',
        });

      case 'http_500':
        return Object.assign(new Error('Internal Server Error'), {
          code: 'HTTP_ERROR',
          statusCode: 500,
        });

      case 'http_503':
        return Object.assign(new Error('Service Unavailable'), {
          code: 'HTTP_ERROR',
          statusCode: 503,
        });

      case 'invalid_response':
        return new Error('Invalid response format');

      case 'platform_error':
        return Object.assign(new Error('Platform is not available'), {
          code: 'PLATFORM_ERROR',
        });

      default:
        return new Error('Unknown error');
    }
  }

  /**
   * Control Methods
   */

  /**
   * Add a failure rule
   */
  injectFailure(rule: MockFailureRule): void {
    this.failureRules.push({ probability: 1.0, ...rule });
  }

  /**
   * Clear all failure rules
   */
  clearFailures(): void {
    this.failureRules = [];
    this.failureCounts.clear();
  }

  /**
   * Clear all call counts
   */
  clearCallCounts(): void {
    this.callCounts.clear();
  }

  /**
   * Get call count for a specific method
   */
  getCallCount(namespace: string, method: string): number {
    return this.callCounts.get(`${namespace}.${method}`) || 0;
  }

  /**
   * Get failure count for a specific method
   */
  getFailureCount(namespace: string, method: string, failureType: MockFailureType): number {
    return this.failureCounts.get(`${namespace}.${method}:${failureType}`) || 0;
  }

  /**
   * Set a custom response for a method
   */
  setResponse(namespace: string, method: string, response: any): void {
    this.mockResponses.set(`${namespace}.${method}`, response);
  }

  /**
   * Reset to default responses
   */
  private setDefaultResponses(): void {
    this.mockResponses.set('core.getBestBlockHeight', 2000000);
    this.mockResponses.set('core.getBlockByHeight', Buffer.from([0, 0, 0, 32]));
    this.mockResponses.set('core.getTransaction', Buffer.from([0, 0, 0, 1]));
    this.mockResponses.set('core.broadcastTransaction', 'mock-txid-1234567890');
    this.mockResponses.set('core.getStatus', { version: '1.0.0' });
    this.mockResponses.set('platform.getIdentity', { balance: 1000 });
    this.mockResponses.set('platform.getDataContract', { version: 1 });
    this.mockResponses.set('platform.getDocuments', []);
    this.mockResponses.set('platform.getIdentityNonce', 0);
    this.mockResponses.set('platform.broadcastStateTransition', 'mock-state-transition-hash-1234567890');
    this.mockResponses.set('platform.waitForStateTransitionResult', { status: 'confirmed', blockHeight: 2000100 });
    this.mockResponses.set('platform.getEpochsInfo', { epoch: 100, chainLockedHeight: 2000050 });
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalCalls: number;
    totalFailures: number;
    callsByMethod: Record<string, number>;
    failuresByType: Record<string, number>;
  } {
    const callsByMethod: Record<string, number> = {};
    const failuresByType: Record<string, number> = {};
    let totalCalls = 0;
    let totalFailures = 0;

    // Count calls
    for (const [key, count] of this.callCounts) {
      callsByMethod[key] = count;
      totalCalls += count;
    }

    // Count failures
    for (const [key, count] of this.failureCounts) {
      const failureType = key.split(':')[1];
      failuresByType[failureType] = (failuresByType[failureType] || 0) + count;
      totalFailures += count;
    }

    return { totalCalls, totalFailures, callsByMethod, failuresByType };
  }
}

/**
 * Common failure scenarios
 */
export const MockFailureScenarios = {
  /**
   * Transient timeout that resolves after N retries
   */
  transientTimeout: (method: string, count: number = 2): MockFailureRule => ({
    method,
    failureType: 'timeout',
    count,
  }),

  /**
   * Persistent timeout (always fails)
   */
  persistentTimeout: (method: string): MockFailureRule => ({
    method,
    failureType: 'timeout',
  }),

  /**
   * Connection refused
   */
  connectionRefused: (method?: string, count?: number): MockFailureRule => ({
    method,
    failureType: 'connection_refused',
    count,
  }),

  /**
   * Platform unavailable (for degradation testing)
   */
  platformUnavailable: (): MockFailureRule => ({
    namespace: 'platform',
    failureType: 'platform_error',
  }),

  /**
   * Random failures (configurable probability)
   */
  randomFailures: (probability: number = 0.1): MockFailureRule => ({
    failureType: 'timeout',
    probability,
  }),

  /**
   * HTTP 500 error
   */
  http500: (method?: string, count?: number): MockFailureRule => ({
    method,
    failureType: 'http_500',
    count,
  }),

  /**
   * HTTP 503 service unavailable
   */
  http503: (method?: string): MockFailureRule => ({
    method,
    failureType: 'http_503',
  }),
};

/**
 * Create a controllable mock DAPI client for testing
 */
export function createMockDAPIClient(): ControllableMockDAPIClient {
  return new ControllableMockDAPIClient();
}
