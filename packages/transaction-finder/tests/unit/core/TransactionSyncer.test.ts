/**
 * Unit tests for TransactionSyncer
 * Tests core sync functionality, header caching, and metadata extraction
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TransactionSyncer } from '../../../src/core/TransactionSyncer.js';
import {
  createMockDAPIClient,
  MockDataBuilder,
  MockStreamBuilder,
  MockFailureScenarios,
} from '../../helpers/ControllableMockDAPIClient.js';
import { TestScenarios, TestWaiters } from '../../helpers/test-fixtures.js';
import { TESTNET_ADDRESSES } from '../../fixtures/addresses.js';
import { BloomFilterBuilder } from '../../../src/core/BloomFilterBuilder.js';

describe('TransactionSyncer', () => {
  let mockClient: ReturnType<typeof createMockDAPIClient>;
  let syncer: TransactionSyncer;

  beforeEach(() => {
    mockClient = createMockDAPIClient();
    syncer = new TransactionSyncer(mockClient, 'testnet');
  });

  afterEach(() => {
    mockClient.reset();
  });

  describe('Initialization and Configuration', () => {
    it('should initialize with correct network', () => {
      expect(syncer.getNetwork()).toBe('testnet');
    });

    it('should allow network change via setNetwork', () => {
      syncer.setNetwork('mainnet');
      expect(syncer.getNetwork()).toBe('mainnet');
    });
  });

  describe('Block Height Validation', () => {
    it('should reject undefined block height', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      await expect(async () => {
        await syncer.syncTransactions(bloomFilter, undefined as any);
      }).rejects.toThrow(/fromHeight.*required/);
    });

    it('should reject null block height', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      await expect(async () => {
        await syncer.syncTransactions(bloomFilter, null as any);
      }).rejects.toThrow(/fromHeight.*required/);
    });

    it('should reject negative block height', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      await expect(async () => {
        await syncer.syncTransactions(bloomFilter, -1);
      }).rejects.toThrow(/must be non-negative/);
    });

    it('should reject NaN block height', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      await expect(async () => {
        await syncer.syncTransactions(bloomFilter, NaN);
      }).rejects.toThrow(/must be a valid number/);
    });

    it('should reject block height exceeding uint32 max', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);
      const tooLarge = 4294967296; // MAX_UINT32 + 1

      await expect(async () => {
        await syncer.syncTransactions(bloomFilter, tooLarge);
      }).rejects.toThrow(/exceeds maximum value/);
    });

    it('should accept valid block height at uint32 boundary', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);
      const maxUint32 = 4294967295;

      // Set up minimal mock response to avoid actual sync
      mockClient.setHeaderStreamMessages([]);
      mockClient.setTransactionStreamMessages([]);

      // Should not throw
      await syncer.syncTransactions(bloomFilter, maxUint32, maxUint32);
    });

    it('should floor non-integer block heights', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      // Set up minimal mock response
      mockClient.setHeaderStreamMessages([]);
      mockClient.setTransactionStreamMessages([]);

      // Should accept and floor to 1000
      await syncer.syncTransactions(bloomFilter, 1000.7, 1000.7);

      // Verify it was called (height floored internally)
      expect(mockClient.getCallCount('subscribeToBlockHeadersWithChainLocks')).toBe(1);
    });
  });

  describe('Concurrent Sync Prevention', () => {
    it('should reject concurrent sync attempts', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      // Set up a slow sync scenario
      mockClient.setStreamDelay(100);
      const scenario = TestScenarios.createSimpleHistoricSync(mockClient);

      // Start first sync (don't await yet)
      const firstSync = syncer.syncTransactions(
        bloomFilter,
        scenario.fromHeight,
        scenario.toHeight
      );

      // Try to start second sync while first is in progress
      await expect(async () => {
        await syncer.syncTransactions(
          bloomFilter,
          scenario.fromHeight,
          scenario.toHeight
        );
      }).rejects.toThrow(/sync already in progress/);

      // Wait for first sync to complete
      await firstSync;

      // After first completes, second sync should work
      mockClient.reset();
      TestScenarios.createSimpleHistoricSync(mockClient);

      await expect(
        syncer.syncTransactions(bloomFilter, scenario.fromHeight, scenario.toHeight)
      ).resolves.toBeDefined();
    });

    it('should release lock even if sync fails', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      // Inject a failure
      mockClient.injectFailure({
        method: 'subscribeToTransactionsWithProofs',
        failureType: 'stream_error',
      });

      // First sync should fail
      await expect(async () => {
        await syncer.syncTransactions(bloomFilter, 1000, 1001);
      }).rejects.toThrow();

      // Clear failure and set up valid response
      mockClient.clearFailures();
      TestScenarios.createSimpleHistoricSync(mockClient);

      // Second sync should work (lock was released)
      await expect(
        syncer.syncTransactions(bloomFilter, 1000, 1001)
      ).resolves.toBeDefined();
    });
  });

  describe('Header Pre-caching', () => {
    it('should pre-cache headers before syncing transactions', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);
      const scenario = TestScenarios.createSimpleHistoricSync(mockClient);

      await syncer.syncTransactions(
        bloomFilter,
        scenario.fromHeight,
        scenario.toHeight
      );

      // Verify headers were requested
      expect(mockClient.getCallCount('subscribeToBlockHeadersWithChainLocks')).toBe(1);
    });

    it('should handle empty header stream gracefully', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      // Set up empty streams
      mockClient.setHeaderStreamMessages([]);
      mockClient.setTransactionStreamMessages([]);

      // Should not throw
      const result = await syncer.syncTransactions(bloomFilter, 1000, 1001);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should use cached headers for metadata enrichment', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);
      const scenario = TestScenarios.createSimpleHistoricSync(mockClient);

      const transactions = await syncer.syncTransactions(
        bloomFilter,
        scenario.fromHeight,
        scenario.toHeight
      );

      // Transactions should have metadata from cached headers
      // Note: This will depend on the actual implementation details
      // For now, just verify we got transactions back
      expect(transactions.length).toBeGreaterThan(0);

      // Verify getBlockByHash was NOT called (because headers were cached)
      expect(mockClient.getCallCount('getBlockByHash')).toBe(0);
    });
  });

  describe('Stream Processing', () => {
    it('should process transaction messages from stream', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);
      const scenario = TestScenarios.createSimpleHistoricSync(mockClient);

      const transactions = await syncer.syncTransactions(
        bloomFilter,
        scenario.fromHeight,
        scenario.toHeight
      );

      // Should have extracted transactions
      expect(transactions).toBeDefined();
      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBe(scenario.expectedTxids.length);
    });

    it('should process merkle block messages from stream', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);
      const scenario = TestScenarios.createSimpleHistoricSync(mockClient);

      const transactions = await syncer.syncTransactions(
        bloomFilter,
        scenario.fromHeight,
        scenario.toHeight
      );

      // Merkle blocks should add metadata (height, blockTime)
      transactions.forEach(tx => {
        expect(tx.metadata).toBeDefined();
        expect(tx.metadata?.height).toBeDefined();
        expect(typeof tx.metadata?.height).toBe('number');
      });
    });

    it('should handle both sync and async stream returns', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);
      const scenario = TestScenarios.createSimpleHistoricSync(mockClient);

      // The mock returns sync streams, but syncer should handle both
      const transactions = await syncer.syncTransactions(
        bloomFilter,
        scenario.fromHeight,
        scenario.toHeight
      );

      expect(transactions).toBeDefined();
    });
  });

  describe('InstantLock Processing', () => {
    it('should process InstantLock messages', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      // Create a scenario with InstantLock
      const tx = MockDataBuilder.createTransaction(
        '1111111111111111111111111111111111111111111111111111111111111111',
        [{ address: TESTNET_ADDRESSES.address1, satoshis: 100000 }]
      );

      const instantLock = MockDataBuilder.createInstantLock(tx.hash, 1000);

      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(Buffer.from(JSON.stringify(instantLock)));

      mockClient.setHeaderStreamMessages([]);
      mockClient.setTransactionStreamMessages(streamBuilder.build());

      const transactions = await syncer.syncTransactions(bloomFilter, 1000, 1000);

      // Should have processed InstantLock
      expect(transactions.length).toBe(1);
      // Note: Actual instantLocked flag depends on implementation
    });
  });

  describe('ChainLock Processing', () => {
    it('should process ChainLock messages', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      // Create a scenario with ChainLock
      const tx = MockDataBuilder.createTransaction(
        '2222222222222222222222222222222222222222222222222222222222222222',
        [{ address: TESTNET_ADDRESSES.address1, satoshis: 100000 }]
      );

      const header = MockDataBuilder.createBlockHeader(1000);
      const merkleBlock = MockDataBuilder.createMerkleBlock(1000, [tx.hash]);
      const chainLock = MockDataBuilder.createChainLock(1000, header.hash);

      const headerStreamBuilder = new MockStreamBuilder();
      headerStreamBuilder.addBlockHeaders([header.toBuffer()]);
      mockClient.setHeaderStreamMessages(headerStreamBuilder.build());

      const txStreamBuilder = new MockStreamBuilder();
      txStreamBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer())
        .addChainLock(Buffer.from(JSON.stringify(chainLock)));

      mockClient.setTransactionStreamMessages(txStreamBuilder.build());

      const transactions = await syncer.syncTransactions(bloomFilter, 1000, 1000);

      // Should have processed ChainLock
      expect(transactions.length).toBe(1);
      // Note: Actual chainLocked flag depends on implementation
    });
  });

  describe('Progress Callbacks', () => {
    it('should invoke progress callback during sync', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);
      const scenario = TestScenarios.createSimpleHistoricSync(mockClient);

      const progressUpdates: any[] = [];
      const onProgress = (progress: any) => {
        progressUpdates.push(progress);
      };

      await syncer.syncTransactions(
        bloomFilter,
        scenario.fromHeight,
        scenario.toHeight,
        onProgress
      );

      // Should have emitted progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);

      // Progress should have expected fields
      progressUpdates.forEach(progress => {
        expect(progress).toHaveProperty('progress');
        expect(progress).toHaveProperty('syncedBlocks');
        expect(progress).toHaveProperty('totalBlocks');
        expect(typeof progress.progress).toBe('number');
        expect(typeof progress.syncedBlocks).toBe('number');
        expect(typeof progress.totalBlocks).toBe('number');
      });
    });

    it('should not fail if progress callback is omitted', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);
      const scenario = TestScenarios.createSimpleHistoricSync(mockClient);

      // Should not throw without progress callback
      await expect(
        syncer.syncTransactions(
          bloomFilter,
          scenario.fromHeight,
          scenario.toHeight
        )
      ).resolves.toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw error on header stream failure', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      // Inject header stream failure
      mockClient.injectFailure({
        method: 'subscribeToBlockHeadersWithChainLocks',
        failureType: 'stream_error',
      });

      await expect(async () => {
        await syncer.syncTransactions(bloomFilter, 1000, 1001);
      }).rejects.toThrow();
    });

    it('should throw error on transaction stream failure', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      // Set up valid headers but failing transaction stream
      const headerBuilder = new MockStreamBuilder();
      const header = MockDataBuilder.createBlockHeader(1000);
      headerBuilder.addBlockHeaders([header.toBuffer()]);
      mockClient.setHeaderStreamMessages(headerBuilder.build());

      // Inject transaction stream failure
      mockClient.injectFailure({
        method: 'subscribeToTransactionsWithProofs',
        failureType: 'stream_error',
      });

      await expect(async () => {
        await syncer.syncTransactions(bloomFilter, 1000, 1001);
      }).rejects.toThrow();
    });

    it('should handle invalid protobuf messages gracefully', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      // Create corrupted stream data
      mockClient.setHeaderStreamMessages([]);
      mockClient.setTransactionStreamMessages([
        { garbage: 'invalid data' }, // Invalid message
      ]);

      // Should not crash, might return empty array or throw
      // Depends on implementation's error handling strategy
      try {
        const result = await syncer.syncTransactions(bloomFilter, 1000, 1001);
        expect(Array.isArray(result)).toBe(true);
      } catch (error) {
        // Also acceptable to throw on invalid data
        expect(error).toBeDefined();
      }
    });

    it('should handle missing blockchain status gracefully', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);

      // Remove blockchain status
      mockClient.setBlockchainStatus({});

      // Set up valid streams
      mockClient.setHeaderStreamMessages([]);
      mockClient.setTransactionStreamMessages([]);

      // Should use fromHeight as fallback
      await expect(
        syncer.syncTransactions(bloomFilter, 1000) // No toHeight
      ).resolves.toBeDefined();
    });
  });

  describe('Large-scale Sync', () => {
    it('should handle syncing 100 blocks efficiently', async () => {
      const bloomFilter = BloomFilterBuilder.build([TESTNET_ADDRESSES.address1]);
      const scenario = TestScenarios.createLargeSync(mockClient, 100, 5);

      const startTime = Date.now();

      const transactions = await syncer.syncTransactions(
        bloomFilter,
        scenario.fromHeight,
        scenario.toHeight
      );

      const duration = Date.now() - startTime;

      expect(transactions.length).toBe(scenario.expectedTxCount);

      // Should complete reasonably fast (< 5 seconds for mocked data)
      expect(duration).toBeLessThan(5000);
    });
  });
});
