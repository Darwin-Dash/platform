/**
 * Test Fixtures and Helpers
 *
 * Common test data builders and scenario generators for transaction-finder tests
 */

import dashcore from '@dashevo/dashcore-lib';
const { Transaction, BlockHeader, MerkleBlock } = dashcore;
import { TESTNET_ADDRESSES } from '../fixtures/addresses.js';
import {
  MockDataBuilder,
  MockStreamBuilder,
  ControllableMockDAPIClient,
} from './ControllableMockDAPIClient.js';

/**
 * Convenience functions for creating mock data
 */

/**
 * Create a mock transaction with specified outputs
 * If no txid is provided, a random one is generated
 */
export function createMockTransaction(options: {
  txid?: string;
  outputs: Array<{ address: string; satoshis: number }>;
}): any {
  const txid = options.txid || Buffer.from(Math.random().toString()).toString('hex').padStart(64, '0').slice(0, 64);
  return MockDataBuilder.createTransaction(txid, options.outputs);
}

/**
 * Create a mock merkle block
 */
export function createMockMerkleBlock(options: {
  txids: string[];
  blockHeight: number;
  time?: number;
}): any {
  return MockDataBuilder.createMerkleBlock(
    options.blockHeight,
    options.txids,
    options.time || Date.now() / 1000
  );
}

/**
 * Create a mock InstantLock
 */
export function createMockInstantLock(txid: string, height: number = 1000): any {
  return MockDataBuilder.createInstantLock(txid, height);
}

/**
 * Create a mock ChainLock
 */
export function createMockChainLock(height: number, blockHash?: string): any {
  const hash = blockHash || Buffer.from(Math.random().toString()).toString('hex').padStart(64, '0').slice(0, 64);
  return MockDataBuilder.createChainLock(height, hash);
}

/**
 * Common test addresses (from existing fixtures)
 */
export const TEST_ADDRESSES = {
  address1: TESTNET_ADDRESSES.address1,
  address2: TESTNET_ADDRESSES.address2,
  address3: TESTNET_ADDRESSES.address3,
};

/**
 * Test scenario generators
 */
export class TestScenarios {
  /**
   * Create a simple historic sync scenario
   * - 3 blocks with headers
   * - 2 transactions across those blocks
   * - 1 InstantLock
   * - 1 ChainLock
   */
  static createSimpleHistoricSync(client: ControllableMockDAPIClient): {
    fromHeight: number;
    toHeight: number;
    expectedTxids: string[];
  } {
    const fromHeight = 1000;
    const toHeight = 1002;

    // Create headers for blocks 1000-1002
    const headerBuilder = new MockStreamBuilder();
    const headers: Buffer[] = [];

    for (let i = fromHeight; i <= toHeight; i++) {
      const header = MockDataBuilder.createBlockHeader(i, 1609459200 + i);
      headers.push(header.toBuffer());
    }

    headerBuilder.addBlockHeaders(headers);
    client.setHeaderStreamMessages(headerBuilder.build());

    // Create transaction stream with transactions and merkle blocks
    const tx1 = MockDataBuilder.createTransaction(
      '1111111111111111111111111111111111111111111111111111111111111111',
      [
        { address: TEST_ADDRESSES.address1, satoshis: 100000 },
        { address: TEST_ADDRESSES.address2, satoshis: 50000 },
      ]
    );

    const tx2 = MockDataBuilder.createTransaction(
      '2222222222222222222222222222222222222222222222222222222222222222',
      [{ address: TEST_ADDRESSES.address1, satoshis: 200000 }]
    );

    const merkleBlock1 = MockDataBuilder.createMerkleBlock(
      1000,
      [tx1.hash],
      1609459200 + 1000
    );

    const merkleBlock2 = MockDataBuilder.createMerkleBlock(
      1001,
      [tx2.hash],
      1609459200 + 1001
    );

    const txBuilder = new MockStreamBuilder();
    txBuilder
      .addTransactions([tx1.toBuffer()])
      .addMerkleBlock(merkleBlock1.toBuffer())
      .addTransactions([tx2.toBuffer()])
      .addMerkleBlock(merkleBlock2.toBuffer());

    client.setTransactionStreamMessages(txBuilder.build());

    return {
      fromHeight,
      toHeight,
      expectedTxids: [tx1.hash, tx2.hash],
    };
  }

  /**
   * Create a realtime monitoring scenario
   * - Incoming transactions
   * - InstantLock confirmations
   * - ChainLock confirmations
   */
  static createRealtimeMonitoring(client: ControllableMockDAPIClient): {
    expectedTxid: string;
  } {
    const tx = MockDataBuilder.createTransaction(
      '3333333333333333333333333333333333333333333333333333333333333333',
      [{ address: TEST_ADDRESSES.address1, satoshis: 150000 }]
    );

    // Note: For realtime, we'd typically set up the stream to emit events
    // This is just the setup - actual emission happens in the test
    const txBuilder = new MockStreamBuilder();
    txBuilder.addTransactions([tx.toBuffer()]);

    client.setTransactionStreamMessages(txBuilder.build());

    return {
      expectedTxid: tx.hash,
    };
  }

