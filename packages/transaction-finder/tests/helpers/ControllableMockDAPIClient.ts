/**
 * Controllable Mock DAPI Client for transaction-finder testing
 *
 * Provides precise control over streaming responses and failure injection
 * for testing TransactionFinder, TransactionSyncer, and monitoring components.
 *
 * Unlike the resilient-dapi-client mock, this focuses on:
 * - Stream-based transaction and header subscriptions
 * - Protobuf message simulation
 * - InstantLock and ChainLock event generation
 * - Realistic transaction and block data
 */

import { EventEmitter } from 'events';
import dashcore from '@dashevo/dashcore-lib';
const { Transaction, MerkleBlock, BlockHeader, InstantLock, ChainLock } = dashcore;

export type MockFailureType =
  | 'timeout'
  | 'connection_refused'
  | 'stream_error'
  | 'invalid_response'
  | 'platform_error';

export interface MockFailureRule {
  method?: string;                   // Target specific method
  failureType: MockFailureType;
  count?: number;                    // Fail this many times, then succeed
  probability?: number;              // 0.0-1.0 (default: 1.0 = always fail)
  delay?: number;                    // Delay before failing (ms)
}

/**
 * Mock stream that emits messages
 */
class MockStream extends EventEmitter {
  private messages: any[] = [];
  private cancelled = false;
  private emissionDelay: number;
  private shouldError?: boolean;
  private error?: Error;

  constructor(messages: any[] = [], emissionDelay: number = 0) {
    super();
    this.messages = messages;
    this.emissionDelay = emissionDelay;
  }

  async *[Symbol.asyncIterator]() {
    // Throw error immediately if shouldError flag is set
    if ((this as any).shouldError && (this as any).error) {
      throw (this as any).error;
    }

    for (const message of this.messages) {
      if (this.cancelled) {
        break;
      }

      if (this.emissionDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.emissionDelay));
      }

      yield message;
    }
  }

  on(event: string, handler: Function) {
    super.on(event, handler);

    // Emit messages asynchronously when 'data' listener is attached
    if (event === 'data') {
      setImmediate(async () => {
        // Emit error immediately if shouldError flag is set
        if ((this as any).shouldError && (this as any).error) {
          this.emit('error', (this as any).error);
          return;
        }

        for (const message of this.messages) {
          if (this.cancelled) {
            break;
          }

          if (this.emissionDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.emissionDelay));
          }

          this.emit('data', message);
        }
        this.emit('end');
      });
    }

    return this;
  }

  cancel() {
    this.cancelled = true;
    this.emit('cancelled');
  }
}

/**
 * Mock protobuf message structures
 */
class MockBlockHeadersMessage {
  private headers: Buffer[];

  constructor(headers: Buffer[]) {
    this.headers = headers;
  }

  getBlockHeaders() {
    return {
      getHeadersList: () => this.headers,
      headersList: this.headers,
    };
  }

  get blockHeaders() {
    return {
      getHeadersList: () => this.headers,
      headersList: this.headers,
    };
  }
}

class MockRawTransactionsMessage {
  private _transactions: Buffer[];

  constructor(transactions: Buffer[]) {
    this._transactions = transactions;
  }

  getRawTransactions() {
    return {
      getTransactionsList: () => this._transactions,
      transactionsList: this._transactions,
    };
  }

  get rawTransactions() {
    return {
      getTransactionsList: () => this._transactions,
      transactionsList: this._transactions,
    };
  }
}

class MockRawMerkleBlockMessage {
  private _merkleBlock: Buffer;

  constructor(merkleBlock: Buffer) {
    this._merkleBlock = merkleBlock;
  }

  getRawMerkleBlock() {
    return this._merkleBlock;
  }

  get rawMerkleBlock() {
    return this._merkleBlock;
  }
}

class MockInstantSendLockMessage {
  private _instantSendLocks: Buffer[];

  constructor(instantSendLocks: Buffer | Buffer[]) {
    this._instantSendLocks = Array.isArray(instantSendLocks) ? instantSendLocks : [instantSendLocks];
  }

