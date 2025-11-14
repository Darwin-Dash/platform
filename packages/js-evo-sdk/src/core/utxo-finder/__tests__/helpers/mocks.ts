/**
 * Mock implementations for testing
 * Matches real DAPI protobuf response structure for accurate testing
 */

import { vi } from 'vitest';
import { Transaction, BlockHeader, MerkleBlock } from '@dashevo/dashcore-lib';

/**
 * Protobuf-style wrapper for raw transactions
 * Matches real DAPI RawTransactions protobuf message structure
 */
class MockRawTransactions {
  private transactions: any[];

  constructor(transactions: any[]) {
    this.transactions = transactions;
  }

  getTransactionsList() {
    return this.transactions;
  }
}

/**
 * Protobuf-style wrapper for block headers
 * Matches real DAPI BlockHeaders protobuf message structure
 */
class MockBlockHeaders {
  private headers: any[];

  constructor(headers: any[]) {
    this.headers = headers;
  }

  getHeadersList() {
    return this.headers;
  }
}

/**
 * Protobuf-style stream message
 * Matches real DAPI TransactionsWithProofsResponse structure
 */
class MockStreamMessage {
  private rawTransactions: any[] | null;
  private rawMerkleBlock: Buffer | null;
  private instantSendLockMessages: any[] | null;
  private chainLockMessages: any[] | null;

  constructor(data: {
    rawTransactions?: any[];
    rawMerkleBlock?: Buffer;
    instantSendLockMessages?: any[];
    chainLockMessages?: any[];
  }) {
    this.rawTransactions = data.rawTransactions || null;
    this.rawMerkleBlock = data.rawMerkleBlock || null;
    this.instantSendLockMessages = data.instantSendLockMessages || null;
    this.chainLockMessages = data.chainLockMessages || null;
  }

  // Protobuf getter methods (matches real DAPI)
  getRawTransactions() {
    return this.rawTransactions ? new MockRawTransactions(this.rawTransactions) : null;
  }

  getRawMerkleBlock() {
    return this.rawMerkleBlock;
  }

  getInstantSendLockMessages() {
    return this.instantSendLockMessages;
  }

  getChainLockMessages() {
    return this.chainLockMessages;
  }
}

/**
 * Protobuf-style header stream message
 * Matches real DAPI BlockHeadersWithChainLocksResponse structure
 */
class MockHeaderStreamMessage {
  private headers: any[];

  constructor(headers: any[]) {
    this.headers = headers;
  }

  getBlockHeaders() {
    return new MockBlockHeaders(this.headers);
  }
}

/**
 * Create a mock stream that implements EventEmitter-like interface
 * for compatibility with StreamWrapper
 */
function createMockStream(data: any[] = []) {
  const listeners: { [key: string]: Function[] } = {
    data: [],
    end: [],
    error: [],
  };

  return {
    on(event: string, handler: Function) {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(handler);
      return this;
    },

    removeListener(event: string, handler: Function) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler);
      }
      return this;
    },

    // Add listeners getter for error handling
    listeners(event: string) {
      return listeners[event] || [];
    },

    async _emitData() {
      // Emit all data items
      for (const item of data) {
        for (const handler of listeners['data']) {
          handler(item);
        }
      }
      // Then emit end
      for (const handler of listeners['end']) {
        handler();
      }
    },

    async _emitError(error: Error) {
      // Emit error
      for (const handler of listeners['error']) {
        handler(error);
      }
    },
  };
}

/**
 * Mock DAPI Client for testing
 * Simulates ResilientDAPIClient interface with synchronous core property
 */
export class MockDAPIClient {
  private blockHeight: number = 1000;
  private shouldFail: boolean = false;
  private failureMessage: string = 'Network error';

  // ResilientDAPIClient provides synchronous access to core namespace
  public readonly core: any;