  /**
   * Create a multi-block scenario with many transactions
   * Useful for performance testing
   */
  static createLargeSync(
    client: ControllableMockDAPIClient,
    blockCount: number = 100,
    txPerBlock: number = 5
  ): {
    fromHeight: number;
    toHeight: number;
    expectedTxCount: number;
  } {
    const fromHeight = 1000;
    const toHeight = fromHeight + blockCount - 1;

    // Create headers
    const headerBuilder = new MockStreamBuilder();
    const headers: Buffer[] = [];

    for (let i = fromHeight; i <= toHeight; i++) {
      const header = MockDataBuilder.createBlockHeader(i, 1609459200 + i);
      headers.push(header.toBuffer());
    }

    headerBuilder.addBlockHeaders(headers);
    client.setHeaderStreamMessages(headerBuilder.build());

    // Create transactions
    const txBuilder = new MockStreamBuilder();
    let txCount = 0;

    for (let blockHeight = fromHeight; blockHeight <= toHeight; blockHeight++) {
      const txids: string[] = [];

      // Create transactions for this block
      for (let txIndex = 0; txIndex < txPerBlock; txIndex++) {
        const txid = `${blockHeight.toString(16).padStart(8, '0')}${txIndex.toString(16).padStart(56, '0')}`;
        const tx = MockDataBuilder.createTransaction(txid, [
          {
            address: TEST_ADDRESSES.address1,
            satoshis: 10000 + txIndex * 1000,
          },
        ]);

        txBuilder.addTransactions([tx.toBuffer()]);
        txids.push(tx.hash);
        txCount++;
      }

      // Create merkle block for this block
      const merkleBlock = MockDataBuilder.createMerkleBlock(
        blockHeight,
        txids,
        1609459200 + blockHeight
      );

      txBuilder.addMerkleBlock(merkleBlock.toBuffer());
    }

    client.setTransactionStreamMessages(txBuilder.build());

    return {
      fromHeight,
      toHeight,
      expectedTxCount: txCount,
    };
  }

  /**
   * Create a scenario with stream errors
   */
  static createErrorScenario(
    client: ControllableMockDAPIClient,
    errorType: 'timeout' | 'connection_refused' | 'stream_error' = 'timeout'
  ): void {
    client.injectFailure({
      method: 'subscribeToTransactionsWithProofs',
      failureType: errorType,
      count: 1, // Fail once, then succeed
    });

    // Set up recovery data (after retry)
    const tx = MockDataBuilder.createTransaction(
      '4444444444444444444444444444444444444444444444444444444444444444',
      [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
    );

    const txBuilder = new MockStreamBuilder();
    txBuilder.addTransactions([tx.toBuffer()]);
    client.setTransactionStreamMessages(txBuilder.build());
  }

  /**
   * Create a scenario with out-of-order events
   * (ChainLock arrives before InstantLock)
   */
  static createOutOfOrderEvents(client: ControllableMockDAPIClient): {
    txid: string;
    blockHeight: number;
  } {
    const blockHeight = 1000;
    const txid = '5555555555555555555555555555555555555555555555555555555555555555';

    const tx = MockDataBuilder.createTransaction(txid, [
      { address: TEST_ADDRESSES.address1, satoshis: 100000 },
    ]);

    const merkleBlock = MockDataBuilder.createMerkleBlock(
      blockHeight,
      [tx.hash],
      1609459200 + blockHeight
    );

    // First: transaction and merkle block
    // Second: ChainLock (before InstantLock - testing out-of-order handling)
    const header = MockDataBuilder.createBlockHeader(blockHeight, 1609459200 + blockHeight);
    const chainLock = MockDataBuilder.createChainLock(blockHeight, header.hash);

    // Third: InstantLock (arrives late)
    const instantLock = MockDataBuilder.createInstantLock(tx.hash, blockHeight);

    const txBuilder = new MockStreamBuilder();
    txBuilder
      .addTransactions([tx.toBuffer()])
      .addMerkleBlock(merkleBlock.toBuffer())
      .addChainLock(Buffer.from(JSON.stringify(chainLock)))
      .addInstantLock(Buffer.from(JSON.stringify(instantLock)));

    client.setTransactionStreamMessages(txBuilder.build());

    return { txid: tx.hash, blockHeight };
  }
}

/**
 * Assertion helpers for tests
 */
export class TestAssertions {
  /**
   * Assert that a transaction has expected metadata
   */
  static assertTransactionMetadata(
    tx: any,
    expected: {
      txid?: string;
      height?: number;
      blockHash?: string;
      blockTime?: number;
      instantLocked?: boolean;
      chainLocked?: boolean;
    }
  ): void {
    if (expected.txid) {
      if (tx.txid !== expected.txid && tx.hash !== expected.txid) {
        throw new Error(
          `Expected txid ${expected.txid}, got ${tx.txid || tx.hash}`
        );
      }
    }

    if (expected.height !== undefined && tx.height !== expected.height) {
      throw new Error(`Expected height ${expected.height}, got ${tx.height}`);
    }

    if (expected.blockHash && tx.blockHash !== expected.blockHash) {
      throw new Error(
        `Expected blockHash ${expected.blockHash}, got ${tx.blockHash}`
      );
    }

    if (expected.blockTime !== undefined && tx.blockTime !== expected.blockTime) {
      throw new Error(
        `Expected blockTime ${expected.blockTime}, got ${tx.blockTime}`
      );
    }

    if (expected.instantLocked !== undefined && tx.instantLocked !== expected.instantLocked) {
      throw new Error(
        `Expected instantLocked ${expected.instantLocked}, got ${tx.instantLocked}`
      );
    }

    if (expected.chainLocked !== undefined && tx.chainLocked !== expected.chainLocked) {
      throw new Error(
        `Expected chainLocked ${expected.chainLocked}, got ${tx.chainLocked}`
      );
    }
  }

