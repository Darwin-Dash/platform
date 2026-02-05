/**
 * Isolated ChainLock Integration Tests
 *
 * Tests ChainLock detection independently from InstantSend.
 * These tests verify that ChainLock functionality works correctly
 * without relying on InstantLock events.
 *
 * Key scenarios tested:
 * - ChainLock detection without InstantLock
 * - ChainLock height progression across multiple transactions
 * - ChainLock latency calculation
 * - ChainLock event shape verification
 *
 * IMPORTANT: ChainLock detection requires:
 * 1. Transaction is in the tracker (via stream)
 * 2. Block height is recorded (via MerkleBlock)
 * 3. ChainLock height covers the block height (via emitChainLock)
 * 4. ChainLockHeightMonitor polls and detects the ChainLock (every 5 seconds)
 *
 * Test pattern:
 * 1. Set up stream with transactions and MerkleBlocks
 * 2. Call monitorAddresses() to start processing
 * 3. Wait for stream to be processed (~150ms)
 * 4. Emit ChainLock height
 * 5. Wait for ChainLock poll (~6000ms)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RealtimeFinder } from '../../src/finders/RealtimeFinder.js';
import { FinderMode } from '../../src/types/index.js';
import type { ChainLockEvent, TransactionEvent, BlockInclusionEvent } from '../../src/types/index.js';
import {
  ControllableMockDAPIClient,
  MockDataBuilder,
  MockStreamBuilder,
} from '../helpers/ControllableMockDAPIClient.js';
import { TEST_ADDRESSES } from '../helpers/test-fixtures.js';

// Time to wait for stream to be processed
const STREAM_PROCESS_WAIT = 200;
// ChainLock monitor polls every 5 seconds, so we need 6s+ wait time
const CHAINLOCK_POLL_WAIT = 6000;
// Test timeout should account for poll wait plus setup/teardown
const SINGLE_POLL_TIMEOUT = 10000;
const MULTI_POLL_TIMEOUT = 30000; // For tests with multiple ChainLock emissions

describe('Isolated ChainLock Integration Tests', () => {
  let mockDAPIClient: ControllableMockDAPIClient;
  let finder: RealtimeFinder;

  beforeEach(() => {
    mockDAPIClient = new ControllableMockDAPIClient();
  });

  afterEach(() => {
    if (finder) {
      finder.stop();
    }
  });

  describe('ChainLock Detection Without InstantLock', () => {
    it('should detect ChainLock without prior InstantLock', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const events: {
        transactions: TransactionEvent[];
        chainLocks: ChainLockEvent[];
        blockInclusions: BlockInclusionEvent[];
      } = {
        transactions: [],
        chainLocks: [],
        blockInclusions: [],
      };

      // Create transaction
      const tx = MockDataBuilder.createTransaction(
        'aaaa111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      // Create MerkleBlock for block inclusion (height gets incremented from currentBlockHeight)
      // RealtimeFinder increments height on each MerkleBlock
      const merkleBlock = MockDataBuilder.createMerkleBlock(1001, [tx.hash], 1609459200);

      // Build stream: transaction → merkle block (NO InstantLock)
      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      // Start monitoring (ChainLock height is 100 by default, no ChainLock yet)
      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onTransaction: (txEvent) => events.transactions.push(txEvent),
        onChainLock: (cl) => events.chainLocks.push(cl),
        onBlockInclusion: (block) => events.blockInclusions.push(block),
      });

      // Wait for stream to be processed
      await new Promise((resolve) => setTimeout(resolve, STREAM_PROCESS_WAIT));

      // Verify transaction was detected
      expect(events.transactions.length).toBe(1);
      expect(events.transactions[0].txid).toBe(tx.hash);

      // Verify block inclusion was detected
      expect(events.blockInclusions.length).toBe(1);
      expect(events.blockInclusions[0].txid).toBe(tx.hash);

      // NOW emit ChainLock at height that covers the block
      // RealtimeFinder increments from currentBlockHeight (1000) to 1001 on first MerkleBlock
      mockDAPIClient.emitChainLock(1001);

      // Wait for ChainLock poll
      await new Promise((resolve) => setTimeout(resolve, CHAINLOCK_POLL_WAIT));

      // Verify ChainLock was detected
      expect(events.chainLocks.length).toBe(1);
      expect(events.chainLocks[0].txid).toBe(tx.hash);
      expect(events.chainLocks[0].chainLockedHeight).toBe(1001);

      // Verify transaction status is 'chainlocked'
      const trackedTx = finder.getTransaction(tx.hash);
      expect(trackedTx).toBeDefined();
      expect(trackedTx?.status).toBe('chainlocked');
    }, SINGLE_POLL_TIMEOUT);

    it('should transition directly from pending to chainlocked (skipping instantlocked)', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const statusTransitions: string[] = [];

      const tx = MockDataBuilder.createTransaction(
        'bbbb222222222222222222222222222222222222222222222222222222222222',
        [{ address: TEST_ADDRESSES.address1, satoshis: 200000 }]
      );

      const merkleBlock = MockDataBuilder.createMerkleBlock(1001, [tx.hash], 1609459300);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onTransaction: () => {
          const tracked = finder.getTransaction(tx.hash);
          if (tracked) statusTransitions.push(tracked.status);
        },
        onBlockInclusion: () => {
          const tracked = finder.getTransaction(tx.hash);
          if (tracked) statusTransitions.push(tracked.status);
        },
        onChainLock: () => {
          const tracked = finder.getTransaction(tx.hash);
          if (tracked) statusTransitions.push(tracked.status);
        },
      });

      // Wait for stream to be processed
      await new Promise((resolve) => setTimeout(resolve, STREAM_PROCESS_WAIT));

      // Emit ChainLock AFTER stream is processed
      mockDAPIClient.emitChainLock(1001);

      await new Promise((resolve) => setTimeout(resolve, CHAINLOCK_POLL_WAIT));

      // Final status should be chainlocked
      const trackedTx = finder.getTransaction(tx.hash);
      expect(trackedTx?.status).toBe('chainlocked');

      // Should NOT have gone through 'instantlocked' status
      expect(statusTransitions).not.toContain('instantlocked');
    }, SINGLE_POLL_TIMEOUT);
  });

  describe('ChainLock Height Progression', () => {
    it('should ChainLock transactions at confirmed heights only', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const chainLockEvents: ChainLockEvent[] = [];

      // Create transactions at different block heights
      const tx1 = MockDataBuilder.createTransaction(
        '1111000000000000000000000000000000000000000000000000000000000001',
        [{ address: TEST_ADDRESSES.address1, satoshis: 10000 }]
      );

      const tx2 = MockDataBuilder.createTransaction(
        '2222000000000000000000000000000000000000000000000000000000000002',
        [{ address: TEST_ADDRESSES.address1, satoshis: 20000 }]
      );

      const tx3 = MockDataBuilder.createTransaction(
        '3333000000000000000000000000000000000000000000000000000000000003',
        [{ address: TEST_ADDRESSES.address1, satoshis: 30000 }]
      );

      // MerkleBlocks at heights 1001, 1002, 1003 (RealtimeFinder increments from 1000)
      const merkle1 = MockDataBuilder.createMerkleBlock(1001, [tx1.hash], 1609459100);
      const merkle2 = MockDataBuilder.createMerkleBlock(1002, [tx2.hash], 1609459200);
      const merkle3 = MockDataBuilder.createMerkleBlock(1003, [tx3.hash], 1609459300);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx1.toBuffer()])
        .addMerkleBlock(merkle1.toBuffer())
        .addTransactions([tx2.toBuffer()])
        .addMerkleBlock(merkle2.toBuffer())
        .addTransactions([tx3.toBuffer()])
        .addMerkleBlock(merkle3.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onChainLock: (cl) => chainLockEvents.push(cl),
      });

      // Wait for stream to be processed
      await new Promise((resolve) => setTimeout(resolve, STREAM_PROCESS_WAIT));

      // Emit ChainLock at height 1001 (only confirms tx1)
      mockDAPIClient.emitChainLock(1001);
      await new Promise((resolve) => setTimeout(resolve, CHAINLOCK_POLL_WAIT));

      // Only tx1 should be ChainLocked
      expect(chainLockEvents.length).toBe(1);
      expect(chainLockEvents[0].txid).toBe(tx1.hash);

      expect(finder.getTransaction(tx1.hash)?.status).toBe('chainlocked');
      expect(finder.getTransaction(tx2.hash)?.status).toBe('pending');
      expect(finder.getTransaction(tx3.hash)?.status).toBe('pending');

      // Progress ChainLock to height 1002 (confirms tx2)
      mockDAPIClient.emitChainLock(1002);
      await new Promise((resolve) => setTimeout(resolve, CHAINLOCK_POLL_WAIT));

      expect(chainLockEvents.length).toBe(2);
      expect(chainLockEvents[1].txid).toBe(tx2.hash);

      expect(finder.getTransaction(tx2.hash)?.status).toBe('chainlocked');
      expect(finder.getTransaction(tx3.hash)?.status).toBe('pending');

      // Progress ChainLock to height 1003 (confirms tx3)
      mockDAPIClient.emitChainLock(1003);
      await new Promise((resolve) => setTimeout(resolve, CHAINLOCK_POLL_WAIT));

      expect(chainLockEvents.length).toBe(3);
      expect(chainLockEvents[2].txid).toBe(tx3.hash);

      expect(finder.getTransaction(tx3.hash)?.status).toBe('chainlocked');
    }, MULTI_POLL_TIMEOUT);

    it('should confirm multiple transactions at same height when ChainLock arrives', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const chainLockEvents: ChainLockEvent[] = [];

      // Create two transactions that will be in the same block
      const tx1 = MockDataBuilder.createTransaction(
        'aaaa000000000000000000000000000000000000000000000000000000000001',
        [{ address: TEST_ADDRESSES.address1, satoshis: 50000 }]
      );

      const tx2 = MockDataBuilder.createTransaction(
        'bbbb000000000000000000000000000000000000000000000000000000000002',
        [{ address: TEST_ADDRESSES.address1, satoshis: 60000 }]
      );

      // Both transactions in block 1001
      const merkleBlock = MockDataBuilder.createMerkleBlock(1001, [tx1.hash, tx2.hash], 1609459500);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx1.toBuffer(), tx2.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onChainLock: (cl) => chainLockEvents.push(cl),
      });

      // Wait for stream to be processed
      await new Promise((resolve) => setTimeout(resolve, STREAM_PROCESS_WAIT));

      // Emit ChainLock AFTER stream is processed
      mockDAPIClient.emitChainLock(1001);
      await new Promise((resolve) => setTimeout(resolve, CHAINLOCK_POLL_WAIT));

      // Both transactions should be ChainLocked
      expect(chainLockEvents.length).toBe(2);

      const chainLockedTxids = chainLockEvents.map((cl) => cl.txid);
      expect(chainLockedTxids).toContain(tx1.hash);
      expect(chainLockedTxids).toContain(tx2.hash);

      expect(finder.getTransaction(tx1.hash)?.status).toBe('chainlocked');
      expect(finder.getTransaction(tx2.hash)?.status).toBe('chainlocked');
    }, SINGLE_POLL_TIMEOUT);
  });

  describe('ChainLock Latency Calculation', () => {
    it('should calculate ChainLock latency from broadcast time', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      let chainLockEvent: ChainLockEvent | null = null;

      const tx = MockDataBuilder.createTransaction(
        'cccc333333333333333333333333333333333333333333333333333333333333',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const merkleBlock = MockDataBuilder.createMerkleBlock(1001, [tx.hash], 1609459800);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onChainLock: (cl) => {
          chainLockEvent = cl;
        },
      });

      // Wait for stream to be processed
      await new Promise((resolve) => setTimeout(resolve, STREAM_PROCESS_WAIT));

      // Emit ChainLock AFTER stream is processed
      mockDAPIClient.emitChainLock(1001);

      // Wait for ChainLock detection
      await new Promise((resolve) => setTimeout(resolve, CHAINLOCK_POLL_WAIT));

      expect(chainLockEvent).not.toBeNull();
      expect(chainLockEvent!.latency).toBeGreaterThanOrEqual(0);

      // Latency should be reasonable (not negative, not excessively large)
      expect(chainLockEvent!.latency).toBeLessThan(10000); // Less than 10 seconds
    }, SINGLE_POLL_TIMEOUT);

    it('should have timestamp close to actual ChainLock detection time', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      let chainLockEvent: ChainLockEvent | null = null;

      const tx = MockDataBuilder.createTransaction(
        'dddd444444444444444444444444444444444444444444444444444444444444',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const merkleBlock = MockDataBuilder.createMerkleBlock(1001, [tx.hash], 1609459900);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onChainLock: (cl) => {
          chainLockEvent = cl;
        },
      });

      // Wait for stream to be processed
      await new Promise((resolve) => setTimeout(resolve, STREAM_PROCESS_WAIT));

      const beforeTime = Date.now();

      // Emit ChainLock AFTER stream is processed
      mockDAPIClient.emitChainLock(1001);

      await new Promise((resolve) => setTimeout(resolve, CHAINLOCK_POLL_WAIT));

      const afterTime = Date.now();

      expect(chainLockEvent).not.toBeNull();
      expect(chainLockEvent!.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(chainLockEvent!.timestamp).toBeLessThanOrEqual(afterTime);
    }, SINGLE_POLL_TIMEOUT);
  });

  describe('ChainLock Event Shape Verification', () => {
    it('should have correct ChainLockEvent structure', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      let chainLockEvent: ChainLockEvent | null = null;

      const tx = MockDataBuilder.createTransaction(
        'eeee555555555555555555555555555555555555555555555555555555555555',
        [{ address: TEST_ADDRESSES.address1, satoshis: 150000 }]
      );

      const merkleBlock = MockDataBuilder.createMerkleBlock(1001, [tx.hash], 1609460000);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onChainLock: (cl) => {
          chainLockEvent = cl;
        },
      });

      // Wait for stream to be processed
      await new Promise((resolve) => setTimeout(resolve, STREAM_PROCESS_WAIT));

      // Emit ChainLock AFTER stream is processed
      mockDAPIClient.emitChainLock(1001);

      await new Promise((resolve) => setTimeout(resolve, CHAINLOCK_POLL_WAIT));

      expect(chainLockEvent).not.toBeNull();

      // Verify required fields are present
      expect(chainLockEvent).toHaveProperty('txid');
      expect(chainLockEvent).toHaveProperty('timestamp');
      expect(chainLockEvent).toHaveProperty('blockHeight');
      expect(chainLockEvent).toHaveProperty('chainLockedHeight');
      expect(chainLockEvent).toHaveProperty('latency');

      // Verify field types
      expect(typeof chainLockEvent!.txid).toBe('string');
      expect(typeof chainLockEvent!.timestamp).toBe('number');
      expect(typeof chainLockEvent!.blockHeight).toBe('number');
      expect(typeof chainLockEvent!.chainLockedHeight).toBe('number');
      expect(typeof chainLockEvent!.latency).toBe('number');

      // Verify field values
      expect(chainLockEvent!.txid).toBe(tx.hash);
      expect(chainLockEvent!.chainLockedHeight).toBe(1001);
    }, SINGLE_POLL_TIMEOUT);

    it('should NOT have blockHash or signature in ChainLockEvent', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      let chainLockEvent: ChainLockEvent | null = null;

      const tx = MockDataBuilder.createTransaction(
        'ffff666666666666666666666666666666666666666666666666666666666666',
        [{ address: TEST_ADDRESSES.address1, satoshis: 200000 }]
      );

      const merkleBlock = MockDataBuilder.createMerkleBlock(1001, [tx.hash], 1609460100);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onChainLock: (cl) => {
          chainLockEvent = cl;
        },
      });

      // Wait for stream to be processed
      await new Promise((resolve) => setTimeout(resolve, STREAM_PROCESS_WAIT));

      // Emit ChainLock AFTER stream is processed
      mockDAPIClient.emitChainLock(1001);

      await new Promise((resolve) => setTimeout(resolve, CHAINLOCK_POLL_WAIT));

      expect(chainLockEvent).not.toBeNull();

      // Verify these fields are NOT present (as per ChainLockEvent interface)
      expect(chainLockEvent).not.toHaveProperty('blockHash');
      expect(chainLockEvent).not.toHaveProperty('signature');
    }, SINGLE_POLL_TIMEOUT);
  });

  describe('ChainLock Without Block Inclusion', () => {
    it('should NOT fire ChainLock callback if transaction is not in a block', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const chainLockEvents: ChainLockEvent[] = [];

      // Transaction in mempool (no MerkleBlock)
      const tx = MockDataBuilder.createTransaction(
        '0000777777777777777777777777777777777777777777777777777777777777',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      // Only add transaction, NO merkle block
      const txBuilder = new MockStreamBuilder();
      txBuilder.addTransactions([tx.toBuffer()]);

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onChainLock: (cl) => chainLockEvents.push(cl),
      });

      // Wait for stream to be processed
      await new Promise((resolve) => setTimeout(resolve, STREAM_PROCESS_WAIT));

      // Emit ChainLock at height 500
      mockDAPIClient.emitChainLock(500);

      await new Promise((resolve) => setTimeout(resolve, CHAINLOCK_POLL_WAIT));

      // Should NOT have any ChainLock events (tx not in block)
      expect(chainLockEvents.length).toBe(0);

      // Transaction should still be pending
      const trackedTx = finder.getTransaction(tx.hash);
      expect(trackedTx).toBeDefined();
      expect(trackedTx?.status).toBe('pending');
    }, SINGLE_POLL_TIMEOUT);
  });

  describe('ChainLock After Block Inclusion', () => {
    it('should detect ChainLock that arrives after block inclusion', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const events: {
        blockInclusions: BlockInclusionEvent[];
        chainLocks: ChainLockEvent[];
      } = {
        blockInclusions: [],
        chainLocks: [],
      };

      const tx = MockDataBuilder.createTransaction(
        '1234888888888888888888888888888888888888888888888888888888888888',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      // Block at height 1001 (RealtimeFinder increments from 1000)
      const merkleBlock = MockDataBuilder.createMerkleBlock(1001, [tx.hash], 1609461200);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onBlockInclusion: (block) => events.blockInclusions.push(block),
        onChainLock: (cl) => events.chainLocks.push(cl),
      });

      // Wait for stream to be processed
      await new Promise((resolve) => setTimeout(resolve, STREAM_PROCESS_WAIT));

      // Block inclusion should be detected
      expect(events.blockInclusions.length).toBe(1);

      // Emit ChainLock at height below block (1000) - should NOT confirm tx at 1001
      mockDAPIClient.emitChainLock(1000);
      await new Promise((resolve) => setTimeout(resolve, CHAINLOCK_POLL_WAIT));

      // No ChainLock yet (block height 1001 > ChainLock height 1000)
      expect(events.chainLocks.length).toBe(0);
      expect(finder.getTransaction(tx.hash)?.status).toBe('pending');

      // Now emit ChainLock that covers the block
      mockDAPIClient.emitChainLock(1001);
      await new Promise((resolve) => setTimeout(resolve, CHAINLOCK_POLL_WAIT));

      // Now ChainLock should be detected
      expect(events.chainLocks.length).toBe(1);
      expect(events.chainLocks[0].txid).toBe(tx.hash);
      expect(events.chainLocks[0].chainLockedHeight).toBe(1001);

      expect(finder.getTransaction(tx.hash)?.status).toBe('chainlocked');
    }, MULTI_POLL_TIMEOUT);
  });
});
