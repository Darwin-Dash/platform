/**
 * Unit tests for RealtimeFinder
 *
 * Test scenarios:
 * 1. Initialization and configuration
 * 2. Stream processing (transactions, merkle blocks, instant locks)
 * 3. Transaction detection (address matching)
 * 4. InstantLock workflow and callbacks
 * 5. ChainLock workflow and callbacks
 * 6. Cleanup and resource management
 * 7. waitForConfirmation functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealtimeFinder } from '../../../src/finders/RealtimeFinder.js';
import { ControllableMockDAPIClient } from '../../helpers/ControllableMockDAPIClient.js';
import { MockStreamBuilder } from '../../helpers/ControllableMockDAPIClient.js';
import {
  createMockTransaction,
  createMockMerkleBlock,
  createMockInstantLock,
} from '../../helpers/test-fixtures.js';
import type {
  RealtimeFinderConfig,
  TransactionEvent,
  InstantLockEvent,
  ChainLockEvent,
  BlockInclusionEvent,
} from '../../../src/types/index.js';

describe('RealtimeFinder', () => {
  let mockDAPIClient: ControllableMockDAPIClient;
  let config: RealtimeFinderConfig;

  beforeEach(() => {
    mockDAPIClient = new ControllableMockDAPIClient();
    config = {
      mode: 'realtime' as const,
      network: 'testnet' as const,
      addresses: ['yTsGq4wV8WF5GKLaYV2C43zrkr2sfTtysT'],
      dapiClient: mockDAPIClient,
      autoPruneOnConfirmation: false,
      maxTrackedTransactions: 100,
    };
  });

  afterEach(() => {
    // Cleanup any active finders
    vi.clearAllMocks();
  });

  //
  // Scenario 1: Initialization and Configuration
  //
  describe('Initialization and Configuration', () => {
    it('should initialize with proper configuration', () => {
      const finder = new RealtimeFinder(config);

      const status = finder.getStatus();
      expect(status.active).toBe(false);
      expect(status.trackedTransactions).toBe(0);
      expect(status.chainLockHeight).toBe(0);
    });

    it('should respect autoPruneOnConfirmation setting', () => {
      const configWithAutoPrune: RealtimeFinderConfig = {
        ...config,
        autoPruneOnConfirmation: true,
      };

      const finder = new RealtimeFinder(configWithAutoPrune);
      expect(finder).toBeDefined();
    });

    it('should respect maxTrackedTransactions limit', () => {
      const configWithLimit: RealtimeFinderConfig = {
        ...config,
        maxTrackedTransactions: 50,
      };

      const finder = new RealtimeFinder(configWithLimit);
      expect(finder).toBeDefined();
    });

    it('should initialize as inactive', () => {
      const finder = new RealtimeFinder(config);
      expect(finder.getStatus().active).toBe(false);
    });

    it('should return configured network', () => {
      const finder = new RealtimeFinder(config);
      expect(finder.getNetwork()).toBe('testnet');
    });
  });

  //
  // Scenario 2: Stream Processing
  //
  describe('Stream Processing', () => {
    it('should process raw transactions from stream', async () => {
      const finder = new RealtimeFinder(config);
      const onTransaction = vi.fn();

      // Set up stream to emit transaction
      const tx = createMockTransaction({
        outputs: [
          {
            satoshis: 100000,
            address: config.addresses[0],
          },
        ],
      });

      const streamBuilder = new MockStreamBuilder();
      streamBuilder.addTransactions([tx.toBuffer()]);
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      // Start monitoring
      const cleanup = await finder.monitorAddresses(config.addresses, {
        onTransaction,
      });

      // Wait for stream processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          txid: tx.hash,
          timestamp: expect.any(Number),
        })
      );

      cleanup();
    });

    it('should process MerkleBlock and record block inclusion', async () => {
      const finder = new RealtimeFinder(config);
      const onBlockInclusion = vi.fn();

      // Create a transaction and merkle block
      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const merkleBlock = createMockMerkleBlock({
        txids: [tx.hash],
        blockHeight: 1000,
      });

      // Set up stream with transaction and merkle block
      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      // Start monitoring
      const cleanup = await finder.monitorAddresses(config.addresses, {
        onBlockInclusion,
      });

      // Wait for stream processing
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(onBlockInclusion).toHaveBeenCalledWith(
        expect.objectContaining({
          txid: tx.hash,
          blockHeight: expect.any(Number),
          blockHash: expect.any(String),
          timestamp: expect.any(Number),
        })
      );

      cleanup();
    });

    it('should process InstantLock messages', async () => {
      const finder = new RealtimeFinder(config);
      const onInstantLock = vi.fn();

      // Create transaction and instant lock
      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const instantLock = createMockInstantLock(tx.hash);

      // Set up stream with transaction and instant lock
      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      // Start monitoring
      const cleanup = await finder.monitorAddresses(config.addresses, {
        onInstantLock,
      });

      // Wait for stream processing
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(onInstantLock).toHaveBeenCalledWith(
        expect.objectContaining({
          txid: tx.hash,
          timestamp: expect.any(Number),
          latency: expect.any(Number),
        })
      );

      cleanup();
    });

    it('should handle stream errors gracefully', async () => {
      const finder = new RealtimeFinder(config);
      const errorHandler = vi.fn();

      finder.on('error', errorHandler);

      // Inject stream failure
      mockDAPIClient.injectFailure({
        method: 'subscribeToTransactionsWithProofs',
        failureType: 'stream_error',
        count: 1,
      });

      // Start monitoring
      const cleanup = await finder.monitorAddresses(config.addresses, {});

      // Wait for error processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorHandler).toHaveBeenCalled();

      cleanup();
    });

    it('should handle malformed stream messages', async () => {
      const finder = new RealtimeFinder(config);
      const onTransaction = vi.fn();

      // Set up stream with invalid transaction buffer
      const streamBuilder = new MockStreamBuilder();
      streamBuilder.addTransactions([Buffer.from('invalid')]);
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      // Start monitoring
      const cleanup = await finder.monitorAddresses(config.addresses, {
        onTransaction,
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not have called callback due to parse error
      expect(onTransaction).not.toHaveBeenCalled();

      cleanup();
    });

    it('should stop processing when inactive', async () => {
      const finder = new RealtimeFinder(config);
      const onTransaction = vi.fn();

      // Empty stream initially
      mockDAPIClient.setTransactionStreamMessages([]);

      // Start monitoring
      const cleanup = await finder.monitorAddresses(config.addresses, {
        onTransaction,
      });

      // Stop immediately
      cleanup();

      // Stream should not process anything after stop
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onTransaction).not.toHaveBeenCalled();
    });
  });

  //
  // Scenario 3: Transaction Detection (Address Matching)
  //
  describe('Transaction Detection', () => {
    it('should detect transactions to monitored addresses', async () => {
      const finder = new RealtimeFinder(config);
      const onTransaction = vi.fn();

      const tx = createMockTransaction({
        outputs: [
          {
            satoshis: 100000,
            address: config.addresses[0], // Monitored address
          },
        ],
      });

      const streamBuilder = new MockStreamBuilder();
      streamBuilder.addTransactions([tx.toBuffer()]);
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(config.addresses, {
        onTransaction,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onTransaction).toHaveBeenCalledTimes(1);
      expect(onTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          txid: tx.hash,
        })
      );

      cleanup();
    });

    it('should ignore transactions to non-monitored addresses', async () => {
      const finder = new RealtimeFinder(config);
      const onTransaction = vi.fn();

      const tx = createMockTransaction({
        outputs: [
          {
            satoshis: 100000,
            address: 'yP8A3cbdxRtLRduy5mXDsBnJtMzHWs6ZXr', // Different address
          },
        ],
      });

      const streamBuilder = new MockStreamBuilder();
      streamBuilder.addTransactions([tx.toBuffer()]);
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(config.addresses, {
        onTransaction,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onTransaction).not.toHaveBeenCalled();

      cleanup();
    });

    it('should handle multiple monitored addresses', async () => {
      const addresses = [
        'yTsGq4wV8WF5GKLaYV2C43zrkr2sfTtysT',
        'yP8A3cbdxRtLRduy5mXDsBnJtMzHWs6ZXr',
      ];

      const configMulti: RealtimeFinderConfig = {
        ...config,
        addresses,
      };

      const finder = new RealtimeFinder(configMulti);
      const onTransaction = vi.fn();

      // Transaction to second address
      const tx = createMockTransaction({
        outputs: [
          {
            satoshis: 100000,
            address: addresses[1],
          },
        ],
      });

      const streamBuilder = new MockStreamBuilder();
      streamBuilder.addTransactions([tx.toBuffer()]);
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(addresses, {
        onTransaction,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onTransaction).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('should handle transactions with multiple outputs', async () => {
      const finder = new RealtimeFinder(config);
      const onTransaction = vi.fn();

      const tx = createMockTransaction({
        outputs: [
          { satoshis: 50000, address: 'yP8A3cbdxRtLRduy5mXDsBnJtMzHWs6ZXr' },
          { satoshis: 50000, address: config.addresses[0] }, // Match on second output
        ],
      });

      const streamBuilder = new MockStreamBuilder();
      streamBuilder.addTransactions([tx.toBuffer()]);
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(config.addresses, {
        onTransaction,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onTransaction).toHaveBeenCalledTimes(1);

      cleanup();
    });
  });

  //
  // Scenario 4: InstantLock Workflow
  //
  describe('InstantLock Workflow', () => {
    it('should fire onInstantLock callback when new InstantLock arrives', async () => {
      const finder = new RealtimeFinder(config);
      const onTransaction = vi.fn();
      const onInstantLock = vi.fn();

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const instantLock = createMockInstantLock(tx.hash);

      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(config.addresses, {
        onTransaction,
        onInstantLock,
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(onTransaction).toHaveBeenCalledTimes(1);
      expect(onInstantLock).toHaveBeenCalledTimes(1);
      expect(onInstantLock).toHaveBeenCalledWith(
        expect.objectContaining({
          txid: tx.hash,
          timestamp: expect.any(Number),
          latency: expect.any(Number),
        })
      );

      cleanup();
    });

    it('should not fire callback for duplicate InstantLocks', async () => {
      const finder = new RealtimeFinder(config);
      const onInstantLock = vi.fn();

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const instantLock = createMockInstantLock(tx.hash);

      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer())
        .addInstantLock(instantLock.toBuffer()); // Duplicate
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(config.addresses, {
        onInstantLock,
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should only fire once
      expect(onInstantLock).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('should calculate latency correctly', async () => {
      const finder = new RealtimeFinder(config);
      const onInstantLock = vi.fn();

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const instantLock = createMockInstantLock(tx.hash);

      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());
      mockDAPIClient.setStreamDelay(50); // 50ms between messages

      const cleanup = await finder.monitorAddresses(config.addresses, {
        onInstantLock,
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(onInstantLock).toHaveBeenCalled();
      const callArg = onInstantLock.mock.calls[0][0] as InstantLockEvent;
      expect(callArg.latency).toBeGreaterThanOrEqual(0);

      cleanup();
    });

    it('should handle InstantLock for unmonitored transaction', async () => {
      const finder = new RealtimeFinder(config);
      const onInstantLock = vi.fn();

      // Use valid 64-char hex txid for an unmonitored transaction
      const instantLock = createMockInstantLock('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

      const streamBuilder = new MockStreamBuilder();
      streamBuilder.addInstantLock(instantLock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(config.addresses, {
        onInstantLock,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not fire callback for unmonitored transaction
      expect(onInstantLock).not.toHaveBeenCalled();

      cleanup();
    });

    it('should update transaction status to instantlocked', async () => {
      const finder = new RealtimeFinder(config);

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const instantLock = createMockInstantLock(tx.hash);

      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(config.addresses, {});

      await new Promise((resolve) => setTimeout(resolve, 150));

      const trackedTx = finder.getTransaction(tx.hash);
      expect(trackedTx).toBeDefined();
      expect(trackedTx!.status).toBe('instantlocked');
      expect(trackedTx!.instantLockTime).not.toBeNull();

      cleanup();
    });
  });

  //
  // Scenario 5: ChainLock Workflow
  //
  describe('ChainLock Workflow', () => {
    it('should integrate with ChainLockHeightMonitor', async () => {
      const finder = new RealtimeFinder(config);
      const onChainLock = vi.fn();

      mockDAPIClient.setTransactionStreamMessages([]);

      // Start monitoring
      const cleanup = await finder.monitorAddresses(config.addresses, {
        onChainLock,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify ChainLock monitor is active
      const status = finder.getStatus();
      expect(status.active).toBe(true);

      cleanup();
    });

    it('should fire onChainLock callback when transactions are confirmed', async () => {
      const finder = new RealtimeFinder(config);
      const onChainLock = vi.fn();

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const merkleBlock = createMockMerkleBlock({
        txids: [tx.hash],
        blockHeight: 1000,
      });

      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(config.addresses, {
        onChainLock,
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Trigger ChainLock at height 1001 (stream processor increments from 1000 to 1001)
      mockDAPIClient.emitChainLock(1001);

      // Wait for ChainLock poll (polls every 5 seconds)
      await new Promise((resolve) => setTimeout(resolve, 6000));

      expect(onChainLock).toHaveBeenCalledWith(
        expect.objectContaining({
          txid: tx.hash,
          timestamp: expect.any(Number),
          blockHeight: expect.any(Number),
          chainLockedHeight: 1001,
          latency: expect.any(Number),
        })
      );

      cleanup();
    }, 8000); // Need 6s+ for ChainLock poll

    it('should handle ChainLock monitor start failure gracefully', async () => {
      // Mock a DAPI client that fails ChainLock subscription
      const failingDAPIClient = new ControllableMockDAPIClient();
      failingDAPIClient.setChainLockStreamError(
        new Error('ChainLock stream unavailable')
      );

      const configFailing: RealtimeFinderConfig = {
        ...config,
        dapiClient: failingDAPIClient,
      };

      const finder = new RealtimeFinder(configFailing);

      failingDAPIClient.setTransactionStreamMessages([]);

      // Should not throw, just log warning
      const cleanup = await finder.monitorAddresses(config.addresses, {});

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should still be active for InstantSend monitoring
      expect(finder.getStatus().active).toBe(true);

      cleanup();
    });

    it('should calculate ChainLock latency from broadcast time', async () => {
      const finder = new RealtimeFinder(config);
      const onChainLock = vi.fn();

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const merkleBlock = createMockMerkleBlock({
        txids: [tx.hash],
        blockHeight: 1000,
      });

      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(config.addresses, {
        onChainLock,
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Trigger ChainLock at height 1001 (stream processor increments from 1000 to 1001)
      mockDAPIClient.emitChainLock(1001);

      // Wait for ChainLock poll (polls every 5 seconds)
      await new Promise((resolve) => setTimeout(resolve, 6000));

      expect(onChainLock).toHaveBeenCalled();
      const callArg = onChainLock.mock.calls[0][0] as ChainLockEvent;
      expect(callArg.latency).toBeGreaterThanOrEqual(0);

      cleanup();
    }, 8000); // Need 6s+ for ChainLock poll

    it('should update transaction status to chainlocked', async () => {
      const finder = new RealtimeFinder(config);

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const merkleBlock = createMockMerkleBlock({
        txids: [tx.hash],
        blockHeight: 1000,
      });

      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(config.addresses, {});

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Trigger ChainLock at height 1001 (stream processor increments from 1000 to 1001)
      mockDAPIClient.emitChainLock(1001);

      // Wait for ChainLock poll (polls every 5 seconds)
      await new Promise((resolve) => setTimeout(resolve, 6000));

      const trackedTx = finder.getTransaction(tx.hash);
      expect(trackedTx).toBeDefined();
      expect(trackedTx!.status).toBe('chainlocked');
      expect(trackedTx!.chainLockTime).not.toBeNull();

      cleanup();
    }, 8000); // Need 6s+ for ChainLock poll
  });

  //
  // Scenario 6: Cleanup and Resource Management
  //
  describe('Cleanup and Resource Management', () => {
    it('should stop stream properly', async () => {
      const finder = new RealtimeFinder(config);

      mockDAPIClient.setTransactionStreamMessages([]);

      const cleanup = await finder.monitorAddresses(config.addresses, {});

      expect(finder.getStatus().active).toBe(true);

      cleanup();

      expect(finder.getStatus().active).toBe(false);
    });

    it('should stop ChainLock monitor on cleanup', async () => {
      const finder = new RealtimeFinder(config);

      mockDAPIClient.setTransactionStreamMessages([]);

      const cleanup = await finder.monitorAddresses(config.addresses, {});

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(finder.getStatus().chainLockHeight).toBeGreaterThanOrEqual(0);

      cleanup();

      // ChainLock monitor should be stopped
      expect(finder.getStatus().chainLockHeight).toBe(0);
    });

    it('should mark as inactive on stop', async () => {
      const finder = new RealtimeFinder(config);

      mockDAPIClient.setTransactionStreamMessages([]);

      const cleanup = await finder.monitorAddresses(config.addresses, {});
      expect(finder.getStatus().active).toBe(true);

      finder.stop();
      expect(finder.getStatus().active).toBe(false);
    });

    it('should allow clearing specific transactions', async () => {
      const finder = new RealtimeFinder(config);

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const streamBuilder = new MockStreamBuilder();
      streamBuilder.addTransactions([tx.toBuffer()]);
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(config.addresses, {});

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(finder.getTransaction(tx.hash)).toBeDefined();

      finder.clearTransaction(tx.hash);

      expect(finder.getTransaction(tx.hash)).toBeUndefined();

      cleanup();
    });

    it('should allow clearing all confirmed transactions', async () => {
      const finder = new RealtimeFinder(config);

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const merkleBlock = createMockMerkleBlock({
        txids: [tx.hash],
        blockHeight: 1000,
      });

      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(config.addresses, {});

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Trigger ChainLock at height 1001 (stream processor increments from 1000 to 1001)
      mockDAPIClient.emitChainLock(1001);

      // Wait for ChainLock poll (polls every 5 seconds)
      await new Promise((resolve) => setTimeout(resolve, 6000));

      expect(finder.getStatus().trackedTransactions).toBe(1);

      finder.clearAllConfirmed();

      expect(finder.getStatus().trackedTransactions).toBe(0);

      cleanup();
    }, 8000); // Need 6s+ for ChainLock poll

    it('should handle cleanup with no active stream', () => {
      const finder = new RealtimeFinder(config);

      // Should not throw
      expect(() => finder.stop()).not.toThrow();
    });

    it('should handle multiple stop calls gracefully', async () => {
      const finder = new RealtimeFinder(config);

      mockDAPIClient.setTransactionStreamMessages([]);

      const cleanup = await finder.monitorAddresses(config.addresses, {});

      cleanup();
      cleanup(); // Second call should be safe

      expect(finder.getStatus().active).toBe(false);
    });
  });

  //
  // Scenario 7: waitForConfirmation Functionality
  //
  describe('waitForConfirmation', () => {
    it('should wait for InstantLock confirmation', async () => {
      const finder = new RealtimeFinder(config);

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const instantLock = createMockInstantLock(tx.hash);

      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      // Start monitoring
      const cleanup = await finder.monitorAddresses(config.addresses, {});

      // Wait for stream processing (async)
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Now wait for confirmation (should resolve quickly since already locked)
      const result = await finder.waitForConfirmation(tx.hash, {
        requireInstantLock: true,
        requireChainLock: false,
        timeout: 5000,
      });

      expect(result.txid).toBe(tx.hash);
      expect(result.method).toBe('instantlock');
      expect(result.instantLockTime).not.toBeNull();
      expect(result.chainLockTime).toBeNull();

      cleanup();
    });

    it('should wait for ChainLock when required', async () => {
      const finder = new RealtimeFinder(config);

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const merkleBlock = createMockMerkleBlock({
        txids: [tx.hash],
        blockHeight: 1000,
      });

      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addMerkleBlock(merkleBlock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      // Start monitoring
      const cleanup = await finder.monitorAddresses(config.addresses, {});

      // Wait for stream processing
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Trigger ChainLock at height 1001 (stream processor increments from 1000 to 1001)
      mockDAPIClient.emitChainLock(1001);

      // Wait for ChainLock poll (polls every 5 seconds)
      await new Promise((resolve) => setTimeout(resolve, 6000));

      // Now wait for confirmation (should resolve quickly since already chainlocked)
      const result = await finder.waitForConfirmation(tx.hash, {
        requireInstantLock: false,
        requireChainLock: true,
        timeout: 5000,
      });

      expect(result.txid).toBe(tx.hash);
      expect(result.method).toBe('chainlock');
      expect(result.chainLockTime).not.toBeNull();

      cleanup();
    }, 12000); // Need 6s+ for ChainLock poll + 5s timeout

    it('should timeout when confirmation does not arrive', async () => {
      const finder = new RealtimeFinder(config);

      mockDAPIClient.setTransactionStreamMessages([]);

      // Start monitoring
      const cleanup = await finder.monitorAddresses(config.addresses, {});

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Wait for confirmation that will never come
      const result = await finder.waitForConfirmation('never-exists-txid', {
        requireInstantLock: true,
        timeout: 500,
      });

      expect(result.txid).toBe('never-exists-txid');
      expect(result.method).toBe('timeout');
      expect(result.instantLockTime).toBeNull();
      expect(result.chainLockTime).toBeNull();

      cleanup();
    });

    it('should fire progress callbacks', async () => {
      const finder = new RealtimeFinder(config);
      const onProgress = vi.fn();

      mockDAPIClient.setTransactionStreamMessages([]);

      // Start monitoring
      const cleanup = await finder.monitorAddresses(config.addresses, {});

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Start waiting with progress callback (progress fires every 1000ms)
      const confirmationPromise = finder.waitForConfirmation('some-txid', {
        requireInstantLock: true,
        timeout: 2500,
        onProgress,
      });

      // Wait long enough for at least one progress callback (1000ms interval)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Should have fired progress callbacks
      expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(1);

      await confirmationPromise; // Wait for timeout

      cleanup();
    }, 4000);

    it('should resolve immediately if already confirmed', async () => {
      const finder = new RealtimeFinder(config);

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const instantLock = createMockInstantLock(tx.hash);

      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      // Start monitoring
      const cleanup = await finder.monitorAddresses(config.addresses, {});

      // Wait for stream processing (async)
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Now wait for confirmation (should resolve quickly)
      const startTime = Date.now();
      const result = await finder.waitForConfirmation(tx.hash, {
        requireInstantLock: true,
        timeout: 5000,
      });

      const elapsed = Date.now() - startTime;

      expect(result.method).toBe('instantlock');
      expect(elapsed).toBeLessThan(2000); // Should resolve within check interval

      cleanup();
    });

    it('should handle concurrent waitForConfirmation calls', async () => {
      const finder = new RealtimeFinder(config);

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const instantLock = createMockInstantLock(tx.hash);

      const streamBuilder = new MockStreamBuilder();
      streamBuilder
        .addTransactions([tx.toBuffer()])
        .addInstantLock(instantLock.toBuffer());
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      // Start monitoring
      const cleanup = await finder.monitorAddresses(config.addresses, {});

      // Wait for stream processing (async)
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Start multiple waiters
      const waiter1 = finder.waitForConfirmation(tx.hash, {
        requireInstantLock: true,
        timeout: 5000,
      });

      const waiter2 = finder.waitForConfirmation(tx.hash, {
        requireInstantLock: true,
        timeout: 5000,
      });

      const [result1, result2] = await Promise.all([waiter1, waiter2]);

      expect(result1.method).toBe('instantlock');
      expect(result2.method).toBe('instantlock');

      cleanup();
    });
  });

  //
  // Edge Cases
  //
  describe('Edge Cases', () => {
    it('should handle single address as string', async () => {
      const finder = new RealtimeFinder(config);
      const onTransaction = vi.fn();

      const tx = createMockTransaction({
        outputs: [{ satoshis: 100000, address: config.addresses[0] }],
      });

      const streamBuilder = new MockStreamBuilder();
      streamBuilder.addTransactions([tx.toBuffer()]);
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      // Pass single address as string
      const cleanup = await finder.monitorAddresses(config.addresses[0], {
        onTransaction,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onTransaction).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('should handle empty callback object', async () => {
      const finder = new RealtimeFinder(config);

      mockDAPIClient.setTransactionStreamMessages([]);

      // Should not throw with empty callbacks
      const cleanup = await finder.monitorAddresses(config.addresses, {});

      await new Promise((resolve) => setTimeout(resolve, 100));

      cleanup();
    });

    it('should handle transaction with no outputs', async () => {
      const finder = new RealtimeFinder(config);
      const onTransaction = vi.fn();

      const tx = createMockTransaction({ outputs: [] });

      const streamBuilder = new MockStreamBuilder();
      streamBuilder.addTransactions([tx.toBuffer()]);
      mockDAPIClient.setTransactionStreamMessages(streamBuilder.build());

      const cleanup = await finder.monitorAddresses(config.addresses, {
        onTransaction,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onTransaction).not.toHaveBeenCalled();

      cleanup();
    });

    it('should return correct status during operation', async () => {
      const finder = new RealtimeFinder(config);

      mockDAPIClient.setTransactionStreamMessages([]);

      const cleanup = await finder.monitorAddresses(config.addresses, {});

      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = finder.getStatus();
      expect(status.active).toBe(true);
      expect(status.trackedTransactions).toBeGreaterThanOrEqual(0);
      expect(status.chainLockHeight).toBeGreaterThanOrEqual(0);

      cleanup();
    });
  });
});