  /**
   * Assert that UTXO has expected properties
   */
  static assertUTXO(
    utxo: any,
    expected: {
      address?: string;
      satoshis?: number;
      txid?: string;
      outputIndex?: number;
    }
  ): void {
    if (expected.address && utxo.address !== expected.address) {
      throw new Error(
        `Expected address ${expected.address}, got ${utxo.address}`
      );
    }

    if (expected.satoshis !== undefined && utxo.satoshis !== expected.satoshis) {
      throw new Error(
        `Expected satoshis ${expected.satoshis}, got ${utxo.satoshis}`
      );
    }

    if (expected.txid && utxo.txid !== expected.txid) {
      throw new Error(`Expected txid ${expected.txid}, got ${utxo.txid}`);
    }

    if (expected.outputIndex !== undefined && utxo.outputIndex !== expected.outputIndex) {
      throw new Error(
        `Expected outputIndex ${expected.outputIndex}, got ${utxo.outputIndex}`
      );
    }
  }
}

/**
 * Wait utilities for async testing
 */
export class TestWaiters {
  /**
   * Wait for a condition to be true
   */
  static async waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeoutMs: number = 5000,
    checkIntervalMs: number = 100
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const result = await condition();
      if (result) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }

    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }

  /**
   * Wait for an event to be emitted
   */
  static async waitForEvent(
    emitter: any,
    eventName: string,
    timeoutMs: number = 5000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Event '${eventName}' not emitted within ${timeoutMs}ms`));
      }, timeoutMs);

      emitter.once(eventName, (data: any) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  }

  /**
   * Wait for multiple events
   */
  static async waitForEvents(
    emitter: any,
    eventName: string,
    count: number,
    timeoutMs: number = 5000
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const events: any[] = [];
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Only received ${events.length}/${count} '${eventName}' events within ${timeoutMs}ms`
          )
        );
      }, timeoutMs);

      const handler = (data: any) => {
        events.push(data);

        if (events.length >= count) {
          clearTimeout(timeout);
          emitter.off(eventName, handler);
          resolve(events);
        }
      };

      emitter.on(eventName, handler);
    });
  }

  /**
   * Wait for a specific amount of time
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Mock chain state builder for complex scenarios
 */
export class ChainStateBuilder {
  private blocks: Map<number, { header: any; transactions: any[] }> = new Map();
  private currentHeight: number = 1000;

  /**
   * Add a block with transactions
   */
  addBlock(transactions: any[]): this {
    const height = this.currentHeight++;
    const header = MockDataBuilder.createBlockHeader(height, 1609459200 + height);

    this.blocks.set(height, { header, transactions });
    return this;
  }

  /**
   * Build the mock client with this chain state
   */
  build(client: ControllableMockDAPIClient): {
    fromHeight: number;
    toHeight: number;
    expectedTxCount: number;
  } {
    const fromHeight = Math.min(...this.blocks.keys());
    const toHeight = Math.max(...this.blocks.keys());

    // Build header stream
    const headerBuilder = new MockStreamBuilder();
    const headers: Buffer[] = [];

    for (let i = fromHeight; i <= toHeight; i++) {
      const block = this.blocks.get(i);
      if (block) {
        headers.push(block.header.toBuffer());
      }
    }

    headerBuilder.addBlockHeaders(headers);
    client.setHeaderStreamMessages(headerBuilder.build());

    // Build transaction stream
    const txBuilder = new MockStreamBuilder();
    let txCount = 0;

    for (let i = fromHeight; i <= toHeight; i++) {
      const block = this.blocks.get(i);
      if (block && block.transactions.length > 0) {
        // Add transactions
        const txBuffers = block.transactions.map(tx => tx.toBuffer());
        txBuilder.addTransactions(txBuffers);

        // Add merkle block
        const txids = block.transactions.map(tx => tx.hash);
        const merkleBlock = MockDataBuilder.createMerkleBlock(
          i,
          txids,
          block.header.time
        );
        txBuilder.addMerkleBlock(merkleBlock.toBuffer());

        txCount += block.transactions.length;
      }
    }

    client.setTransactionStreamMessages(txBuilder.build());

    return { fromHeight, toHeight, expectedTxCount: txCount };
  }
}
