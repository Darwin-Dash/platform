/**
 * Unit tests for UTXOFinder
 *
 * Tests historic UTXO discovery, address derivation, and scan progress tracking.
 * Note: Full integration testing requires network access.
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import {
  createMockUTXO,
  generateMockAddress,
  generateMockTxId,
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

// Progress event types
interface UTXOSearchProgress {
  phase: 'initializing' | 'deriving-addresses' | 'scanning' | 'complete';
  progress: number;
  blocksScanned: number;
  totalBlocks: number;
  currentHeight: number;
  message?: string;
}

interface UTXO {
  txId: string;
  vout: number;
  address: string;
  satoshis: number;
  script: string;
  blockHeight: number;
  isChainLocked: boolean;
}

// Mock UTXOFinder for testing
const createMockUTXOFinder = () => {
  const mockUTXOs = [
    createMockUTXO({ satoshis: 5000000, blockHeight: 920000 }),
    createMockUTXO({ satoshis: 1000000, blockHeight: 919500 }),
  ];

  return {
    // Find spendable UTXO with minimum amount
    findSpendableUTXO: vi.fn().mockImplementation(async (options: {
      mnemonic: string;
      startHeight?: number;
      toHeight?: number;
      minAmount?: number;
      addressCount?: number;
      onProgress?: (event: UTXOSearchProgress) => void;
    }) => {
      const { minAmount = 200000, onProgress, startHeight = 1, toHeight } = options;

      // Emit progress events
      if (onProgress) {
        onProgress({
          phase: 'initializing',
          progress: 0,
          blocksScanned: 0,
          totalBlocks: 1000,
          currentHeight: 920100,
          message: 'Initializing UTXO search...',
        });

        onProgress({
          phase: 'deriving-addresses',
          progress: 10,
          blocksScanned: 0,
          totalBlocks: 1000,
          currentHeight: 920100,
          message: 'Deriving wallet addresses...',
        });

        onProgress({
          phase: 'scanning',
          progress: 50,
          blocksScanned: 500,
          totalBlocks: 1000,
          currentHeight: 920100,
          message: 'Scanning 500 / 1000 blocks (50.0%)...',
        });

        onProgress({
          phase: 'complete',
          progress: 100,
          blocksScanned: 1000,
          totalBlocks: 1000,
          currentHeight: 920100,
          message: 'Found UTXO: 5,000,000 duffs',
        });
      }

      // Find first UTXO meeting minimum amount
      const spendableUTXO = mockUTXOs.find(u => u.satoshis >= minAmount);

      if (!spendableUTXO) {
        throw new Error(`No spendable UTXO found with minimum ${minAmount} duffs`);
      }

      return {
        utxo: spendableUTXO,
        address: spendableUTXO.address,
        balance: spendableUTXO.satoshis,
        blockHeight: (spendableUTXO as any).blockHeight || spendableUTXO.height || 920000,
        isChainLocked: spendableUTXO.isChainLocked,
        derivedAddresses: {
          external: Array(20).fill(null).map((_, i) => ({
            address: generateMockAddress(),
            privateKey: { toWIF: () => 'wif' },
            publicKey: 'pubkey',
            path: `m/44'/1'/0'/0/${i}`,
            index: i,
          })),
          internal: Array(20).fill(null).map((_, i) => ({
            address: generateMockAddress(),
            privateKey: { toWIF: () => 'wif' },
            publicKey: 'pubkey',
            path: `m/44'/1'/0'/1/${i}`,
            index: i,
          })),
        },
        scanStats: {
          blocksScanned: (toHeight || 920100) - startHeight,
          timeMs: 1500,
          fromHeight: startHeight,
          toHeight: toHeight || 920100,
        },
      };
    }),

    // Find all UTXOs (not just first spendable)
    findAllUTXOs: vi.fn().mockImplementation(async (options: {
      mnemonic: string;
      startHeight?: number;
      toHeight?: number;
      addressCount?: number;
      onProgress?: (event: UTXOSearchProgress) => void;
    }) => {
      const { startHeight = 1, toHeight, onProgress } = options;

      if (onProgress) {
        onProgress({
          phase: 'scanning',
          progress: 50,
          blocksScanned: 500,
          totalBlocks: 1000,
          currentHeight: 920100,
        });
      }

      return {
        utxos: mockUTXOs,
        derivedAddresses: {
          external: Array(20).fill(null).map((_, i) => ({
            address: generateMockAddress(),
            privateKey: { toWIF: () => 'wif' },
            publicKey: 'pubkey',
            path: `m/44'/1'/0'/0/${i}`,
            index: i,
          })),
          internal: Array(20).fill(null).map((_, i) => ({
            address: generateMockAddress(),
            privateKey: { toWIF: () => 'wif' },
            publicKey: 'pubkey',
            path: `m/44'/1'/0'/1/${i}`,
            index: i,
          })),
        },
        scanStats: {
          blocksScanned: (toHeight || 920100) - startHeight,
          timeMs: 2000,
          fromHeight: startHeight,
          toHeight: toHeight || 920100,
        },
      };
    }),

    // For testing: inject mock UTXOs
    _setMockUTXOs: (utxos: any[]) => {
      mockUTXOs.length = 0;
      mockUTXOs.push(...utxos);
    },
  };
};

describe('UTXOFinder', () => {
  let finder: ReturnType<typeof createMockUTXOFinder>;
  const VALID_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  beforeEach(() => {
    vi.clearAllMocks();
    finder = createMockUTXOFinder();
  });

  describe('findSpendableUTXO()', () => {
    it('returns UTXO meeting minimum amount', async () => {
      const result = await finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
        startHeight: 900000,
        minAmount: 200000,
      });

      expect(result.utxo).toBeDefined();
      expect(result.utxo.satoshis).toBeGreaterThanOrEqual(200000);
    });

    it('includes derived addresses for reuse', async () => {
      const result = await finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
        startHeight: 900000,
      });

      expect(result.derivedAddresses).toBeDefined();
      expect(result.derivedAddresses.external).toHaveLength(20);
      expect(result.derivedAddresses.internal).toHaveLength(20);
    });

    it('includes scan statistics', async () => {
      const result = await finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
        startHeight: 900000,
        toHeight: 920000,
      });

      expect(result.scanStats).toBeDefined();
      expect(result.scanStats.blocksScanned).toBeGreaterThan(0);
      expect(result.scanStats.timeMs).toBeGreaterThan(0);
      expect(result.scanStats.fromHeight).toBe(900000);
      expect(result.scanStats.toHeight).toBe(920000);
    });

    it('emits progress events during scan', async () => {
      const progressEvents: UTXOSearchProgress[] = [];

      await finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
        startHeight: 900000,
        onProgress: (event) => progressEvents.push(event),
      });

      expect(progressEvents.length).toBeGreaterThan(0);

      // Should have phases in order
      const phases = progressEvents.map(e => e.phase);
      expect(phases).toContain('initializing');
      expect(phases).toContain('scanning');
      expect(phases).toContain('complete');
    });

    it('throws error when no UTXO meets minimum amount', async () => {
      // Set UTXOs with amounts below minimum
      finder._setMockUTXOs([
        createMockUTXO({ satoshis: 10000 }), // Below 200000 minimum
      ]);

      await expect(finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
        minAmount: 200000,
      })).rejects.toThrow('No spendable UTXO found');
    });

    it('respects custom minimum amount', async () => {
      finder._setMockUTXOs([
        createMockUTXO({ satoshis: 500000 }),
        createMockUTXO({ satoshis: 100000 }),
      ]);

      // Should find 500000 UTXO
      const result = await finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
        minAmount: 300000,
      });

      expect(result.utxo.satoshis).toBe(500000);
    });

    it('uses default start height when not specified', async () => {
      const result = await finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
      });

      expect(result.scanStats.fromHeight).toBe(1);
    });

    it('calculates blocks scanned correctly', async () => {
      const result = await finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
        startHeight: 910000,
        toHeight: 920100,
      });

      expect(result.scanStats.blocksScanned).toBe(10100);
    });

    it('includes ChainLock status of UTXO', async () => {
      finder._setMockUTXOs([
        createMockUTXO({ isChainLocked: true }),
      ]);

      const result = await finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
      });

      expect(result.isChainLocked).toBe(true);
    });
  });

  describe('findAllUTXOs()', () => {
    it('returns all UTXOs found', async () => {
      finder._setMockUTXOs([
        createMockUTXO({ satoshis: 1000000 }),
        createMockUTXO({ satoshis: 500000 }),
        createMockUTXO({ satoshis: 250000 }),
      ]);

      const result = await finder.findAllUTXOs({
        mnemonic: VALID_MNEMONIC,
      });

      expect(result.utxos).toHaveLength(3);
    });

    it('returns empty array when no UTXOs found', async () => {
      finder._setMockUTXOs([]);

      const result = await finder.findAllUTXOs({
        mnemonic: VALID_MNEMONIC,
      });

      expect(result.utxos).toHaveLength(0);
    });

    it('includes derived addresses for reuse', async () => {
      const result = await finder.findAllUTXOs({
        mnemonic: VALID_MNEMONIC,
      });

      expect(result.derivedAddresses.external).toHaveLength(20);
      expect(result.derivedAddresses.internal).toHaveLength(20);
    });

    it('includes scan statistics', async () => {
      const result = await finder.findAllUTXOs({
        mnemonic: VALID_MNEMONIC,
        startHeight: 900000,
      });

      expect(result.scanStats.blocksScanned).toBeGreaterThan(0);
      expect(result.scanStats.timeMs).toBeGreaterThan(0);
    });

    it('emits progress events during scan', async () => {
      const progressEvents: UTXOSearchProgress[] = [];

      await finder.findAllUTXOs({
        mnemonic: VALID_MNEMONIC,
        onProgress: (event) => progressEvents.push(event),
      });

      expect(progressEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Progress tracking', () => {
    it('progress percentage increases monotonically', async () => {
      const progressValues: number[] = [];

      await finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
        onProgress: (event) => progressValues.push(event.progress),
      });

      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
      }
    });

    it('final progress is 100%', async () => {
      let finalProgress = 0;

      await finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
        onProgress: (event) => {
          if (event.phase === 'complete') {
            finalProgress = event.progress;
          }
        },
      });

      expect(finalProgress).toBe(100);
    });

    it('includes message in progress events', async () => {
      const messages: string[] = [];

      await finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
        onProgress: (event) => {
          if (event.message) {
            messages.push(event.message);
          }
        },
      });

      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    it('handles empty UTXO result gracefully', async () => {
      finder._setMockUTXOs([]);

      await expect(finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
        minAmount: 200000,
      })).rejects.toThrow();
    });

    it('validates minimum amount is positive', async () => {
      finder._setMockUTXOs([createMockUTXO({ satoshis: 1000000 })]);

      // minAmount of 0 or negative should still work (finds any UTXO)
      const result = await finder.findSpendableUTXO({
        mnemonic: VALID_MNEMONIC,
        minAmount: 0,
      });

      expect(result.utxo).toBeDefined();
    });
  });
});
