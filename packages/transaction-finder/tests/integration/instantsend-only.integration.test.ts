/**
 * Isolated InstantSend Integration Tests
 *
 * Tests InstantLock detection independently from ChainLock.
 * These tests verify that InstantSend functionality works correctly
 * without relying on ChainLock events.
 *
 * Key scenarios tested:
 * - InstantLock detection without ChainLock
 * - InstantLock latency calculation
 * - InstantLock event shape verification
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RealtimeFinder } from '../../src/finders/RealtimeFinder.js';
import { FinderMode } from '../../src/types/index.js';
import type { InstantLockEvent, TransactionEvent } from '../../src/types/index.js';
import {
  ControllableMockDAPIClient,
  MockDataBuilder,
  MockStreamBuilder,
} from '../helpers/ControllableMockDAPIClient.js';
import {
  TEST_ADDRESSES,
  createMockInstantLock,
} from '../helpers/test-fixtures.js';

describe('Isolated InstantSend Integration Tests', () => {
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

  describe('InstantLock Detection Without ChainLock', () => {
    it('should detect InstantLock without ChainLock', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const events: {
        transactions: TransactionEvent[];
        instantLocks: InstantLockEvent[];
      } = {
        transactions: [],
        instantLocks: [],
      };

      // Create transaction
      const tx = MockDataBuilder.createTransaction(
        'aaaa111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      // Create InstantLock for the transaction
      const instantLock = createMockInstantLock(tx.hash);

      // Build stream: transaction → InstantLock (NO ChainLock, NO MerkleBlock)
      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      // Keep ChainLock height low (0) - no ChainLock will be triggered
      mockDAPIClient.emitChainLock(0);

      // Start monitoring
      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onTransaction: (txEvent) => events.transactions.push(txEvent),
        onInstantLock: (lock) => events.instantLocks.push(lock),
      });

      // Wait for stream processing
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify transaction was detected
      expect(events.transactions.length).toBe(1);
      expect(events.transactions[0].txid).toBe(tx.hash);

      // Verify InstantLock was detected
      expect(events.instantLocks.length).toBe(1);
      expect(events.instantLocks[0].txid).toBe(tx.hash);

      // Verify transaction status is 'instantlocked' (not 'chainlocked')
      const trackedTx = finder.getTransaction(tx.hash);
      expect(trackedTx).toBeDefined();
      expect(trackedTx?.status).toBe('instantlocked');
    });

    it('should remain in instantlocked state without ChainLock', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const tx = MockDataBuilder.createTransaction(
        'bbbb222222222222222222222222222222222222222222222222222222222222',
        [{ address: TEST_ADDRESSES.address1, satoshis: 200000 }]
      );

      const instantLock = createMockInstantLock(tx.hash);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      // Set ChainLock height to 0 - ensures no ChainLock will trigger
      mockDAPIClient.emitChainLock(0);

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {});

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Wait additional time to ensure ChainLock doesn't arrive
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Transaction should still be 'instantlocked' (not progressed to chainlocked)
      const trackedTx = finder.getTransaction(tx.hash);
      expect(trackedTx?.status).toBe('instantlocked');
    });

    it('should detect multiple InstantLocks for different transactions', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const instantLockEvents: InstantLockEvent[] = [];

      // Create two transactions
      const tx1 = MockDataBuilder.createTransaction(
        '1111000000000000000000000000000000000000000000000000000000000001',
        [{ address: TEST_ADDRESSES.address1, satoshis: 50000 }]
      );

      const tx2 = MockDataBuilder.createTransaction(
        '2222000000000000000000000000000000000000000000000000000000000002',
        [{ address: TEST_ADDRESSES.address1, satoshis: 60000 }]
      );

      // Create InstantLocks for both
      const instantLock1 = createMockInstantLock(tx1.hash);
      const instantLock2 = createMockInstantLock(tx2.hash);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx1.toBuffer()])
        .addInstantLock(instantLock1.toBuffer())
        .addTransactions([tx2.toBuffer()])
        .addInstantLock(instantLock2.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());
      mockDAPIClient.emitChainLock(0);

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onInstantLock: (lock) => instantLockEvents.push(lock),
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Both InstantLocks should be detected
      expect(instantLockEvents.length).toBe(2);

      const lockedTxids = instantLockEvents.map((lock) => lock.txid);
      expect(lockedTxids).toContain(tx1.hash);
      expect(lockedTxids).toContain(tx2.hash);

      // Both transactions should be instantlocked
      expect(finder.getTransaction(tx1.hash)?.status).toBe('instantlocked');
      expect(finder.getTransaction(tx2.hash)?.status).toBe('instantlocked');
    });
  });

  describe('InstantLock Latency Calculation', () => {
    it('should calculate InstantLock latency from transaction detection time', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      let instantLockEvent: InstantLockEvent | null = null;

      const tx = MockDataBuilder.createTransaction(
        'cccc333333333333333333333333333333333333333333333333333333333333',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const instantLock = createMockInstantLock(tx.hash);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());
      mockDAPIClient.emitChainLock(0);

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onInstantLock: (lock) => {
          instantLockEvent = lock;
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(instantLockEvent).not.toBeNull();
      expect(instantLockEvent!.latency).toBeGreaterThanOrEqual(0);

      // Latency should be reasonable (not negative, not excessively large)
      expect(instantLockEvent!.latency).toBeLessThan(10000); // Less than 10 seconds
    });

    it('should have timestamp close to actual InstantLock detection time', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      let instantLockEvent: InstantLockEvent | null = null;

      const tx = MockDataBuilder.createTransaction(
        'dddd444444444444444444444444444444444444444444444444444444444444',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const instantLock = createMockInstantLock(tx.hash);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());
      mockDAPIClient.emitChainLock(0);

      const beforeTime = Date.now();

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onInstantLock: (lock) => {
          instantLockEvent = lock;
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      const afterTime = Date.now();

      expect(instantLockEvent).not.toBeNull();
      expect(instantLockEvent!.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(instantLockEvent!.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('InstantLock Event Shape Verification', () => {
    it('should have correct InstantLockEvent structure', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      let instantLockEvent: InstantLockEvent | null = null;

      const tx = MockDataBuilder.createTransaction(
        'eeee555555555555555555555555555555555555555555555555555555555555',
        [{ address: TEST_ADDRESSES.address1, satoshis: 150000 }]
      );

      const instantLock = createMockInstantLock(tx.hash);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());
      mockDAPIClient.emitChainLock(0);

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onInstantLock: (lock) => {
          instantLockEvent = lock;
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(instantLockEvent).not.toBeNull();

      // Verify required fields are present
      expect(instantLockEvent).toHaveProperty('txid');
      expect(instantLockEvent).toHaveProperty('timestamp');
      expect(instantLockEvent).toHaveProperty('latency');

      // Verify field types
      expect(typeof instantLockEvent!.txid).toBe('string');
      expect(typeof instantLockEvent!.timestamp).toBe('number');
      expect(typeof instantLockEvent!.latency).toBe('number');

      // Verify field values
      expect(instantLockEvent!.txid).toBe(tx.hash);
    });

    it('should optionally have instantLockHex in InstantLockEvent', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      let instantLockEvent: InstantLockEvent | null = null;

      const tx = MockDataBuilder.createTransaction(
        'ffff666666666666666666666666666666666666666666666666666666666666',
        [{ address: TEST_ADDRESSES.address1, satoshis: 200000 }]
      );

      const instantLock = createMockInstantLock(tx.hash);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());
      mockDAPIClient.emitChainLock(0);

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onInstantLock: (lock) => {
          instantLockEvent = lock;
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(instantLockEvent).not.toBeNull();

      // instantLockHex is optional but may be present
      if (instantLockEvent!.instantLockHex !== undefined) {
        expect(typeof instantLockEvent!.instantLockHex).toBe('string');
      }
    });
  });

  describe('InstantLock for Untracked Transaction', () => {
    it('should NOT fire callback for InstantLock of untracked transaction', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const instantLockEvents: InstantLockEvent[] = [];

      // Create InstantLock for a transaction we don't track
      const unknownTxid = '0000777777777777777777777777777777777777777777777777777777777777';
      const instantLock = createMockInstantLock(unknownTxid);

      // Only add InstantLock, no transaction
      const txBuilder = new MockStreamBuilder();
      txBuilder.addInstantLock(instantLock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());
      mockDAPIClient.emitChainLock(0);

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onInstantLock: (lock) => instantLockEvents.push(lock),
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should NOT have any InstantLock events (tx not tracked)
      expect(instantLockEvents.length).toBe(0);

      // Transaction should not exist in tracker
      expect(finder.getTransaction(unknownTxid)).toBeUndefined();
    });
  });

  describe('InstantLock Idempotency', () => {
    it('should only fire InstantLock callback once per transaction', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const instantLockEvents: InstantLockEvent[] = [];

      const tx = MockDataBuilder.createTransaction(
        '1234888888888888888888888888888888888888888888888888888888888888',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      // Create same InstantLock twice (simulating duplicate messages)
      const instantLock1 = createMockInstantLock(tx.hash);
      const instantLock2 = createMockInstantLock(tx.hash);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock1.toBuffer())
        .addInstantLock(instantLock2.toBuffer()); // Duplicate

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());
      mockDAPIClient.emitChainLock(0);

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onInstantLock: (lock) => instantLockEvents.push(lock),
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should only have ONE InstantLock event (deduplicated)
      expect(instantLockEvents.length).toBe(1);
      expect(instantLockEvents[0].txid).toBe(tx.hash);
    });
  });

  describe('Transaction Status Transitions', () => {
    it('should transition from pending to instantlocked', async () => {
      const config = {
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
      };

      finder = new RealtimeFinder(config);

      const statusHistory: string[] = [];

      const tx = MockDataBuilder.createTransaction(
        '5678999999999999999999999999999999999999999999999999999999999999',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const instantLock = createMockInstantLock(tx.hash);

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());
      mockDAPIClient.emitChainLock(0);

      await finder.monitorAddresses([TEST_ADDRESSES.address1], {
        onTransaction: () => {
          const tracked = finder.getTransaction(tx.hash);
          if (tracked) statusHistory.push(tracked.status);
        },
        onInstantLock: () => {
          const tracked = finder.getTransaction(tx.hash);
          if (tracked) statusHistory.push(tracked.status);
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should have transitioned: pending → instantlocked
      expect(statusHistory).toContain('pending');
      expect(statusHistory).toContain('instantlocked');

      // Final status should be instantlocked
      const finalStatus = finder.getTransaction(tx.hash)?.status;
      expect(finalStatus).toBe('instantlocked');
    });
  });
});
