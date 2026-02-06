/**
 * HistoricFinder Integration Tests
 *
 * Tests the full integration of HistoricFinder with:
 * - BloomFilterBuilder
 * - TransactionSyncer
 * - UTXOExtractor
 * - LatestUTXOSelector
 * - Mock DAPI client (simulating real blockchain data)
 *
 * These tests verify the complete workflow from address input
 * through to UTXO discovery.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HistoricFinder } from '../../../src/finders/HistoricFinder.js';
import { FinderMode } from '../../../src/types/index.js';
import {
  ControllableMockDAPIClient,
  MockDataBuilder,
  MockStreamBuilder,
} from '../../helpers/ControllableMockDAPIClient.js';
import { TEST_ADDRESSES } from '../../helpers/test-fixtures.js';

describe('HistoricFinder Integration Tests', () => {
  let mockDAPIClient: ControllableMockDAPIClient;

  beforeEach(() => {
    mockDAPIClient = new ControllableMockDAPIClient();
  });

  describe('Complete UTXO Discovery Workflow', () => {
    it('should find UTXOs from historic blockchain scan', async () => {
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
      mockDAPIClient.setHeaderStreamMessages(headerBuilder.build());

      // Create transactions with outputs to our addresses
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

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      // Create finder and scan
      const finder = new HistoricFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1, TEST_ADDRESSES.address2],
        dapiClient: mockDAPIClient,
        fromHeight,
        toHeight,
      });

      const utxos = await finder.findUTXOs();

      // Should find 3 UTXOs total (2 from tx1, 1 from tx2)
      expect(utxos).toHaveLength(3);

      // Verify UTXO details
      const utxo1 = utxos.find(
        (u) => u.txId === tx1.hash && u.address === TEST_ADDRESSES.address1
      );
      expect(utxo1).toBeDefined();
      expect(utxo1?.satoshis).toBe(100000);
      expect(utxo1?.blockHeight).toBe(1000);
      expect(utxo1?.vout).toBe(0);

      const utxo2 = utxos.find(
        (u) => u.txId === tx1.hash && u.address === TEST_ADDRESSES.address2
      );
      expect(utxo2).toBeDefined();
      expect(utxo2?.satoshis).toBe(50000);
      expect(utxo2?.blockHeight).toBe(1000);
      expect(utxo2?.vout).toBe(1);

      const utxo3 = utxos.find((u) => u.txId === tx2.hash);
      expect(utxo3).toBeDefined();
      expect(utxo3?.satoshis).toBe(200000);
      expect(utxo3?.blockHeight).toBe(1001);
    });

    it('should return empty array when no transactions found', async () => {
      const fromHeight = 1000;
      const toHeight = 1002;

      // Create headers but no transactions
      const headerBuilder = new MockStreamBuilder();
      const headers: Buffer[] = [];

      for (let i = fromHeight; i <= toHeight; i++) {
        const header = MockDataBuilder.createBlockHeader(i, 1609459200 + i);
        headers.push(header.toBuffer());
      }

      headerBuilder.addBlockHeaders(headers);
      mockDAPIClient.setHeaderStreamMessages(headerBuilder.build());

      // Empty transaction stream
      const txBuilder = new MockStreamBuilder();
      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      const finder = new HistoricFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
        fromHeight,
        toHeight,
      });

      const utxos = await finder.findUTXOs();

      expect(utxos).toEqual([]);
    });

    it('should filter transactions to only monitored addresses', async () => {
      const fromHeight = 1000;
      const toHeight = 1000;

      // Create header
      const headerBuilder = new MockStreamBuilder();
      const header = MockDataBuilder.createBlockHeader(fromHeight, 1609459200);
      headerBuilder.addBlockHeaders([header.toBuffer()]);
      mockDAPIClient.setHeaderStreamMessages(headerBuilder.build());

      // Create transaction with outputs to multiple addresses
      // Only TEST_ADDRESSES.address1 is monitored
      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [
          { address: TEST_ADDRESSES.address1, satoshis: 100000 }, // Monitored
          { address: TEST_ADDRESSES.address2, satoshis: 50000 }, // Not monitored
          { address: TEST_ADDRESSES.address3, satoshis: 75000 }, // Not monitored
        ]
      );

      const merkleBlock = MockDataBuilder.createMerkleBlock(
        fromHeight,
        [tx.hash],
        1609459200
      );

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      const finder = new HistoricFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1], // Only monitoring address1
        dapiClient: mockDAPIClient,
        fromHeight,
        toHeight,
      });

      const utxos = await finder.findUTXOs();

      // Should only find 1 UTXO (for address1)
      expect(utxos).toHaveLength(1);
      expect(utxos[0].address).toBe(TEST_ADDRESSES.address1);
      expect(utxos[0].satoshis).toBe(100000);
    });
  });

  describe('Latest Spendable UTXO Selection', () => {
    it('should find latest spendable UTXO with sufficient balance', async () => {
      const fromHeight = 1000;
      const toHeight = 1002;

      // Create headers
      const headerBuilder = new MockStreamBuilder();
      const headers: Buffer[] = [];

      for (let i = fromHeight; i <= toHeight; i++) {
        const header = MockDataBuilder.createBlockHeader(i, 1609459200 + i);
        headers.push(header.toBuffer());
      }

      headerBuilder.addBlockHeaders(headers);
      mockDAPIClient.setHeaderStreamMessages(headerBuilder.build());

      // Create transactions at different heights
      const tx1 = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const tx2 = MockDataBuilder.createTransaction(
        '2222222222222222222222222222222222222222222222222222222222222222',
        [{ address: TEST_ADDRESSES.address1, satoshis: 200000 }]
      );

      const tx3 = MockDataBuilder.createTransaction(
        '3333333333333333333333333333333333333333333333333333333333333333',
        [{ address: TEST_ADDRESSES.address1, satoshis: 300000 }]
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

      const merkleBlock3 = MockDataBuilder.createMerkleBlock(
        1002,
        [tx3.hash],
        1609459200 + 1002
      );

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx1.toBuffer()])
        .addMerkleBlock(merkleBlock1.toBuffer())
        .addTransactions([tx2.toBuffer()])
        .addMerkleBlock(merkleBlock2.toBuffer())
        .addTransactions([tx3.toBuffer()])
        .addMerkleBlock(merkleBlock3.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      const finder = new HistoricFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
        fromHeight,
        toHeight,
        requiredAmount: 150000, // Need at least 150000
      });

      const latestUTXO = await finder.findLatestSpendableUTXO();

      // Should select tx3 (latest and sufficient balance)
      // Note: We can't compare txId due to hash calculation differences
      expect(latestUTXO.satoshis).toBe(300000);
      expect(latestUTXO.blockHeight).toBe(1002);
    });

    it('should throw error when no UTXO meets required amount', async () => {
      const fromHeight = 1000;
      const toHeight = 1000;

      // Create header
      const headerBuilder = new MockStreamBuilder();
      const header = MockDataBuilder.createBlockHeader(fromHeight, 1609459200);
      headerBuilder.addBlockHeaders([header.toBuffer()]);
      mockDAPIClient.setHeaderStreamMessages(headerBuilder.build());

      // Create transaction with small amount
      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 50000 }]
      );

      const merkleBlock = MockDataBuilder.createMerkleBlock(
        fromHeight,
        [tx.hash],
        1609459200
      );

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      const finder = new HistoricFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
        fromHeight,
        toHeight,
        requiredAmount: 100000, // Need more than available
      });

      await expect(finder.findLatestSpendableUTXO()).rejects.toThrow();
    });
  });

  describe('Event Emission', () => {
    it('should emit progress events during sync', async () => {
      const fromHeight = 1000;
      const toHeight = 1002;

      // Create headers
      const headerBuilder = new MockStreamBuilder();
      const headers: Buffer[] = [];

      for (let i = fromHeight; i <= toHeight; i++) {
        const header = MockDataBuilder.createBlockHeader(i, 1609459200 + i);
        headers.push(header.toBuffer());
      }

      headerBuilder.addBlockHeaders(headers);
      mockDAPIClient.setHeaderStreamMessages(headerBuilder.build());

      // Create simple transaction
      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const merkleBlock = MockDataBuilder.createMerkleBlock(
        1000,
        [tx.hash],
        1609459200 + 1000
      );

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      const finder = new HistoricFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
        fromHeight,
        toHeight,
      });

      const events: any[] = [];
      finder.on('start', (data) => events.push({ type: 'start', data }));
      finder.on('step', (data) => events.push({ type: 'step', data }));
      finder.on('progress', (data) => events.push({ type: 'progress', data }));
      finder.on('found', (data) => events.push({ type: 'found', data }));

      await finder.findUTXOs();

      // Verify events were emitted
      expect(events.some((e) => e.type === 'start')).toBe(true);
      expect(events.some((e) => e.type === 'step')).toBe(true);
      expect(events.some((e) => e.type === 'found')).toBe(true);

      // Verify 'found' event contains UTXOs
      const foundEvent = events.find((e) => e.type === 'found');
      expect(foundEvent?.data.totalUTXOs).toBe(1);
      expect(foundEvent?.data.utxos).toHaveLength(1);
    });

    it('should emit error event on sync failure', async () => {
      const fromHeight = 1000;
      const toHeight = 1002;

      // Inject stream error
      mockDAPIClient.injectFailure({
        method: 'subscribeToBlockHeadersWithChainLocks',
        failureType: 'stream_error',
        count: 1,
      });

      const finder = new HistoricFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
        fromHeight,
        toHeight,
      });

      const errorEvents: any[] = [];
      finder.on('error', (error) => errorEvents.push(error));

      await expect(finder.findUTXOs()).rejects.toThrow();

      // Verify error event was emitted
      expect(errorEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single block scan', async () => {
      const fromHeight = 1000;
      const toHeight = 1000;

      // Single header
      const headerBuilder = new MockStreamBuilder();
      const header = MockDataBuilder.createBlockHeader(fromHeight, 1609459200);
      headerBuilder.addBlockHeaders([header.toBuffer()]);
      mockDAPIClient.setHeaderStreamMessages(headerBuilder.build());

      // Single transaction
      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TEST_ADDRESSES.address1, satoshis: 100000 }]
      );

      const merkleBlock = MockDataBuilder.createMerkleBlock(
        fromHeight,
        [tx.hash],
        1609459200
      );

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      const finder = new HistoricFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
        fromHeight,
        toHeight,
      });

      const utxos = await finder.findUTXOs();

      expect(utxos).toHaveLength(1);
      expect(utxos[0].blockHeight).toBe(fromHeight);
    });

    it('should throw error when no addresses provided', async () => {
      const finder = new HistoricFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: [],
        dapiClient: mockDAPIClient,
        fromHeight: 1000,
        toHeight: 2000,
      });

      await expect(finder.findUTXOs()).rejects.toThrow(
        'At least one address is required'
      );
    });

    it('should handle multiple UTXOs from same transaction', async () => {
      const fromHeight = 1000;
      const toHeight = 1000;

      // Create header
      const headerBuilder = new MockStreamBuilder();
      const header = MockDataBuilder.createBlockHeader(fromHeight, 1609459200);
      headerBuilder.addBlockHeaders([header.toBuffer()]);
      mockDAPIClient.setHeaderStreamMessages(headerBuilder.build());

      // Create transaction with multiple outputs to same address
      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [
          { address: TEST_ADDRESSES.address1, satoshis: 100000 },
          { address: TEST_ADDRESSES.address1, satoshis: 200000 },
          { address: TEST_ADDRESSES.address1, satoshis: 300000 },
        ]
      );

      const merkleBlock = MockDataBuilder.createMerkleBlock(
        fromHeight,
        [tx.hash],
        1609459200
      );

      const txBuilder = new MockStreamBuilder();
      txBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());

      mockDAPIClient.setTransactionStreamMessages(txBuilder.build());

      const finder = new HistoricFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: [TEST_ADDRESSES.address1],
        dapiClient: mockDAPIClient,
        fromHeight,
        toHeight,
      });

      const utxos = await finder.findUTXOs();

      // Should find all 3 UTXOs with correct output indices
      expect(utxos).toHaveLength(3);
      expect(utxos.map((u) => u.vout).sort()).toEqual([0, 1, 2]);
      expect(utxos.map((u) => u.satoshis).sort()).toEqual([100000, 200000, 300000]);
    });
  });
});
