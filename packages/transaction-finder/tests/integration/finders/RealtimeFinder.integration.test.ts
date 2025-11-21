/**
 * RealtimeFinder Integration Tests
 *
 * Tests the full integration of RealtimeFinder with:
 * - BloomFilterBuilder
 * - StreamWrapper
 * - TransactionTracker
 * - ChainLockHeightMonitor
 * - Mock DAPI client (simulating real stream data)
 *
 * These tests verify real-time transaction monitoring with pre-configured streams.
 * Note: Dynamic message queuing and complex async scenarios are tested in unit tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RealtimeFinder } from '../../../src/finders/RealtimeFinder.js';
import { FinderMode } from '../../../src/types/index.js';
import {
  ControllableMockDAPIClient,
  MockDataBuilder,
  MockStreamBuilder,
} from '../../helpers/ControllableMockDAPIClient.js';
import {
  TEST_ADDRESSES,
  createMockInstantLock,
} from '../../helpers/test-fixtures.js';

describe('RealtimeFinder Integration Tests', () => {
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

  describe('Transaction Detection', () => {
    it('should detect transactions from pre-configured stream', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const transactionEvents: any[] = [];

      // Set up stream with transaction
      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const txBuilder = new MockStreamBuilder();
      txBuilder.addTransactions([tx.toBuffer()]);
      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      // Start monitoring
      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onTransaction: (tx) => transactionEvents.push(tx),
      });

      // Wait for stream processing
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify transaction was detected
      expect(transactionEvents.length).toBeGreaterThan(0);
      expect(transactionEvents[0].txid).toBe(tx.hash);
    });

    it('should ignore transactions not involving monitored addresses', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const transactionEvents: any[] = [];

      // Transaction to different address
      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address3, satoshis: 100000 }]
      );

      const txBuilder = new MockStreamBuilder();
      txBuilder.addTransactions([tx.toBuffer()]);
      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onTransaction: (tx) => transactionEvents.push(tx),
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should not detect transaction
      expect(transactionEvents).toHaveLength(0);
    });

    it('should track multiple addresses simultaneously', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1, TEST_ADDRESSES.address2],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const transactionEvents: any[] = [];

      // Transactions to both addresses
      const tx1 = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const tx2 = MockDataBuilder.createTransaction(
        '2222222222222222222222222222222222222222222222222222222222222222',
        [{ address: TEST_ADDRESSES.address2, satoshis: 200000 }]
      );

      const txBuilder = new MockStreamBuilder();
      txBuilder.addTransactions([tx1.toBuffer(), tx2.toBuffer()]);
      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses(
        [TEST_ADDRESSES.address1, TEST_ADDRESSES.address2],
        {
          onTransaction: (tx) => transactionEvents.push(tx),
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should detect both transactions
      expect(transactionEvents.length).toBe(2);
      const txids = transactionEvents.map((e) => e.txid);
      expect(txids).toContain(tx1.hash);
      expect(txids).toContain(tx2.hash);
    });
  });

  describe('InstantLock Detection', () => {
    it('should detect InstantLock from pre-configured stream', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const instantLockEvents: any[] = [];

      // Transaction + InstantLock
      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const instantLock = createMockInstantLock(tx.hash);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock);

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onInstantLock: (lock) => instantLockEvents.push(lock),
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify InstantLock was detected
      expect(instantLockEvents.length).toBe(1);
      expect(instantLockEvents[0].txid).toBe(tx.hash);
    });

    it('should calculate InstantLock latency', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const instantLockEvents: any[] = [];

      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const instantLock = createMockInstantLock(tx.hash);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock);

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onInstantLock: (lock) => instantLockEvents.push(lock),
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify latency was calculated
      expect(instantLockEvents.length).toBe(1);
      expect(instantLockEvents[0].latency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Block Inclusion Detection', () => {
    it('should detect block inclusion via MerkleBlock', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const blockInclusionEvents: any[] = [];

      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const merkleBlock = MockDataBuilder.createMerkleBlock(1500, [tx.hash], 1609459200);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onBlockInclusion: (block) => blockInclusionEvents.push(block),
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify block inclusion was detected
      expect(blockInclusionEvents.length).toBe(1);
      expect(blockInclusionEvents[0].txid).toBe(tx.hash);
      expect(blockInclusionEvents[0].blockHeight).toBeGreaterThan(0);
    });
  });

  describe('Resource Management', () => {
    it('should stop monitoring via cleanup function', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const txBuilder = new MockStreamBuilder();
      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      const cleanup = await finder.monitorAddresses([TEST_ADDRESSES.address1], {});

      expect(finder.getStatus().active).toBe(true);

      cleanup();

      expect(finder.getStatus().active).toBe(false);
    });

    it('should track transaction state', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const txBuilder = new MockStreamBuilder();
      txBuilder.addTransactions([tx.toBuffer()]);
      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {});

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify transaction is tracked
      const trackedTx = finder.getTransaction(tx.hash);
      expect(trackedTx).toBeDefined();
      expect(trackedTx?.txid).toBe(tx.hash);
    });

    it('should clear transaction from tracking', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const txBuilder = new MockStreamBuilder();
      txBuilder.addTransactions([tx.toBuffer()]);
      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {});

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify tracked
      expect(finder.getTransaction(tx.hash)).toBeDefined();

      // Clear transaction
      finder.clearTransaction(tx.hash);

      // Verify cleared
      expect(finder.getTransaction(tx.hash)).toBeUndefined();
    });
  });

  describe('Complete Workflow', () => {
    it('should handle complete transaction confirmation flow', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const events: any = {
        transactions: [],
        instantLocks: [],
        blockInclusions: [],
      };

      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const instantLock = createMockInstantLock(tx.hash);
      const merkleBlock = MockDataBuilder.createMerkleBlock(1500, [tx.hash], 1609459200);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock)
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onTransaction: (tx) => events.transactions.push(tx),
        onInstantLock: (lock) => events.instantLocks.push(lock),
        onBlockInclusion: (block) => events.blockInclusions.push(block),
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify all events were captured
      expect(events.transactions.length).toBe(1);
      expect(events.instantLocks.length).toBe(1);
      expect(events.blockInclusions.length).toBe(1);

      // Verify transaction progressed through states
      const trackedTx = finder.getTransaction(tx.hash);
      expect(trackedTx).toBeDefined();
      expect(trackedTx?.status).toBe('instantlocked');
      expect(trackedTx?.blockHeight).toBeGreaterThan(0);
    });
  });
});