  getInstantSendLockMessages() {
    return this._instantSendLocks;
  }

  get instantSendLockMessages() {
    return this._instantSendLocks;
  }
}

class MockChainLockMessage {
  private _chainLocks: Buffer[];

  constructor(chainLocks: Buffer | Buffer[]) {
    this._chainLocks = Array.isArray(chainLocks) ? chainLocks : [chainLocks];
  }

  getChainLockMessages() {
    return this._chainLocks;
  }

  get chainLockMessages() {
    return this._chainLocks;
  }
}

/**
 * Test fixture builders
 */
export class MockDataBuilder {
  /**
   * Create a mock transaction
   */
  static createTransaction(txid: string, outputs: Array<{ address: string; satoshis: number }>): any {
    const tx = new Transaction();

    // Add inputs (dummy)
    tx.from({
      txid: '0000000000000000000000000000000000000000000000000000000000000000',
      outputIndex: 0,
      script: '76a914000000000000000000000000000000000000000088ac',
      satoshis: 100000000,
    });

    // Add outputs
    outputs.forEach(({ address, satoshis }) => {
      tx.to(address, satoshis);
    });

    // Override txid for testing (normally calculated from inputs/outputs)
    (tx as any)._hash = Buffer.from(txid, 'hex');

    return tx;
  }

  /**
   * Create a mock block header
   */
  static createBlockHeader(height: number, time: number = Date.now() / 1000): any {
    const header = new BlockHeader({
      version: 1,
      prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
      merkleRoot: '0000000000000000000000000000000000000000000000000000000000000000',
      time,
      bits: 0x1d00ffff,
      nonce: height, // Use height as nonce for uniqueness
    });

    return header;
  }

  /**
   * Create a mock merkle block
   */
  static createMerkleBlock(
    height: number,
    txids: string[],
    time: number = Date.now() / 1000
  ): any {
    const header = MockDataBuilder.createBlockHeader(height, time);

    // Create MerkleBlock with the header and txids
    const merkleBlock = new MerkleBlock({
      header,
      numTransactions: txids.length,
      hashes: txids.map(txid => Buffer.from(txid, 'hex').reverse()),
      flags: [0xff], // All transactions match
    });

    return merkleBlock;
  }

  /**
   * Create a mock InstantLock
   */
  static createInstantLock(txid: string, height: number): any {
    // Create using dashcore's InstantLock.fromObject for proper validation
    const instantLock = InstantLock.fromObject({
      version: 1,
      inputs: [{
        outpointHash: Buffer.alloc(32).toString('hex'),
        outpointIndex: 0
      }],
      txid: txid,
      cyclehash: Buffer.alloc(32).toString('hex'),
      signature: Buffer.alloc(96).toString('hex')
    });

    return instantLock.toBuffer();
  }

  /**
   * Create a mock ChainLock
   */
  static createChainLock(height: number, blockHash: string): any {
    // ChainLock structure (simplified)
    return {
      height,
      blockHash: Buffer.from(blockHash, 'hex').reverse(),
      signature: Buffer.alloc(96), // BLS signature
    };
  }
}

/**
 * Controllable Mock DAPI Client
 */
export class ControllableMockDAPIClient {
  private failureRules: MockFailureRule[] = [];
  private callCounts: Map<string, number> = new Map();
  private failureCounts: Map<string, number> = new Map();

  // Configurable responses
  private blockchainStatus: any = {
    chain: { blocksCount: 2000000, headersCount: 2000000 },
  };

  // Stream data
  private headerStreamMessages: any[] = [];
  private transactionStreamMessages: any[] = [];
  private streamDelay: number = 0;
  private currentChainLockHeight: number = 100;
  private currentBlockHeight: number = 1000;

  constructor() {
    this.setDefaultResponses();
  }

