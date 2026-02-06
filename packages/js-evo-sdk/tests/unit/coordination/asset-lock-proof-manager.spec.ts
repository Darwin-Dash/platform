/**
 * Unit tests for AssetLockProofManager
 *
 * Tests InstantSend/ChainLock confirmation tracking and asset lock proof creation.
 * The manager delegates to monitor.waitForConfirmation() from TransactionFinder.
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import {
  createMockWasmSdk,
  generateMockTxId,
  generateMockSignature,
  generateMockBlockHash,
} from '../../setup';
import { AssetLockProofManager } from '../../../src/identities/coordination/asset-lock-proof-manager.js';

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

// Mock TransactionFinder/Monitor that simulates waitForConfirmation() responses
const createMockMonitor = (options: {
  confirmationMethod?: 'instantlock' | 'chainlock' | 'timeout';
  instantLockHex?: string | null;
  blockHeight?: number | null;
  chainLockHeight?: number;
  trackedTxInstantLockHex?: string | null;
  trackedTxChainLockBlockHeight?: number | null;
} = {}) => {
  const {
    confirmationMethod = 'instantlock',
    instantLockHex = generateMockSignature(),
    blockHeight = 920001,
    chainLockHeight = 920000,
    trackedTxInstantLockHex,
    trackedTxChainLockBlockHeight,
  } = options;

  return {
    // waitForConfirmation() - the primary delegation target
    waitForConfirmation: vi.fn().mockResolvedValue({
      txid: 'mock-txid',
      method: confirmationMethod,
      instantLockTime: confirmationMethod === 'instantlock' ? Date.now() : null,
      chainLockTime: confirmationMethod === 'chainlock' ? Date.now() : null,
      blockHeight: blockHeight,
      totalLatencyMs: 1500,
      instantLockHex: confirmationMethod === 'instantlock' ? instantLockHex : null,
    }),

    // getTransaction() - used for re-checking tracker after poller IS detection
    getTransaction: vi.fn().mockReturnValue({
      txid: 'mock-txid',
      instantLockHex: trackedTxInstantLockHex ?? null,
      chainLockBlockHeight: trackedTxChainLockBlockHeight ?? null,
      status: 'pending',
    }),

    // getStatus() - used for initial logging and timeout fallback
    getStatus: vi.fn().mockReturnValue({
      active: true,
      chainLockHeight,
      addresses: [],
      transactionCount: 0,
    }),

    // Event handling (for compatibility)
    on: vi.fn(),
    off: vi.fn(),
    stop: vi.fn(),
  };
};

describe('AssetLockProofManager', () => {
  let proofManager: AssetLockProofManager;
  let mockSDK: ReturnType<typeof createMockSDK>;
  let monitor: ReturnType<typeof createMockMonitor>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSDK = createMockSDK();
    proofManager = new AssetLockProofManager(mockSDK);
    monitor = createMockMonitor();
  });

  describe('waitForConfirmation()', () => {
    it('returns InstantLock proof when instantLockHex is available', async () => {
      const txId = generateMockTxId();
      const txHex = '0100000001...';
      const isHex = generateMockSignature();

      monitor = createMockMonitor({
        confirmationMethod: 'instantlock',
        instantLockHex: isHex,
      });

      const result = await proofManager.waitForConfirmation(
        monitor as any,
        txId,
        txHex,
        ['yTestAddress123456789012345']
      );

      expect(result.proofType).toBe('instant');
      expect(result.instantLockHex).toBe(isHex);
      expect(result.coreChainLockedHeight).toBeNull();
    });

    it('returns ChainLock proof when method is chainlock', async () => {
      monitor = createMockMonitor({
        confirmationMethod: 'chainlock',
        blockHeight: 920005,
      });

      const txId = generateMockTxId();
      const txHex = '0100000001...';

      const result = await proofManager.waitForConfirmation(
        monitor as any,
        txId,
        txHex,
        ['yTestAddress123456789012345']
      );

      expect(result.proofType).toBe('chain');
      expect(result.instantLockHex).toBeNull();
      expect(result.coreChainLockedHeight).toBe(920005);
    });

    it('prefers InstantLock over ChainLock when both available', async () => {
      const isHex = generateMockSignature();
      monitor = createMockMonitor({
        confirmationMethod: 'instantlock',
        instantLockHex: isHex,
      });

      const result = await proofManager.waitForConfirmation(
        monitor as any,
        generateMockTxId(),
        '0100000001...',
        ['yTestAddress123456789012345']
      );

      expect(result.proofType).toBe('instant');
    });

    it('throws error on timeout with no confirmation', async () => {
      monitor = createMockMonitor({
        confirmationMethod: 'timeout',
        blockHeight: null,
        chainLockHeight: 0,
      });
      // getTransaction returns no CL data either
      monitor.getTransaction = vi.fn().mockReturnValue({
        txid: 'mock-txid',
        instantLockHex: null,
        chainLockBlockHeight: null,
        status: 'pending',
      });
      // getStatus returns no chain lock height
      monitor.getStatus = vi.fn().mockReturnValue({
        active: true,
        chainLockHeight: 0,
        addresses: [],
        transactionCount: 0,
      });

      const txId = generateMockTxId();

      await expect(proofManager.waitForConfirmation(
        monitor as any,
        txId,
        '0100000001...',
        ['yTestAddress123456789012345']
      )).rejects.toThrow('Asset lock proof creation failed');
    });

    it('includes transaction ID in result', async () => {
      const txId = generateMockTxId();

      const result = await proofManager.waitForConfirmation(
        monitor as any,
        txId,
        '0100000001...',
        []
      );

      expect(result.transactionId).toBe(txId);
    });

    it('includes transaction hex in result', async () => {
      const txId = generateMockTxId();
      const txHex = '0100000001abcdef...';

      const result = await proofManager.waitForConfirmation(
        monitor as any,
        txId,
        txHex,
        []
      );

      expect(result.transactionHex).toBe(txHex);
    });
  });

  describe('InstantLock detection', () => {
    it('delegates to monitor.waitForConfirmation()', async () => {
      const txId = generateMockTxId();

      await proofManager.waitForConfirmation(
        monitor as any,
        txId,
        '0100000001...',
        []
      );

      expect(monitor.waitForConfirmation).toHaveBeenCalledWith(
        txId,
        expect.objectContaining({
          requireInstantLock: true,
          requireChainLock: false,
        })
      );
    });

    it('returns correct InstantLock hex from confirmation result', async () => {
      const expectedInstantLockHex = generateMockSignature();
      monitor = createMockMonitor({
        confirmationMethod: 'instantlock',
        instantLockHex: expectedInstantLockHex,
      });

      const result = await proofManager.waitForConfirmation(
        monitor as any,
        generateMockTxId(),
        '0100000001...',
        []
      );

      expect(result.instantLockHex).toBe(expectedInstantLockHex);
    });

    it('falls back to tracker when IS confirmed by poller without hex', async () => {
      const expectedHex = generateMockSignature();

      // Poller detected IS but no raw hex in the ConfirmationResult
      monitor = createMockMonitor({
        confirmationMethod: 'instantlock',
        instantLockHex: null,
        trackedTxInstantLockHex: expectedHex,
      });

      const result = await proofManager.waitForConfirmation(
        monitor as any,
        generateMockTxId(),
        '0100000001...',
        []
      );

      // Should have found it in the tracker
      expect(result.proofType).toBe('instant');
      expect(result.instantLockHex).toBe(expectedHex);
    });

    it('falls back to ChainLock when IS has no hex and tracker has none', async () => {
      // First call: IS without hex. Second call: ChainLock.
      monitor = createMockMonitor({
        confirmationMethod: 'instantlock',
        instantLockHex: null,
        blockHeight: 920005,
      });
      // tracker also has no hex
      monitor.getTransaction = vi.fn().mockReturnValue({
        txid: 'mock-txid',
        instantLockHex: null,
        chainLockBlockHeight: null,
        status: 'instantlocked',
      });
      // Second waitForConfirmation call returns ChainLock
      let callCount = 0;
      monitor.waitForConfirmation = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            txid: 'mock-txid',
            method: 'instantlock',
            instantLockTime: Date.now(),
            chainLockTime: null,
            blockHeight: 920005,
            totalLatencyMs: 1500,
            instantLockHex: null, // No raw proof
          });
        }
        return Promise.resolve({
          txid: 'mock-txid',
          method: 'chainlock',
          instantLockTime: null,
          chainLockTime: Date.now(),
          blockHeight: 920005,
          totalLatencyMs: 30000,
          instantLockHex: null,
        });
      });

      const result = await proofManager.waitForConfirmation(
        monitor as any,
        generateMockTxId(),
        '0100000001...',
        []
      );

      expect(result.proofType).toBe('chain');
      expect(result.coreChainLockedHeight).toBe(920005);
      // Should have called waitForConfirmation twice
      expect(monitor.waitForConfirmation).toHaveBeenCalledTimes(2);
    });
  });

  describe('ChainLock detection', () => {
    it('uses blockHeight from confirmation result', async () => {
      monitor = createMockMonitor({
        confirmationMethod: 'chainlock',
        blockHeight: 920010,
      });

      const result = await proofManager.waitForConfirmation(
        monitor as any,
        generateMockTxId(),
        '0100000001...',
        []
      );

      expect(result.proofType).toBe('chain');
      expect(result.coreChainLockedHeight).toBe(920010);
    });

    it('waits for Platform sync before returning ChainLock proof', async () => {
      monitor = createMockMonitor({
        confirmationMethod: 'chainlock',
        blockHeight: 920005,
      });

      await proofManager.waitForConfirmation(
        monitor as any,
        generateMockTxId(),
        '0100000001...',
        []
      );

      // Platform sync should have been called
      expect(mockSDK.epoch.epochsInfo).toHaveBeenCalled();
    });
  });

  describe('Monitor interaction', () => {
    it('calls monitor.waitForConfirmation() with txid', async () => {
      const txId = generateMockTxId();

      await proofManager.waitForConfirmation(
        monitor as any,
        txId,
        '0100000001...',
        []
      );

      expect(monitor.waitForConfirmation).toHaveBeenCalledWith(
        txId,
        expect.any(Object)
      );
    });

    it('queries monitor status for initial logging', async () => {
      await proofManager.waitForConfirmation(
        monitor as any,
        generateMockTxId(),
        '0100000001...',
        []
      );

      expect(monitor.getStatus).toHaveBeenCalled();
    });
  });

  describe('Timeout fallback', () => {
    it('uses ChainLock height from tracker on timeout', async () => {
      monitor = createMockMonitor({
        confirmationMethod: 'timeout',
        blockHeight: null,
        chainLockHeight: 920050,
      });
      monitor.getTransaction = vi.fn().mockReturnValue({
        txid: 'mock-txid',
        instantLockHex: null,
        chainLockBlockHeight: 920050,
        status: 'pending',
      });

      const result = await proofManager.waitForConfirmation(
        monitor as any,
        generateMockTxId(),
        '0100000001...',
        []
      );

      expect(result.proofType).toBe('chain');
      expect(result.coreChainLockedHeight).toBe(920050);
    });

    it('uses monitor status chainLockHeight as last resort on timeout', async () => {
      monitor = createMockMonitor({
        confirmationMethod: 'timeout',
        blockHeight: null,
        chainLockHeight: 920030,
      });
      monitor.getTransaction = vi.fn().mockReturnValue({
        txid: 'mock-txid',
        instantLockHex: null,
        chainLockBlockHeight: null,
        status: 'pending',
      });

      const result = await proofManager.waitForConfirmation(
        monitor as any,
        generateMockTxId(),
        '0100000001...',
        []
      );

      expect(result.proofType).toBe('chain');
      expect(result.coreChainLockedHeight).toBe(920030);
    });
  });

  describe('Error scenarios', () => {
    it('wraps monitor errors in descriptive message', async () => {
      monitor.waitForConfirmation = vi.fn().mockRejectedValue(
        new Error('Monitor error')
      );

      await expect(proofManager.waitForConfirmation(
        monitor as any,
        generateMockTxId(),
        '0100000001...',
        []
      )).rejects.toThrow('Asset lock proof creation failed');
    });

    it('handles monitor getStatus throwing error', async () => {
      monitor.getStatus = vi.fn().mockImplementation(() => {
        throw new Error('Status error');
      });

      await expect(proofManager.waitForConfirmation(
        monitor as any,
        generateMockTxId(),
        '0100000001...',
        []
      )).rejects.toThrow('Asset lock proof creation failed');
    });
  });
});