  constructor(blockHeight?: number, shouldFail?: boolean) {
    if (blockHeight !== undefined) {
      this.blockHeight = blockHeight;
    }
    if (shouldFail !== undefined) {
      this.shouldFail = shouldFail;
    }

    // Initialize core namespace synchronously (matches ResilientDAPIClient)
    const self = this;
    this.core = {
      getStatus: async () => {
        if (self.shouldFail) {
          throw new Error(self.failureMessage);
        }
        return {
          chain: { blocksCount: self.blockHeight },
        };
      },

      getBlockByHash: async (hash: string) => {
        if (self.shouldFail) {
          throw new Error(self.failureMessage);
        }
        return {
          height: self.blockHeight - 1,
        };
      },

      getBlockchainStatus: async () => {
        if (self.shouldFail) {
          throw new Error(self.failureMessage);
        }
        return {
          chain: { blocksCount: self.blockHeight },
        };
      },

      subscribeToTransactionsWithProofs: (bloomFilter: Buffer, options?: any) => {
        if (self.shouldFail) {
          const stream = createMockStream([]);
          // Emit error on stream instead of throwing
          setImmediate(() => (stream as any)._emitError(new Error(self.failureMessage)));
          return stream;
        }
        // Return protobuf-style message (matches real DAPI)
        const message = new MockStreamMessage({
          rawTransactions: [],
          rawMerkleBlock: null
        });
        const stream = createMockStream([message]);
        // Emit data asynchronously
        setImmediate(() => (stream as any)._emitData());
        return stream;
      },

      subscribeToBlockHeadersWithChainLocks: (options?: any) => {
        if (self.shouldFail) {
          const stream = createMockStream([]);
          // Emit error on stream instead of throwing
          setImmediate(() => (stream as any)._emitError(new Error(self.failureMessage)));
          return stream;
        }
        // Mock header stream (empty by default)
        const message = new MockHeaderStreamMessage([]);
        const stream = createMockStream([message]);
        setImmediate(() => (stream as any)._emitData());
        return stream;
      },
    };
  }

  setBlockHeight(height: number): void {
    this.blockHeight = height;
  }

  setShouldFail(fail: boolean, message?: string): void {
    this.shouldFail = fail;
    if (message) {
      this.failureMessage = message;
    }
  }

  getBlockHeight(): number {
    return this.blockHeight;
  }
}

/**
 * Mock DAPI client with transaction stream
 * Yields mock transactions matching filter
 */
export class MockDAPIClientWithTransactions extends MockDAPIClient {
  private mockTransactions: any[] = [];

  constructor(transactions: any[] = []) {
    super(1000, false); // Pass default values to parent
    this.mockTransactions = transactions;

    // Override core namespace with transaction-aware implementation
    const self = this;
    const blockHeight = this.getBlockHeight();

    this.core = {
      getStatus: async () => ({
        chain: { blocksCount: blockHeight },
      }),

      getBlockByHash: async (hash: string) => ({
        height: blockHeight - 1,
      }),

      getBlockchainStatus: async () => ({
        chain: { blocksCount: blockHeight },
      }),

      subscribeToTransactionsWithProofs: (bloomFilter: Buffer, options?: any) => {
        // Create protobuf-style stream messages from transactions
        // Pattern: Transactions and merkle blocks in SEPARATE messages (like real DAPI)
        const streamMessages: MockStreamMessage[] = [];

        self.mockTransactions.forEach((txBuffer, index) => {
          // Parse transaction to get hash for merkle block
          const tx = new Transaction(Buffer.from(txBuffer));

          // Message 1: Transaction buffer (raw serialized data)
          streamMessages.push(new MockStreamMessage({
            rawTransactions: [txBuffer],
            rawMerkleBlock: null
          }));

          // Message 2: Realistic merkle block with proper structure
          const header = BlockHeader.fromObject({
            version: 1,
            prevHash: 'a'.repeat(64),
            merkleRoot: 'b'.repeat(64),
            time: Math.floor(Date.now() / 1000),
            bits: 0x1d00ffff,
            nonce: index,
          });

          const merkleBlock = MerkleBlock.fromObject({
            header: header.toObject(),
            numTransactions: 1,
            hashes: [tx.hash],
            flags: [1],
          });

          streamMessages.push(new MockStreamMessage({
            rawTransactions: null,
            rawMerkleBlock: merkleBlock.toBuffer()
          }));
        });

        const stream = createMockStream(streamMessages);
        // Emit data asynchronously
        setImmediate(() => (stream as any)._emitData());
        return stream;
      },

      subscribeToBlockHeadersWithChainLocks: (options?: any) => {
        // Mock header stream with proper protobuf structure
        const headerBuffers: Buffer[] = [];
        // Create mock headers for requested range
        const fromHeight = options?.fromBlockHeight || 1;
        const count = options?.count || 0;

        for (let i = 0; i < count && i < 100; i++) {
          // Create realistic 80-byte header buffer
          const header = BlockHeader.fromObject({
            version: 1,
            prevHash: 'a'.repeat(64),
            merkleRoot: 'b'.repeat(64),
            time: 1234567890 + i * 600,  // 10 min per block
            bits: 0x1d00ffff,
            nonce: fromHeight + i,
          });

          headerBuffers.push(header.toBuffer());  // ✅ Proper 80-byte header
        }

        const message = new MockHeaderStreamMessage(headerBuffers);
        const stream = createMockStream([message]);
        setImmediate(() => (stream as any)._emitData());
        return stream;
      },
    };
  }