  /**
   * Core namespace methods
   */
  core = {
    getBlockchainStatus: async (): Promise<any> => {
      return this.executeMethod('getBlockchainStatus', async () => {
        return this.blockchainStatus;
      });
    },

    getBlockByHash: async (hash: string): Promise<any> => {
      return this.executeMethod('getBlockByHash', async () => {
        // Return mock block data
        return {
          header: Buffer.from([0, 0, 0, 32]),
          transactions: [],
        };
      });
    },

    subscribeToBlockHeadersWithChainLocks: (options: any): MockStream => {
      this.incrementCallCount('subscribeToBlockHeadersWithChainLocks');

      const rule = this.shouldInjectFailure('subscribeToBlockHeadersWithChainLocks');
      if (rule) {
        // Create stream that will throw during iteration
        const errorStream = new MockStream([], 0);
        (errorStream as any).shouldError = true;
        (errorStream as any).error = this.createErrorSync(rule);
        return errorStream;
      }

      return new MockStream(this.headerStreamMessages, this.streamDelay);
    },

    subscribeToTransactionsWithProofs: (filter: any, options: any): MockStream => {
      this.incrementCallCount('subscribeToTransactionsWithProofs');

      const rule = this.shouldInjectFailure('subscribeToTransactionsWithProofs');
      if (rule) {
        // Create stream that will throw during iteration
        const errorStream = new MockStream([], 0);
        (errorStream as any).shouldError = true;
        (errorStream as any).error = this.createErrorSync(rule);
        return errorStream;
      }

      return new MockStream(this.transactionStreamMessages, this.streamDelay);
    },

    getBestBlockHeight: async (): Promise<number> => {
      return this.executeMethod('getBestBlockHeight', async () => {
        return this.currentBlockHeight;
      });
    },
  };

  /**
   * Platform namespace (optional for transaction-finder)
   */
  platform = {
    getEpochsInfo: async (options?: any): Promise<any> => {
      return this.executeMethod('getEpochsInfo', async () => {
        return {
          getMetadata: () => ({
            getCoreChainLockedHeight: () => this.currentChainLockHeight,
          }),
          metadata: {
            getCoreChainLockedHeight: () => this.currentChainLockHeight,
            coreChainLockedHeight: this.currentChainLockHeight,
          },
        };
      });
    },
  };

  /**
   * Execute a method with failure injection
   */
  private async executeMethod<T>(
    method: string,
    implementation: () => Promise<T>
  ): Promise<T> {
    this.incrementCallCount(method);

    // Check if we should inject a failure
    const rule = this.shouldInjectFailure(method);
    if (rule) {
      throw await this.createError(rule);
    }

    // Execute actual implementation
    return implementation();
  }

  /**
   * Increment call count
   */
  private incrementCallCount(method: string): void {
    const callCount = (this.callCounts.get(method) || 0) + 1;
    this.callCounts.set(method, callCount);
  }

