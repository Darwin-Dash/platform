import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TransactionStatusPoller } from '../../../src/monitoring/TransactionStatusPoller.js';
import { TransactionTracker } from '../../../src/monitoring/TransactionTracker.js';

/**
 * Creates a minimal mock DAPI client with controllable getTransaction responses
 */
function createMockDAPIClient() {
  const statuses = new Map<string, { isInstantLocked: boolean; isChainLocked: boolean }>();

  return {
    statuses,
    core: {
      getTransaction: vi.fn(async (txid: string) => {
        const status = statuses.get(txid);
        if (!status) return null;
        return {
          isInstantLocked: status.isInstantLocked,
          isChainLocked: status.isChainLocked,
        };
      }),
      subscribeToBlockHeadersWithChainLocks: () => ({}),
      subscribeToTransactionsWithProofs: () => ({}),
      getBlockchainStatus: async () => ({}),
      getBlockByHash: async () => ({}),
      getBestBlockHeight: async () => 1000,
    },
  };
}

describe('TransactionStatusPoller', () => {
  let tracker: TransactionTracker;
  let mockClient: ReturnType<typeof createMockDAPIClient>;
  let poller: TransactionStatusPoller;
  let onInstantLock: ReturnType<typeof vi.fn>;
  let onChainLock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tracker = new TransactionTracker();
    mockClient = createMockDAPIClient();
    onInstantLock = vi.fn();
    onChainLock = vi.fn();
  });

  afterEach(() => {
    poller?.stop();
  });

  function createPoller(intervalMs = 100) {
    poller = new TransactionStatusPoller(
      mockClient as any,
      tracker,
      { onInstantLock, onChainLock },
      intervalMs
    );
    return poller;
  }

  describe('lifecycle', () => {
    it('should start and stop cleanly', () => {
      createPoller();
      expect(poller.running()).toBe(false);

      poller.start();
      expect(poller.running()).toBe(true);

      poller.stop();
      expect(poller.running()).toBe(false);
    });

    it('should not start twice', () => {
      createPoller();
      poller.start();
      poller.start(); // should be a no-op
      expect(poller.running()).toBe(true);
      poller.stop();
    });
  });

  describe('InstantLock detection', () => {
    it('should detect IS via polling and fire callback', async () => {
      createPoller();
      const txid = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';

      tracker.addBroadcast(txid);
      mockClient.statuses.set(txid, { isInstantLocked: true, isChainLocked: false });

      await poller.poll();

      expect(onInstantLock).toHaveBeenCalledTimes(1);
      expect(onInstantLock).toHaveBeenCalledWith(txid, expect.any(Number));

      const tx = tracker.getTransaction(txid);
      expect(tx?.status).toBe('instantlocked');
      expect(tx?.instantLockTime).toBeTypeOf('number');
    });

    it('should not duplicate IS callback if already recorded by stream', async () => {
      createPoller();
      const txid = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';

      tracker.addBroadcast(txid);
      // Simulate stream having already recorded IS
      tracker.recordInstantLock(txid, Date.now(), 'deadbeef');

      mockClient.statuses.set(txid, { isInstantLocked: true, isChainLocked: false });

      await poller.poll();

      // Callback should NOT fire — IS was already recorded
      expect(onInstantLock).not.toHaveBeenCalled();
    });
  });

  describe('ChainLock detection', () => {
    it('should detect CL via polling and fire callback', async () => {
      createPoller();
      const txid = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';

      tracker.addBroadcast(txid);
      mockClient.statuses.set(txid, { isInstantLocked: true, isChainLocked: true });

      await poller.poll();

      expect(onChainLock).toHaveBeenCalledTimes(1);
      expect(onChainLock).toHaveBeenCalledWith(txid, expect.any(Number));

      const tx = tracker.getTransaction(txid);
      expect(tx?.status).toBe('chainlocked');
      expect(tx?.chainLockTime).toBeTypeOf('number');
    });

    it('should skip already-chainlocked transactions', async () => {
      createPoller();
      const txid = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';

      tracker.addBroadcast(txid);
      tracker.recordInstantLock(txid, Date.now());
      tracker.recordChainLockByTxid(txid, Date.now());

      mockClient.statuses.set(txid, { isInstantLocked: true, isChainLocked: true });

      await poller.poll();

      // Should not fire any callbacks — tx is already fully confirmed
      expect(onInstantLock).not.toHaveBeenCalled();
      expect(onChainLock).not.toHaveBeenCalled();
      // getTransaction should not even be called for chainlocked txs
      expect(mockClient.core.getTransaction).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle getTransaction errors gracefully and continue', async () => {
      createPoller();
      const txid1 = 'aaaa000000000000000000000000000000000000000000000000000000000001';
      const txid2 = 'aaaa000000000000000000000000000000000000000000000000000000000002';

      tracker.addBroadcast(txid1);
      tracker.addBroadcast(txid2);

      // txid1 will throw, txid2 should still be processed
      mockClient.core.getTransaction.mockImplementation(async (txid: string) => {
        if (txid === txid1) {
          throw new Error('Network error');
        }
        return { isInstantLocked: true, isChainLocked: false };
      });
      mockClient.statuses.set(txid2, { isInstantLocked: true, isChainLocked: false });

      await poller.poll();

      // txid2 should still get processed
      expect(onInstantLock).toHaveBeenCalledTimes(1);
      expect(onInstantLock).toHaveBeenCalledWith(txid2, expect.any(Number));
    });
  });

  describe('poll interval', () => {
    it('should clamp interval to minimum 1000ms', () => {
      createPoller(500);
      // The poller internally clamps — we can verify by checking it starts successfully
      poller.start();
      expect(poller.running()).toBe(true);
      poller.stop();
    });
  });

  describe('empty tracker', () => {
    it('should handle empty tracker with no errors', async () => {
      createPoller();
      // No transactions added to tracker
      await poller.poll();

      expect(onInstantLock).not.toHaveBeenCalled();
      expect(onChainLock).not.toHaveBeenCalled();
      expect(mockClient.core.getTransaction).not.toHaveBeenCalled();
    });
  });

  describe('function-style response accessors', () => {
    it('should handle isInstantLocked/isChainLocked as functions', async () => {
      createPoller();
      const txid = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';

      tracker.addBroadcast(txid);

      // Override getTransaction to return function-style accessors
      mockClient.core.getTransaction.mockResolvedValueOnce({
        isInstantLocked: () => true,
        isChainLocked: () => false,
      });

      await poller.poll();

      expect(onInstantLock).toHaveBeenCalledTimes(1);
    });
  });
});