  setMockTransactions(transactions: any[]): void {
    this.mockTransactions = transactions;
  }
}

/**
 * Create a mock transaction as raw buffer (matches DAPI format)
 * Returns serialized transaction buffer that can be parsed by dashcore-lib
 */
export function createMockTransaction(
  txId: string,
  outputs: Array<{ satoshis: number; address: string }>,
  height: number = 500,
  isChainLocked: boolean = true
): Buffer {
  // Create a real Transaction object using dashcore-lib
  const tx = new Transaction();

  // Add a dummy input (required for valid transaction)
  tx.from({
    txId: 'a'.repeat(64),
    outputIndex: 0,
    script: '76a914' + 'b'.repeat(40) + '88ac',
    satoshis: outputs.reduce((sum, o) => sum + o.satoshis, 0) + 10000,
  });

  // Add outputs
  outputs.forEach(({ satoshis, address }) => {
    tx.to(address, satoshis);
  });

  // Serialize to buffer (this is what DAPI returns)
  return tx.toBuffer();
}

/**
 * Create a mock spending transaction as raw buffer
 * Returns serialized transaction buffer that can be parsed by dashcore-lib
 */
export function createMockSpendingTransaction(
  txId: string,
  inputs: Array<{ prevTxId: string; outputIndex: number }>,
  outputs: Array<{ satoshis: number; address: string }>,
  height: number = 500
): Buffer {
  const tx = new Transaction();

  // Add inputs
  inputs.forEach(({ prevTxId, outputIndex }) => {
    // Ensure prevTxId is valid 64-char hex (dashcore-lib requirement)
    const validPrevTxId = prevTxId.length === 64 ? prevTxId : prevTxId.padEnd(64, '0');

    tx.from({
      txId: validPrevTxId,
      outputIndex,
      script: '76a914' + 'b'.repeat(40) + '88ac',
      satoshis: 100000,
    });
  });

  // Add outputs
  outputs.forEach(({ satoshis, address }) => {
    tx.to(address, satoshis);
  });

  return tx.toBuffer();
}

/**
 * Create mock address data
 */
export function createMockAddressData(
  address: string,
  path: string = "m/44'/1'/0'/0/0",
  privateKey: string = 'mock-private-key'
) {
  return {
    address,
    path,
    privateKey,
    publicKey: 'mock-public-key',
  };
}

/**
 * Spy function helper
 */
export function createSpyFunction<T extends (...args: any[]) => any>(
  implementation: T
): { spy: ReturnType<typeof vi.fn>; fn: T } {
  const spy = vi.fn(implementation);
  return { spy, fn: spy as T };
}

/**
 * Async spy function helper
 */
export function createAsyncSpyFunction<T extends (...args: any[]) => Promise<any>>(
  implementation: T
): { spy: ReturnType<typeof vi.fn>; fn: T } {
  const spy = vi.fn(implementation);
  return { spy, fn: spy as T };
}

/**
 * Wrap a transaction buffer into TransactionWithMetadata format
 * Used for tests that need the TransactionWithMetadata structure
 */
export function wrapTransactionWithMetadata(
  txBuffer: Buffer,
  metadata?: {
    height: number;
    time?: Date;
    blockHash?: string;
    isChainLocked?: boolean;
    isInstantLocked?: boolean;
  }
): { tx: any; metadata: any } {
  const tx = new Transaction(txBuffer);

  return {
    tx,
    metadata: metadata ? {
      height: metadata.height,
      time: metadata.time || new Date(),
      blockHash: metadata.blockHash || `blockhash${metadata.height}`,
      isChainLocked: metadata.isChainLocked || false,
      isInstantLocked: metadata.isInstantLocked || false,
    } : null,
  };
}

/**
 * Export protobuf wrapper classes for advanced testing
 */
export { MockStreamMessage, MockHeaderStreamMessage, MockRawTransactions, MockBlockHeaders };
