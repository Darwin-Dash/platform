import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfirmationTracker } from '../../../src/monitoring/ConfirmationTracker.js';

/**
 * Creates a minimal mock DAPI client for ConfirmationTracker tests
 */
function createMockDAPIClient() {
  const statuses = new Map<string, { isInstantLocked: boolean; isChainLocked: boolean }>();
  let chainLockHeight = 100;

  return {
    statuses,
    setChainLockHeight(h: number) { chainLockHeight = h; },
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
    platform: {
      getEpochsInfo: vi.fn(async () => ({
        getMetadata: () => ({
          getCoreChainLockedHeight: () => chainLockHeight,
        }),
      })),
    },
  };
}

describe('ConfirmationTracker', () => {
  let mockClient: ReturnType<typeof createMockDAPIClient>;
  let tracker: ConfirmationTracker;

  beforeEach(() => {
    mockClient = createMockDAPIClient();
  });

  afterEach(() => {
    tracker?.stop();
  });

  describe('lifecycle', () => {
    it('should start and stop cleanly', async () => {
      tracker = new ConfirmationTracker(mockClient as any, {
        pollInterval: 1000,
        chainLockPollInterval: 5000,
      });

      expect(tracker.running()).toBe(false);

      await tracker.start();
      expect(tracker.running()).toBe(true);

      tracker.stop();
      expect(tracker.running()).toBe(false);
    });

    it('should not start twice', async () => {
      tracker = new ConfirmationTracker(mockClient as any);

      await tracker.start();
      await tracker.start(); // should be a no-op
      expect(tracker.running()).toBe(true);

      tracker.stop();
    });

    it('should handle ChainLock monitor start failure gracefully', async () => {
      // Make getEpochsInfo fail to simulate CL monitor start failure
      mockClient.platform.getEpochsInfo.mockRejectedValue(new Error('Platform unavailable'));

      tracker = new ConfirmationTracker(mockClient as any);

      // Should not throw - CL monitor failure is non-fatal
      await tracker.start();
      expect(tracker.running()).toBe(true);

      tracker.stop();
    });
  });

  describe('transaction registration', () => {
    it('should register and retrieve transactions', async () => {
      tracker = new ConfirmationTracker(mockClient as any);

      const txid = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';
      tracker.registerTransaction(txid);

      const tx = tracker.getTransaction(txid);
      expect(tx).toBeDefined();
      expect(tx!.txid).toBe(txid);
      expect(tx!.status).toBe('pending');
    });

    it('should return undefined for unregistered transactions', () => {
      tracker = new ConfirmationTracker(mockClient as any);
      expect(tracker.getTransaction('nonexistent')).toBeUndefined();
    });
  });

  describe('InstantLock detection via polling', () => {
    it('should detect IS and fire callback', async () => {
      const onIS = vi.fn();
      tracker = new ConfirmationTracker(mockClient as any, { pollInterval: 1000 });
      tracker.onInstantLock(onIS);

      const txid = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';
      tracker.registerTransaction(txid);
      mockClient.statuses.set(txid, { isInstantLocked: true, isChainLocked: false });

      await tracker.start();

      // Wait for a poll cycle
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(onIS).toHaveBeenCalledWith(txid, expect.any(Number));

      const tx = tracker.getTransaction(txid);
      expect(tx?.status).toBe('instantlocked');
    });
  });

  describe('ChainLock detection via polling', () => {
    it('should detect CL and fire callback', async () => {
      const onCL = vi.fn();
      tracker = new ConfirmationTracker(mockClient as any, { pollInterval: 1000 });
      tracker.onChainLock(onCL);

      const txid = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';
      tracker.registerTransaction(txid);
      mockClient.statuses.set(txid, { isInstantLocked: true, isChainLocked: true });

      await tracker.start();

      // Wait for a poll cycle
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(onCL).toHaveBeenCalledWith(txid, expect.any(Number));

      const tx = tracker.getTransaction(txid);
      expect(tx?.status).toBe('chainlocked');
    });
  });

  describe('ChainLock height tracking', () => {
    it('should report chain lock height', async () => {
      mockClient.setChainLockHeight(12345);
      tracker = new ConfirmationTracker(mockClient as any, {
        chainLockPollInterval: 1000,
      });

      await tracker.start();

      // After start, the CL monitor has polled once
      expect(tracker.getChainLockHeight()).toBe(12345);

      tracker.stop();
    });
  });

  describe('callback registration', () => {
    it('should work without callbacks registered', async () => {
      tracker = new ConfirmationTracker(mockClient as any, { pollInterval: 1000 });

      const txid = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';
      tracker.registerTransaction(txid);
      mockClient.statuses.set(txid, { isInstantLocked: true, isChainLocked: false });

      await tracker.start();

      // Wait for a poll cycle — should not throw without callbacks
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const tx = tracker.getTransaction(txid);
      expect(tx?.status).toBe('instantlocked');
    });
  });
});