  /**
   * Determine if we should inject a failure
   */
  private shouldInjectFailure(method: string): MockFailureRule | null {
    for (const rule of this.failureRules) {
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
        const failureKey = `${method}:${rule.failureType}`;
        const currentCount = this.failureCounts.get(failureKey) || 0;

        if (currentCount >= rule.count) {
          continue;
        }

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
    if (rule.delay) {
      await new Promise(resolve => setTimeout(resolve, rule.delay));
    }

    return this.createErrorSync(rule);
  }

  /**
   * Create an error synchronously
   */
  private createErrorSync(rule: MockFailureRule): Error {
    switch (rule.failureType) {
      case 'timeout':
        return new Error('Request timeout after 10000ms');

      case 'connection_refused':
        return Object.assign(new Error('connect ECONNREFUSED'), {
          code: 'ECONNREFUSED',
        });

      case 'stream_error':
        return new Error('Stream error occurred');

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
   * Configuration Methods
   */

  /**
   * Set blockchain status response
   */
  setBlockchainStatus(status: any): void {
    this.blockchainStatus = status;
  }

  /**
   * Set header stream messages
   */
  setHeaderStreamMessages(messages: any[]): void {
    this.headerStreamMessages = messages;
  }

  /**
   * Set transaction stream messages
   */
  setTransactionStreamMessages(messages: any[]): void {
    this.transactionStreamMessages = messages;
  }

  /**
   * Set stream emission delay (for testing async behavior)
   */
  setStreamDelay(delayMs: number): void {
    this.streamDelay = delayMs;
  }

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
  getCallCount(method: string): number {
    return this.callCounts.get(method) || 0;
  }

  /**
   * Get failure count for a specific method
   */
  getFailureCount(method: string, failureType: MockFailureType): number {
    return this.failureCounts.get(`${method}:${failureType}`) || 0;
  }

  /**
   * Reset to default responses
   */
  private setDefaultResponses(): void {
    this.blockchainStatus = {
      chain: { blocksCount: 2000000, headersCount: 2000000 },
    };
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

  /**
   * Queue a stream message dynamically (for realtime testing)
   */
  queueStreamMessage(message: any): void {
    this.transactionStreamMessages.push(message);
  }

  /**
   * Queue a stream error dynamically (for realtime testing)
   */
  queueStreamError(error: Error): void {
    // Add failure rule for next stream call
    this.injectFailure({
      method: 'subscribeToTransactionsWithProofs',
      failureType: 'stream_error',
      count: 1,
    });
  }

  /**
   * Update the ChainLock height (triggers ChainLock monitor)
   */
  emitChainLock(height: number): void {
    this.currentChainLockHeight = height;
  }

  /**
   * Set ChainLock stream error (for failure testing)
   */
  setChainLockStreamError(error: Error): void {
    this.injectFailure({
      method: 'getEpochsInfo',
      failureType: 'platform_error',
      count: 1,
    });
  }

  /**
   * Set current block height
   */
  setBlockHeight(height: number): void {
    this.currentBlockHeight = height;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.clearFailures();
    this.clearCallCounts();
    this.setDefaultResponses();
    this.headerStreamMessages = [];
    this.transactionStreamMessages = [];
    this.streamDelay = 0;
    this.currentChainLockHeight = 100;
    this.currentBlockHeight = 1000;
  }
}

/**
 * Common failure scenarios for testing
 */
export const MockFailureScenarios = {
  transientTimeout: (method: string, count: number = 2): MockFailureRule => ({
    method,
    failureType: 'timeout',
    count,
  }),

  persistentTimeout: (method: string): MockFailureRule => ({
    method,
    failureType: 'timeout',
  }),

  streamError: (method: string, count?: number): MockFailureRule => ({
    method,
    failureType: 'stream_error',
    count,
  }),

  connectionRefused: (method?: string, count?: number): MockFailureRule => ({
    method,
    failureType: 'connection_refused',
    count,
  }),
};

/**
 * Factory function to create mock DAPI client
 */
export function createMockDAPIClient(): ControllableMockDAPIClient {
  return new ControllableMockDAPIClient();
}

/**
 * Helper to create stream messages for testing
 */
export class MockStreamBuilder {
  private messages: any[] = [];

  addBlockHeaders(headers: Buffer[]): this {
    this.messages.push(new MockBlockHeadersMessage(headers));
    return this;
  }

  addTransactions(transactions: Buffer[]): this {
    this.messages.push(new MockRawTransactionsMessage(transactions));
    return this;
  }

  addMerkleBlock(merkleBlock: Buffer): this {
    this.messages.push(new MockRawMerkleBlockMessage(merkleBlock));
    return this;
  }

  addInstantLock(instantLock: Buffer): this {
    this.messages.push(new MockInstantSendLockMessage(instantLock));
    return this;
  }

  addChainLock(chainLock: Buffer): this {
    this.messages.push(new MockChainLockMessage(chainLock));
    return this;
  }

  build(): any[] {
    return this.messages;
  }
}

// Export message classes for testing
export {
  MockBlockHeadersMessage,
  MockRawTransactionsMessage,
  MockRawMerkleBlockMessage,
  MockInstantSendLockMessage,
  MockChainLockMessage,
  MockStream,
};
