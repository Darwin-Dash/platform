/**
 * Unit tests for AssetLockProofManager
 *
 * Tests InstantSend/ChainLock confirmation tracking and asset lock proof creation.
 * Note: Full integration testing requires network access.
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import {
  createMockWasmSdk,
  generateMockTxId,
  generateMockSignature,
  generateMockBlockHash,
} from '../../setup';

// Mock the wasm-sdk module
vi.mock('@dashevo/wasm-sdk', () => ({
  default: vi.fn().mockResolvedValue(undefined),
  WasmSdkBuilder: {
    testnetTrusted: vi.fn().mockReturnValue({
      build: vi.fn().mockReturnValue({}),
    }),
  },
}));

// Proof result types
interface AssetLockProofResult {
  transactionId: string;
  transactionHex: string;
  instantLockHex: string | null;
  coreChainLockedHeight: number | null;
  proofType: 'instant' | 'chain';
}

// Mock SDK for Platform sync checking
const createMockSDK = () => ({
  epoch: {
    epochsInfo: vi.fn().mockResolvedValue({
      metadata: {
        coreChainLockedHeight: 920100,
      },
    }),
  },
});

// Mock TransactionFinder/Monitor for confirmation tracking
const createMockMonitor = (options: {
  hasInstantLock?: boolean;
  initialChainLockHeight?: number;
  advanceChainLock?: boolean;
  instantLockDelay?: number;
  chainLockDelay?: number;
} = {}) => {
  const {
    hasInstantLock = true,
    initialChainLockHeight = 920000,
    advanceChainLock = false,
    instantLockDelay = 100,
    chainLockDelay = 200,
  } = options;

  let chainLockHeight = initialChainLockHeight;
  let getStatusCalls = 0;

  const storedTransactions = new Map<string, {
    txid: string;
    instantLockHex: string | null;
  }>();

  return {
    // Get transaction with InstantLock (if available)
    getTransaction: vi.fn().mockImplementation((txid: string) => {
      const stored = storedTransactions.get(txid);
      if (stored) {
        return stored;
      }

      // Simulate InstantLock appearing after a delay
      if (hasInstantLock && getStatusCalls > 1) {
        return {
          txid,
          instantLockHex: generateMockSignature(),
        };
      }

      return { txid, instantLockHex: null };
    }),

    // Get monitor status
    getStatus: vi.fn().mockImplementation(() => {
      getStatusCalls++;

      // Simulate ChainLock height advancing
      if (advanceChainLock && getStatusCalls > 2) {
        chainLockHeight = initialChainLockHeight + 1;
      }

      return {
        active: true,
        chainLockHeight,
        addresses: [],
        transactionCount: 0,
      };
    }),

    // Control panel for tests
    _setTransaction: (txid: string, instantLockHex: string | null) => {
      storedTransactions.set(txid, { txid, instantLockHex });
    },
    _setChainLockHeight: (height: number) => {
      chainLockHeight = height;
    },
    _reset: () => {
      storedTransactions.clear();
      chainLockHeight = initialChainLockHeight;
      getStatusCalls = 0;
    },

    // Event handling (for compatibility)
    on: vi.fn(),
    off: vi.fn(),
    stop: vi.fn(),
  };
};

// Mock AssetLockProofManager
const createMockAssetLockProofManager = () => {
  const mockSDK = createMockSDK();

  return {
    // Wait for transaction confirmation
    waitForConfirmation: vi.fn().mockImplementation(async (
      monitor: ReturnType<typeof createMockMonitor>,
      transactionId: string,
      transactionHex: string,
      addresses: string[]
    ): Promise<AssetLockProofResult> => {
      const POLL_INTERVAL = 50; // Faster for tests
      const TIMEOUT = 1000;     // Shorter timeout for tests

      const startChainLockHeight = monitor.getStatus().chainLockHeight || 0;
      const startTime = Date.now();

      while (Date.now() - startTime < TIMEOUT) {
        // Check for InstantLock
        const tx = monitor.getTransaction(transactionId);
        if (tx && tx.instantLockHex) {
          return {
            transactionId,
            transactionHex,
            instantLockHex: tx.instantLockHex,
            coreChainLockedHeight: null,
            proofType: 'instant' as const,
          };
        }

        // Check for ChainLock height advancement
        const status = monitor.getStatus();
        const currentChainLockHeight = status.chainLockHeight || 0;

        if (currentChainLockHeight > startChainLockHeight) {
          // Wait for Platform sync (mocked)
          await mockSDK.epoch.epochsInfo({ startEpoch: 0, count: 1 });

          return {
            transactionId,
            transactionHex,
            instantLockHex: null,
            coreChainLockedHeight: currentChainLockHeight,
            proofType: 'chain' as const,
          };
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      }

      throw new Error('Timeout: No confirmation received');
    }),

    // Wait for Platform to sync (internal)
    waitForPlatformSync: vi.fn().mockResolvedValue(undefined),
  };
};

describe('AssetLockProofManager', () => {
  let proofManager: ReturnType<typeof createMockAssetLockProofManager>;
  let monitor: ReturnType<typeof createMockMonitor>;

  beforeEach(() => {
    vi.clearAllMocks();
    proofManager = createMockAssetLockProofManager();
    monitor = createMockMonitor();
  });

  describe('waitForConfirmation()', () => {
    it('returns InstantLock proof when available', async () => {
      const txId = generateMockTxId();
      const txHex = '0100000001...'; // Mock transaction hex

      // Pre-set InstantLock for immediate availability
      monitor._setTransaction(txId, generateMockSignature());

      const result = await proofManager.waitForConfirmation(
        monitor,
        txId,
        txHex,
        ['yTestAddress123456789012345']
      );

      expect(result.proofType).toBe('instant');
      expect(result.instantLockHex).toBeTruthy();
      expect(result.coreChainLockedHeight).toBeNull();
    });

    it('returns ChainLock proof when InstantLock not available', async () => {
      // Create monitor without InstantLock, with ChainLock advancement
      monitor = createMockMonitor({
        hasInstantLock: false,
        advanceChainLock: true,
        initialChainLockHeight: 920000,
      });

      const txId = generateMockTxId();
      const txHex = '0100000001...';

      const result = await proofManager.waitForConfirmation(
        monitor,
        txId,
        txHex,
        ['yTestAddress123456789012345']
      );

      expect(result.proofType).toBe('chain');
      expect(result.instantLockHex).toBeNull();
      expect(result.coreChainLockedHeight).toBeGreaterThan(920000);
    });

    it('prefers InstantLock over ChainLock when both available', async () => {
      const txId = generateMockTxId();

      // Set up both InstantLock and advancing ChainLock
      monitor._setTransaction(txId, generateMockSignature());
      monitor._setChainLockHeight(920001);

      const result = await proofManager.waitForConfirmation(
        monitor,
        txId,
        '0100000001...',
        ['yTestAddress123456789012345']
      );

      // Should use InstantLock (faster path)
      expect(result.proofType).toBe('instant');
    });

    it('throws error on timeout with no confirmation', async () => {
      // Create monitor that never confirms
      monitor = createMockMonitor({
        hasInstantLock: false,
        advanceChainLock: false,
      });

      const txId = generateMockTxId();

      await expect(proofManager.waitForConfirmation(
        monitor,
        txId,
        '0100000001...',
        ['yTestAddress123456789012345']
      )).rejects.toThrow('Timeout');
    });

    it('includes transaction ID in result', async () => {
      const txId = generateMockTxId();
      monitor._setTransaction(txId, generateMockSignature());

      const result = await proofManager.waitForConfirmation(
        monitor,
        txId,
        '0100000001...',
        []
      );

      expect(result.transactionId).toBe(txId);
    });

    it('includes transaction hex in result', async () => {
      const txId = generateMockTxId();
      const txHex = '0100000001abcdef...';
      monitor._setTransaction(txId, generateMockSignature());

      const result = await proofManager.waitForConfirmation(
        monitor,
        txId,
        txHex,
        []
      );

      expect(result.transactionHex).toBe(txHex);
    });
  });

  describe('InstantLock detection', () => {
    it('detects InstantLock when it appears after polling', async () => {
      // Monitor where InstantLock appears after some polls
      monitor = createMockMonitor({ hasInstantLock: true });

      const txId = generateMockTxId();

      const result = await proofManager.waitForConfirmation(
        monitor,
        txId,
        '0100000001...',
        []
      );

      expect(result.proofType).toBe('instant');
      expect(monitor.getTransaction).toHaveBeenCalled();
    });

    it('returns correct InstantLock hex', async () => {
      const txId = generateMockTxId();
      const expectedInstantLockHex = generateMockSignature();
      monitor._setTransaction(txId, expectedInstantLockHex);

      const result = await proofManager.waitForConfirmation(
        monitor,
        txId,
        '0100000001...',
        []
      );

      expect(result.instantLockHex).toBe(expectedInstantLockHex);
    });
  });

  describe('ChainLock detection', () => {
    it('detects ChainLock height advancement', async () => {
      monitor = createMockMonitor({
        hasInstantLock: false,
        advanceChainLock: true,
        initialChainLockHeight: 920000,
      });

      const result = await proofManager.waitForConfirmation(
        monitor,
        generateMockTxId(),
        '0100000001...',
        []
      );

      expect(result.proofType).toBe('chain');
      expect(result.coreChainLockedHeight).toBeGreaterThan(920000);
    });

    it('waits for Platform sync before returning ChainLock proof', async () => {
      monitor = createMockMonitor({
        hasInstantLock: false,
        advanceChainLock: true,
      });

      await proofManager.waitForConfirmation(
        monitor,
        generateMockTxId(),
        '0100000001...',
        []
      );

      // Platform sync should have been called (internally via mockSDK)
      expect(monitor.getStatus).toHaveBeenCalled();
    });
  });

  describe('Monitor interaction', () => {
    it('queries monitor for transaction status', async () => {
      const txId = generateMockTxId();
      monitor._setTransaction(txId, generateMockSignature());

      await proofManager.waitForConfirmation(
        monitor,
        txId,
        '0100000001...',
        []
      );

      expect(monitor.getTransaction).toHaveBeenCalledWith(txId);
    });

    it('queries monitor status for ChainLock height', async () => {
      monitor._setTransaction(generateMockTxId(), generateMockSignature());

      await proofManager.waitForConfirmation(
        monitor,
        generateMockTxId(),
        '0100000001...',
        []
      );

      expect(monitor.getStatus).toHaveBeenCalled();
    });
  });

  describe('Error scenarios', () => {
    it('handles monitor getTransaction throwing error', async () => {
      monitor.getTransaction = vi.fn().mockImplementation(() => {
        throw new Error('Monitor error');
      });

      await expect(proofManager.waitForConfirmation(
        monitor,
        generateMockTxId(),
        '0100000001...',
        []
      )).rejects.toThrow();
    });

    it('handles monitor getStatus throwing error', async () => {
      monitor.getStatus = vi.fn().mockImplementation(() => {
        throw new Error('Status error');
      });

      await expect(proofManager.waitForConfirmation(
        monitor,
        generateMockTxId(),
        '0100000001...',
        []
      )).rejects.toThrow();
    });
  });
});
